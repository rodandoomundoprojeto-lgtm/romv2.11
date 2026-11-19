#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Bot Alimentador DuckDuckGo News (`ddgs` / `duckduckgo-search`) — Rodando o Mundo.

Coleta notícias recentes em tempo real via DuckDuckGo News (sem necessidade de chave de API),
deduplica por URL e título, classifica por editoria do Radar e grava atomicamente em
`data/noticias_ddg.json`.
"""
import argparse
import datetime
import json
import os
import re
import sys
import tempfile
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from ddgs import DDGS  # type: ignore
    MOTOR_LIB = "ddgs"
except ImportError:
    try:
        from duckduckgo_search import DDGS  # type: ignore
        MOTOR_LIB = "duckduckgo_search"
    except ImportError:
        DDGS = None  # type: ignore
        MOTOR_LIB = ""

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_OUT_PATH = ROOT_DIR / "data" / "noticias_ddg.json"

PAUTAS_PADRAO: List[Dict[str, str]] = [
    {
        "query": "Brasil política",
        "region": "br-pt",
        "codigoPais": "BR",
        "pais": "Brasil",
        "categoria": "Brasil · Política",
        "categoriaRadar": "politica",
    },
    {
        "query": "Brasil economia",
        "region": "br-pt",
        "codigoPais": "BR",
        "pais": "Brasil",
        "categoria": "Economia & Câmbio",
        "categoriaRadar": "economia",
    },
    {
        "query": "geopolítica mundo",
        "region": "br-pt",
        "codigoPais": "US",
        "pais": "Estados Unidos",
        "categoria": "Geopolítica & Mundo",
        "categoriaRadar": "geopolitica",
    },
    {
        "query": "tecnologia inteligência artificial",
        "region": "br-pt",
        "codigoPais": "BR",
        "pais": "Brasil",
        "categoria": "Tecnologia & Ciência",
        "categoriaRadar": "cultura",
    },
]


def ddgs_disponivel() -> bool:
    """Retorna True se `ddgs` ou `duckduckgo_search` estiver instalado."""
    return DDGS is not None


def _normalizar_texto(texto: str) -> str:
    txt = unicodedata.normalize("NFKD", (texto or "").lower())
    txt = "".join(ch for ch in txt if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", txt).strip()


def _inferir_categoria_radar(texto: str, fallback: str = "geopolitica") -> str:
    txt = (texto or "").lower()
    if any(k in txt for k in ("dólar", "selic", "juros", "inflação", "pib", "mercado", "economia", "bolsa", "tarifa")):
        return "economia"
    if any(k in txt for k in ("governo", "congresso", "stf", "senado", "eleição", "eleições", "presidente", "ministro")):
        return "politica"
    if any(k in txt for k in ("cultura", "clima", "cinema", "música", "festival", "turismo", "ciência", "saúde")):
        return "cultura"
    if any(k in txt for k in ("guerra", "onu", "otan", "eua", "china", "europa", "rússia", "ucrânia", "geopolítica")):
        return "geopolitica"
    return fallback if fallback in ("geopolitica", "politica", "economia", "cultura") else "geopolitica"


def _limpar_espacos(texto: str, limite: int = 320) -> str:
    limpo = re.sub(r"\s+", " ", str(texto or "")).strip()
    return limpo[:limite]


def _persistir_atomico(caminho: Path, payload: Dict[str, Any]) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix="ddg_", suffix=".json", dir=str(caminho.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp_name, caminho)
    except Exception:
        if os.path.exists(tmp_name):
            try:
                os.unlink(tmp_name)
            except Exception:
                pass
        raise


def executar_coleta_ddg(
    query: Optional[str] = None,
    region: str = "br-pt",
    timelimit: str = "d",
    max_results: int = 8,
    dry_run: bool = False,
    out_path: Optional[Path] = None,
) -> Dict[str, Any]:
    """Executa busca de notícias no DuckDuckGo News (`ddgs`) e retorna o payload estruturado."""
    if not ddgs_disponivel():
        raise RuntimeError("Biblioteca 'ddgs' / 'duckduckgo-search' não está instalada no ambiente Python.")

    agora_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    data_edicao = agora_iso[:10]
    destino = Path(out_path) if out_path else DEFAULT_OUT_PATH

    query_limpa = (query or "").strip()
    if query_limpa:
        pautas = [
            {
                "query": query_limpa,
                "region": region or "br-pt",
                "codigoPais": "BR" if (region or "").startswith("br") else "GL",
                "pais": "Brasil" if (region or "").startswith("br") else "Global",
                "categoria": f"Busca: {query_limpa[:40]}",
                "categoriaRadar": _inferir_categoria_radar(query_limpa, "geopolitica"),
            }
        ]
        por_pauta = max(3, min(int(max_results or 8), 25))
    else:
        pautas = PAUTAS_PADRAO
        por_pauta = max(2, min(int(max_results or 6), 12))

    urls_vistas = set()
    titulos_vistos = set()
    itens_finais: List[Dict[str, Any]] = []
    erros_pautas: List[str] = []

    client = DDGS()
    for pauta in pautas:
        try:
            resultados = client.news(
                pauta["query"],
                region=pauta.get("region") or region or "br-pt",
                timelimit=timelimit or "d",
                max_results=por_pauta,
            )
        except Exception as exc:  # noqa: BLE001
            erros_pautas.append(f"{pauta['query']}: {exc}")
            continue

        for r in (resultados or []):
            if not isinstance(r, dict):
                continue
            titulo = _limpar_espacos(r.get("title", ""), 180)
            url = str(r.get("url") or "").strip()
            if not titulo or not url or not url.startswith(("http://", "https://")):
                continue
            tit_norm = _normalizar_texto(titulo)
            if url in urls_vistas or not tit_norm or tit_norm in titulos_vistos:
                continue

            urls_vistas.add(url)
            titulos_vistos.add(tit_norm)

            resumo = _limpar_espacos(r.get("body", "") or titulo, 300)
            fonte = _limpar_espacos(r.get("source", "") or "DuckDuckGo News", 80)
            cat_radar = _inferir_categoria_radar(f"{titulo} {resumo}", pauta["categoriaRadar"])

            itens_finais.append({
                "relevancia": len(itens_finais) + 1,
                "categoria": pauta["categoria"],
                "categoriaRadar": cat_radar,
                "titulo": titulo,
                "resumo": resumo,
                "fonte": fonte,
                "url": url,
                "image": str(r.get("image") or "").strip() or None,
                "pais": pauta["pais"],
                "codigoPais": pauta["codigoPais"],
                "publicadoEm": str(r.get("date") or agora_iso),
                "origemDdgNews": True,
            })

    payload: Dict[str, Any] = {
        "atualizadoEm": agora_iso,
        "dataEdicao": data_edicao,
        "fonteMotor": f"DuckDuckGo News ({MOTOR_LIB})",
        "ultimaQuery": query_limpa or "varredura multi-editoria",
        "total": len(itens_finais),
        "items": itens_finais,
    }
    if erros_pautas and not itens_finais:
        payload["erros"] = erros_pautas

    if not dry_run and itens_finais:
        _persistir_atomico(destino, payload)

    return payload


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Bot DuckDuckGo News (ddgs) — Rodando o Mundo")
    parser.add_argument("--query", default=None, help="Consulta específica (opcional; padrão: varredura global)")
    parser.add_argument("--region", default="br-pt", help="Região DuckDuckGo (padrão: br-pt)")
    parser.add_argument("--timelimit", default="d", help="Janela temporal: d (dia), w (semana), m (mês)")
    parser.add_argument("--max-results", type=int, default=6, help="Máximo de resultados por pauta")
    parser.add_argument("--dry-run", action="store_true", help="Não grava o arquivo data/noticias_ddg.json")
    parser.add_argument("--out", default=None, help="Caminho alternativo de saída JSON")
    args = parser.parse_args(argv)

    payload = executar_coleta_ddg(
        query=args.query,
        region=args.region,
        timelimit=args.timelimit,
        max_results=args.max_results,
        dry_run=args.dry_run,
        out_path=Path(args.out) if args.out else None,
    )
    print(f"[DDG News] {payload['total']} notícias coletadas via {payload['fonteMotor']}.")
    for it in payload["items"][:5]:
        print(f"  #{it['relevancia']} [{it['codigoPais']}] {it['titulo']} ({it['fonte']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
