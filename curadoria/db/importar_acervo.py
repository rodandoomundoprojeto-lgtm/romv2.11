"""Importa o acervo real do portal Rodando o Mundo para a tabela `conteudos` no Supabase.

Fontes importadas:
  - data/editorial.js (EXPLICACOES, PAGINAS_TEMATICAS, RESUMO_DO_DIA, COMPARACOES, LINHAS_DO_TEMPO, ROM_INITIAL_HEADLINES)
  - data/feed_output.json (Radar Geopolítico / Editorial)

Uso:
    python -m curadoria.db.importar_acervo
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Set

import psycopg

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

ROOT_DIR = Path(__file__).resolve().parents[2]
EDITORIAL_JS = ROOT_DIR / "data" / "editorial.js"
FEED_OUTPUT_JSON = ROOT_DIR / "data" / "feed_output.json"

STOPWORDS = {
    "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "o", "a", "os", "as",
    "para", "por", "com", "um", "uma", "que", "se", "ao", "aos", "como", "mais", "mas", "ou",
    "sobre", "entre", "contra", "sem", "sob", "pelo", "pela", "pelos", "pelas", "qual", "quais",
    "seu", "sua", "seus", "suas", "foi", "são", "sao", "ser", "tem", "têm", "esta", "está",
    "este", "esse", "essa", "isso", "após", "apos", "ante", "até", "ate", "diz", "disse",
}

MAPA_CATEGORIA = {
    "politica": "Politica",
    "política": "Politica",
    "economia": "Economia",
    "economia & câmbio": "Economia",
    "cultura": "Cultura",
    "tecnologia": "Cultura",
    "saude": "Cultura",
    "esportes": "Cultura",
    "eleicoes": "Eleicoes",
    "eleições": "Eleicoes",
    "geopolitica": "Geopolitica_Radar",
    "mundo": "Geopolitica_Radar",
    "clima": "Geopolitica_Radar",
    "resumo": "Resumo_Ultimas",
    "all": "Resumo_Ultimas",
}


def mapear_categoria(raw_cat: str, rota_ou_id: str = "", titulo: str = "") -> str:
    r = (rota_ou_id or "").lower()
    t = (titulo or "").lower()
    c = (raw_cat or "").lower().strip()

    if "eleic" in r or "eleiç" in r or "eleic" in c or "eleição" in t or "eleições" in t or "segundo turno" in t:
        return "Eleicoes"
    if "economia" in r or "inflacao" in r or "selic" in r or "dolar" in r or "juros" in r or "tarifas" in r:
        return "Economia"
    if "guerra" in r or "clima" in r or "cop3" in r or "sancao" in r or "otan" in r or "geopolit" in c or "ucrania" in r:
        return "Geopolitica_Radar"
    if "cultura" in r or "tecnologia" in r:
        return "Cultura"
    if "politica" in r or "impeachment" in r or "orcamento" in r or "stf" in t or "congresso" in t:
        return "Politica"
    return MAPA_CATEGORIA.get(c, "Politica")


def extrair_tags(titulo: str, extras: List[str] = None) -> List[str]:
    tags: Set[str] = set()
    for item in (extras or []):
        if not item:
            continue
        limpo = str(item).strip().lower()
        if len(limpo) >= 2:
            tags.add(limpo)
    palavras = re.findall(r"[a-zà-ÿ0-9]{3,}", (titulo or "").lower())
    for p in palavras:
        if p not in STOPWORDS and len(p) >= 3:
            tags.add(p)
    return sorted(tags)[:15]


def carregar_editorial_js() -> Dict:
    if not EDITORIAL_JS.exists():
        return {}
    script_node = (
        "const fs = require('fs');"
        "global.window = {};"
        f"const code = fs.readFileSync({json.dumps(str(EDITORIAL_JS))}, 'utf8');"
        "eval(code);"
        "console.log(JSON.stringify({editorial: window.ROM_EDITORIAL, headlines: window.ROM_INITIAL_HEADLINES}));"
    )
    proc = subprocess.run(
        ["node", "-e", script_node],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
    )
    return json.loads(proc.stdout)


def coletar_itens_acervo() -> List[Dict]:
    itens_por_titulo: Dict[str, Dict] = {}

    def registrar(titulo: str, resumo: str, corpo: str, categoria: str, tags: List[str]):
        t = (titulo or "").strip()[:250]
        if not t or len(t) < 5:
            return
        r = (resumo or t).strip()
        b = (corpo or r).strip()
        itens_por_titulo[t] = {
            "titulo": t,
            "resumo": r,
            "corpo": b,
            "categoria": categoria,
            "tags": tags,
        }

    # 1. data/editorial.js
    dados_js = carregar_editorial_js()
    ed = dados_js.get("editorial") or {}
    assuntos_map = ed.get("assuntos") or {}

    # 1a. Explicações ("Entenda o assunto")
    for exp in (ed.get("listaExplicacoes") or []):
        titulo = exp.get("titulo", "")
        resumo = exp.get("resumo", "")
        paragrafos = exp.get("paragrafos") or exp.get("textoExplicativo") or []
        corpo = "\n\n".join(paragrafos) if isinstance(paragrafos, list) else str(paragrafos)
        termo_busca = exp.get("termoBusca", "")
        cat = mapear_categoria(exp.get("topicoContexto", ""), exp.get("slug", ""), titulo)
        extras = [w for w in termo_busca.split() if len(w) >= 3] + [exp.get("slug", "").replace("-", " ")]
        registrar(titulo, resumo, corpo, cat, extrair_tags(f"{titulo} {termo_busca}", extras))

    # 1b. Páginas Temáticas (Hubs)
    for rota, hub in (ed.get("paginasTematicas") or {}).items():
        titulo = hub.get("titulo", "")
        subtitulo = hub.get("subtitulo", "")
        res_ed = hub.get("resumoEditorial") or []
        corpo_partes = res_ed if isinstance(res_ed, list) else [str(res_ed)]
        for fq in (hub.get("perguntasFrequentes") or []):
            corpo_partes.append(f"{fq.get('pergunta', '')}: {fq.get('resposta', '')}")
        corpo = "\n\n".join([p for p in corpo_partes if p])
        termo_padrao = hub.get("termoBuscaPadrao") or hub.get("termoBusca") or ""
        assunto_id = hub.get("assuntoId") or ""
        palavras_assunto = (assuntos_map.get(assunto_id) or {}).get("palavrasChave") or []
        cat = mapear_categoria(hub.get("topico", ""), rota, titulo)
        extras = list(palavras_assunto) + [termo_padrao]
        registrar(titulo, subtitulo, corpo, cat, extrair_tags(f"{titulo} {subtitulo} {termo_padrao}", extras))

        # Destaques de cada página temática
        for nd in (hub.get("noticiasDestaque") or []):
            nt = nd.get("titulo", "")
            nr = nd.get("resumo", "") or subtitulo
            registrar(nt, nr, f"{nr}\nFonte: {nd.get('fonte', '')}", cat, extrair_tags(f"{nt} {nr}", list(palavras_assunto)[:6]))

    # 1c. Resumo do Dia
    for r in (ed.get("resumoDoDia") or []):
        titulo = r.get("titulo", "")
        resumo = r.get("resumo", "")
        importancia = r.get("porQueImporta", "")
        corpo = f"{resumo}\n\nPor que importa: {importancia}".strip()
        cat = mapear_categoria("resumo", r.get("paginaTematica", ""), titulo)
        extras = [r.get("labelTematica", ""), r.get("pais", "")]
        registrar(titulo, resumo, corpo, cat, extrair_tags(f"{titulo} {resumo}", extras))

    # 1d. Comparações Internacionais
    for slug, comp in (ed.get("comparacoes") or {}).items():
        titulo = comp.get("titulo", "")
        subtitulo = comp.get("subtitulo", "")
        resumo = comp.get("resumoComparativo", "") or subtitulo
        paises_txt = []
        kws = list(comp.get("palavrasChave") or [])
        for p in (comp.get("paises") or []):
            paises_txt.append(f"{p.get('nome', '')}: {p.get('visao', '')} — {' '.join(p.get('pontosChave') or [])}")
        corpo = "\n\n".join([resumo] + paises_txt)
        cat = mapear_categoria(comp.get("categoria", ""), slug, titulo)
        registrar(titulo, subtitulo or resumo, corpo, cat, extrair_tags(f"{titulo} {subtitulo}", kws))

    # 1e. Linhas do Tempo
    for tl_id, tl in (ed.get("linhasDoTempo") or {}).items():
        titulo = f"Linha do Tempo: {tl.get('titulo', tl_id)}"
        descricao = tl.get("descricao", "")
        eventos = tl.get("eventos") or []
        corpo = "\n".join([f"{ev.get('data', '')} - {ev.get('titulo', '')}: {ev.get('descricao', '')}" for ev in eventos])
        palavras_assunto = (assuntos_map.get(tl_id) or {}).get("palavrasChave") or []
        cat = mapear_categoria("", tl_id, titulo)
        registrar(titulo, descricao, corpo, cat, extrair_tags(f"{titulo} {descricao}", list(palavras_assunto)))

    # 1f. Manchetes iniciais por veículo (ROM_INITIAL_HEADLINES)
    headlines = dados_js.get("headlines") or {}
    for chave_veic, lista_m in headlines.items():
        partes_chave = chave_veic.split("|")
        veic = partes_chave[0]
        topico_k = partes_chave[1] if len(partes_chave) > 1 else "politica"
        for m in (lista_m or []):
            mt = m.get("titulo", "")
            if not mt or "política de privacidade" in mt.lower() or len(mt) < 12:
                continue
            cat = mapear_categoria(m.get("topicKey") or topico_k, "", mt)
            resumo_m = f"Cobertura jornalística de {veic} na editoria {cat}."
            registrar(mt, resumo_m, f"{mt}. {resumo_m}", cat, extrair_tags(mt, [veic.split(".")[0]]))

    # 2. data/feed_output.json (Radar Editorial & Geopolítico)
    if FEED_OUTPUT_JSON.exists():
        feed_items = json.loads(FEED_OUTPUT_JSON.read_text(encoding="utf-8"))
        for f in feed_items:
            ft = f.get("titulo", "")
            fr = f.get("resumo", "")
            fa = f.get("analise", "")
            corpo = f"{fr}\n\nAnálise editorial: {fa}".strip()
            cat = mapear_categoria(f.get("categoria", "geopolitica"), "radar", ft)
            registrar(ft, fr, corpo, cat, extrair_tags(f"{ft} {fr}", [f.get("fonte_nome", ""), f.get("categoria", "")]))

    return list(itens_por_titulo.values())


def main() -> int:
    url = os.getenv("CURADORIA_DATABASE_URL", "")
    if not url:
        print("[ERRO] CURADORIA_DATABASE_URL não configurada.")
        return 1

    itens = coletar_itens_acervo()
    print(f"[acervo] {len(itens)} conteúdos extraídos de data/editorial.js e data/feed_output.json")

    upsert_sql = """
        INSERT INTO conteudos (titulo, resumo, corpo, categoria, tags)
        VALUES (%(titulo)s, %(resumo)s, %(corpo)s, %(categoria)s, %(tags)s)
        ON CONFLICT (titulo) DO UPDATE SET
            resumo = EXCLUDED.resumo,
            corpo = EXCLUDED.corpo,
            categoria = EXCLUDED.categoria,
            tags = EXCLUDED.tags;
    """

    with psycopg.connect(url, connect_timeout=10, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            cur.executemany(upsert_sql, itens)
            conn.commit()
            total = cur.execute("SELECT COUNT(*) FROM conteudos").fetchone()[0]
            por_cat = cur.execute(
                "SELECT categoria, COUNT(*) FROM conteudos GROUP BY categoria ORDER BY 2 DESC"
            ).fetchall()

    print(f"[OK] Total de itens na tabela `conteudos` do Supabase: {total}")
    for cat, qtd in por_cat:
        print(f"  - {cat}: {qtd}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
