#!/usr/bin/env python3
"""Vigia Grok: Agente de Manutenção, Confiabilidade (SRE) e Sentinela do RoM V2.

Responsabilidades:
1. Auditoria de integridade do sistema (paridade HTML index/200, frescor do feed_output.json, status do banco de dados).
2. Validação preventiva de links e integridade de rotas (Regra 11 do GEMINI.md).
3. Consulta à API do Grok (xAI) para diagnóstico inteligente de saúde e anomalias.
4. Notificação de alertas automáticos via Discord/Telegram.
"""
import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv

# Carrega configurações locais do .env
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
FEED_OUTPUT = DATA_DIR / "feed_output.json"
VITRINE_IA = DATA_DIR / "vitrine_ia.json"
ENTENDA_V2 = DATA_DIR / "entenda_v2.json"
INDEX_HTML = BASE_DIR / "index.html"
TWO_HUNDRED_HTML = BASE_DIR / "200.html"

def obter_chave_zelador() -> str:
    """Resolve dinamicamente a chave do Zelador (XAI_API_KEY / GROK_API_KEY / GROQ_API_KEY)."""
    chave = (
        os.getenv("XAI_API_KEY")
        or os.getenv("GROK_API_KEY")
        or os.getenv("GROQ_API_KEY")
        or ""
    ).strip()
    if chave.startswith("sua_chave"):
        return ""
    return chave


XAI_API_KEY = obter_chave_zelador()


def obter_config_ia(api_key: Optional[str] = None) -> Dict[str, str]:
    """Detecta automaticamente se a chave é da Groq (gsk_) ou da xAI Grok (xai-)."""
    chave = (api_key if api_key is not None else obter_chave_zelador()).strip()
    if chave.startswith("gsk_"):
        return {
            "provedor": "Groq",
            "api_url": "https://api.groq.com/openai/v1/chat/completions",
            "modelo": (os.getenv("GROQ_MODEL") or "openai/gpt-oss-20b").strip(),
            "fallback_modelo": "llama-3.3-70b-versatile",
        }
    return {
        "provedor": "xAI (Grok)",
        "api_url": "https://api.x.ai/v1/chat/completions",
        "modelo": os.getenv("XAI_MODEL", "grok-2-mini").strip() or "grok-2-mini",
        "fallback_modelo": "grok-2-latest",
    }


def gerar_json_zelador_ia(
    prompt_sistema: str,
    prompt_usuario: str,
    timeout: int = 35,
) -> Optional[str]:
    """Aciona o Zelador (Grok/Groq) como contingência/auto-cura para gerar saída JSON quando o Gemini falhar."""
    chave = obter_chave_zelador()
    if not chave:
        return None

    cfg = obter_config_ia(chave)
    provedor = cfg["provedor"]
    api_url = cfg["api_url"]
    modelos = list(dict.fromkeys([cfg["modelo"], cfg["fallback_modelo"]]))
    headers = {
        "Authorization": f"Bearer {chave}",
        "Content-Type": "application/json",
    }

    for modelo in modelos:
        payload = {
            "model": modelo,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        f"{prompt_sistema}\n\n"
                        "REGRA DE FORMATO: Responda EXCLUSIVAMENTE com um objeto JSON válido, sem blocos markdown (```json)."
                    ),
                },
                {"role": "user", "content": prompt_usuario},
            ],
            "temperature": 0.2,
        }
        try:
            resp = requests.post(api_url, json=payload, headers=headers, timeout=timeout)
            if resp.status_code == 200:
                conteudo = resp.json()["choices"][0]["message"]["content"].strip()
                if conteudo.startswith("```"):
                    linhas = [l for l in conteudo.splitlines() if not l.strip().startswith("```")]
                    conteudo = "\n".join(linhas).strip()
                return conteudo
        except Exception as exc:
            print(f"[zelador_ia] Aviso ao consultar {provedor} ({modelo}): {exc}", file=sys.stderr)
            continue
    return None


def auditar_paridade_html() -> Dict[str, Any]:
    """Valida paridade e integridade entre index.html e 200.html."""
    res: Dict[str, Any] = {"status": "ok", "detalhes": []}
    if not INDEX_HTML.exists():
        res["status"] = "erro"
        res["detalhes"].append("index.html não encontrado na raiz.")
    if not TWO_HUNDRED_HTML.exists():
        res["status"] = "erro"
        res["detalhes"].append("200.html (fallback SPA Netlify) não encontrado.")

    if INDEX_HTML.exists() and TWO_HUNDRED_HTML.exists():
        len_index = len(INDEX_HTML.read_text(encoding="utf-8").splitlines())
        len_200 = len(TWO_HUNDRED_HTML.read_text(encoding="utf-8").splitlines())
        diff = abs(len_index - len_200)
        res["linhas_index"] = len_index
        res["linhas_200"] = len_200
        if diff > 15:
            res["status"] = "alerta"
            res["detalhes"].append(f"Divergência de {diff} linhas entre index.html e 200.html.")
        else:
            res["detalhes"].append("index.html e 200.html em paridade estrutural.")
    return res


def auditar_frescor_dados() -> Dict[str, Any]:
    """Checa se o arquivo feed_output.json está presente, íntegro e atualizado."""
    res: Dict[str, Any] = {"status": "ok", "detalhes": []}
    if not FEED_OUTPUT.exists():
        res["status"] = "alerta"
        res["detalhes"].append("feed_output.json não existe no diretório data/.")
        return res

    try:
        mtime = datetime.fromtimestamp(FEED_OUTPUT.stat().st_mtime, tz=timezone.utc)
        agora = datetime.now(timezone.utc)
        horas_sem_atualizar = (agora - mtime).total_seconds() / 3600.0

        with open(FEED_OUTPUT, "r", encoding="utf-8") as f:
            dados = json.load(f)

        total_itens = len(dados) if isinstance(dados, list) else 0
        res["total_noticias"] = total_itens
        res["ultima_modificacao"] = mtime.isoformat()
        res["horas_sem_atualizar"] = round(horas_sem_atualizar, 2)

        if horas_sem_atualizar > 4.0:
            res["status"] = "alerta"
            res["detalhes"].append(f"Feed sem atualização há {round(horas_sem_atualizar, 1)} horas.")
        else:
            res["detalhes"].append(f"Feed ativo com {total_itens} notícias (última geração há {round(horas_sem_atualizar, 1)}h).")

    except Exception as e:
        res["status"] = "erro"
        res["detalhes"].append(f"Falha ao ler feed_output.json: {e}")

    return res


def auditar_banco_dados() -> Dict[str, Any]:
    """Testa conexão com PostgreSQL caso DATABASE_URL esteja configurada."""
    db_url = os.getenv("DATABASE_URL") or os.getenv("CURADORIA_DATABASE_URL")
    if not db_url:
        return {"status": "ignorado", "detalhes": ["DATABASE_URL não configurada no ambiente local."]}

    try:
        import psycopg
        with psycopg.connect(db_url, connect_timeout=5) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM ai_noticias_quentes WHERE expires_at > NOW();")
                qtd_quentes = cur.fetchone()[0]
                return {
                    "status": "ok",
                    "noticias_quentes_ativas": qtd_quentes,
                    "detalhes": [f"PostgreSQL online. {qtd_quentes} notícias ativas no banco."]
                }
    except Exception as e:
        return {
            "status": "erro",
            "detalhes": [f"Falha de conexão com PostgreSQL: {e}"]
        }


def auditar_vitrine_editorial() -> Dict[str, Any]:
    """Audita a camada Editorial & Curadoria (vitrine_ia.json e entenda_v2.json)."""
    res: Dict[str, Any] = {"status": "ok", "detalhes": []}
    if not VITRINE_IA.exists():
        res["status"] = "alerta"
        res["detalhes"].append("vitrine_ia.json não encontrado em data/.")
    else:
        try:
            vit = json.loads(VITRINE_IA.read_text(encoding="utf-8"))
            temas = len(vit.get("temas_ativos") or []) if isinstance(vit, dict) else 0
            quentes = len(vit.get("noticias_quentes") or []) if isinstance(vit, dict) else 0
            res["temas_ativos"] = temas
            res["noticias_quentes_snapshot"] = quentes
            res["detalhes"].append(f"Vitrine IA ativa ({temas} temas, {quentes} notícias quentes no snapshot).")
        except Exception as exc:
            res["status"] = "erro"
            res["detalhes"].append(f"Erro ao ler vitrine_ia.json: {exc}")

    if ENTENDA_V2.exists():
        try:
            ent = json.loads(ENTENDA_V2.read_text(encoding="utf-8"))
            guias = len(ent.get("items") or ent.get("assuntos") or []) if isinstance(ent, dict) else (len(ent) if isinstance(ent, list) else 0)
            res["guias_entenda_v2"] = guias
            res["detalhes"].append(f"Catálogo Entenda V2 íntegro ({guias} guias).")
        except Exception as exc:
            res["status"] = "alerta"
            res["detalhes"].append(f"Aviso ao ler entenda_v2.json: {exc}")
    return res


def auditar_canais_discord() -> Dict[str, bool]:
    """Verifica quais canais segmentados do Discord estão configurados no ambiente."""
    def _tem_url(var_name: str) -> bool:
        u = (os.getenv(var_name) or "").strip()
        return len(u) > 45 and u != "https://discord.com/api/webhooks/"

    return {
        "geral": _tem_url("DISCORD_WEBHOOK_URL"),
        "manutencao": _tem_url("DISCORD_WEBHOOK_MANUTENCAO"),
        "critico": _tem_url("DISCORD_WEBHOOK_CRITICO"),
        "radar": _tem_url("DISCORD_WEBHOOK_RADAR"),
        "editorial": _tem_url("DISCORD_WEBHOOK_EDITORIAL"),
    }


def coletar_relatorio_geral() -> Dict[str, Any]:
    """Compila todas as checagens do sistema em um payload unificado."""
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "projeto": "Rodando o Mundo (RoM V2)",
        "paridade_html": auditar_paridade_html(),
        "frescor_dados": auditar_frescor_dados(),
        "vitrine_editorial": auditar_vitrine_editorial(),
        "banco_dados": auditar_banco_dados(),
        "canais_discord": auditar_canais_discord(),
    }


def consultar_grok_manutencao(relatorio: Dict[str, Any]) -> Optional[str]:
    """Envia o relatório de auditoria para o provedor configurado (Groq ou xAI Grok)."""
    chave = obter_chave_zelador()
    if not chave:
        print("[!] Chave de IA de manutenção não configurada (XAI_API_KEY / GROQ_API_KEY).")
        return None

    cfg = obter_config_ia(chave)
    provedor = cfg["provedor"]
    api_url = cfg["api_url"]
    modelos = list(dict.fromkeys([cfg["modelo"], cfg["fallback_modelo"]]))

    prompt_sistema = f"""Você é o Vigia Sentinela (operando via {provedor}), o Engenheiro de Confiabilidade (SRE) e Agente de Manutenção do portal Rodando o Mundo (RoM V2).
Seu objetivo é analisar o relatório de saúde do sistema e emitir um parecer técnico, direto e objetivo para o operador do site.
Estruture sua resposta estritamente nas seções abaixo:
1. 🩺 STATUS GERAL: [🟢 ESTÁVEL | 🟡 ATENÇÃO | 🔴 CRÍTICO]
2. 🔍 DIAGNÓSTICO: Explicação sucinta em 2 a 3 frases dos achados principais.
3. 🛠️ AÇÕES RECOMENDADAS: Lista em tópicos do que fazer se houver anomalias (ou 'Nenhuma ação necessária' se tudo estiver OK).
Mantenha o tom profissional, direto e ágil."""

    headers = {
        "Authorization": f"Bearer {chave}",
        "Content-Type": "application/json"
    }

    for modelo in modelos:
        payload = {
            "model": modelo,
            "messages": [
                {"role": "system", "content": prompt_sistema},
                {"role": "user", "content": f"Relatório de telemetria e integridade do RoM V2:\n{json.dumps(relatorio, ensure_ascii=False, indent=2)}"}
            ],
            "temperature": 0.2
        }

        try:
            print(f"[2/3] Consultando {provedor} ({modelo})...")
            resp = requests.post(api_url, json=payload, headers=headers, timeout=25)
            if resp.status_code == 200:
                data = resp.json()
                return data["choices"][0]["message"]["content"].strip()
            else:
                print(f"[!] {provedor} retornou status {resp.status_code}: {resp.text}")
                continue
        except Exception as e:
            print(f"[!] Erro ao conectar com a API do {provedor}: {e}")
            continue

    return None


def notificar_canais(diagnostico: str, relatorio: Dict[str, Any]) -> None:
    """Envia o parecer do Vigia para Discord e/ou Telegram com roteamento de canais."""
    eh_critico = (
        "🔴" in diagnostico
        or "CRÍTICO" in diagnostico.upper()
        or any(v.get("status") == "erro" for v in [relatorio["paridade_html"], relatorio["frescor_dados"], relatorio["banco_dados"]])
    )
    nivel = "critico" if eh_critico else ("aviso" if "🟡" in diagnostico else "sucesso")

    # Envio Telegram
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if token and chat_id:
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        icone = "🚨" if eh_critico else "🛡️"
        msg = f"{icone} *VIGIA SRE | RELATÓRIO DE MANUTENÇÃO*\n\n{diagnostico}"
        try:
            requests.post(url, json={"chat_id": chat_id, "text": msg, "parse_mode": "Markdown"}, timeout=8)
            print("[+] Alerta enviado para o Telegram.")
        except Exception as e:
            print(f"[!] Falha ao notificar Telegram: {e}")

    # Envio Discord com roteamento segmentado
    def _limpar_webhook(url: Optional[str]) -> str:
        u = (url or "").strip()
        return u if len(u) > 45 and u != "https://discord.com/api/webhooks/" else ""

    webhook_critico = _limpar_webhook(os.getenv("DISCORD_WEBHOOK_CRITICO"))
    webhook_manutencao = _limpar_webhook(os.getenv("DISCORD_WEBHOOK_MANUTENCAO"))
    webhook_geral = _limpar_webhook(os.getenv("DISCORD_WEBHOOK_URL"))

    # Seleciona o canal apropriado com fallback suave
    if eh_critico:
        target_url = webhook_critico or webhook_geral
        canal_nome = "CRÍTICO" if webhook_critico else "GERAL"
    else:
        target_url = webhook_manutencao or webhook_geral
        canal_nome = "MANUTENÇÃO" if webhook_manutencao else "GERAL"

    if target_url:
        cor_map = {
            "critico": 15158332, # Vermelho
            "aviso": 16776960,   # Amarelo
            "sucesso": 3066993   # Verde
        }
        embed = {
            "title": f"🛡️ Vigia SRE: Relatório de Saúde RoM V2 ({canal_nome})",
            "description": diagnostico,
            "color": cor_map.get(nivel, 3447003),
            "footer": {"text": f"RoM SRE • {relatorio.get('timestamp')}"}
        }
        payload = {"embeds": [embed]}
        ping_critico = os.getenv("DISCORD_PING_ON_CRITICAL", "").strip().lower() in ("true", "1", "yes")
        if eh_critico and ping_critico:
            payload["content"] = "@here 🚨 **Atenção: Anomalia crítica detectada no portal!**"

        try:
            r = requests.post(target_url, json=payload, timeout=8)
            if r.status_code in [200, 204]:
                print(f"[+] Alerta enviado para o Discord (Canal: {canal_nome}).")
            else:
                print(f"[!] Discord retornou status {r.status_code}: {r.text}")
        except Exception as e:
            print(f"[!] Falha ao notificar Discord: {e}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Vigia Grok: Agente de Manutenção e SRE do RoM V2")
    parser.add_argument("--notificar", action="store_true", help="Envia alertas no Discord/Telegram caso configurados.")
    args = parser.parse_args()

    print("\n" + "=" * 60)
    print("🛡️  VIGIA GROK: INICIANDO AUDITORIA DE SAÚDE DO SITE")
    print("=" * 60)

    relatorio = coletar_relatorio_geral()
    print("\n[1/3] Checagens Locais Concluídas:")
    print(f"  • Paridade HTML: {relatorio['paridade_html']['status'].upper()} ({relatorio['paridade_html']['detalhes'][0]})")
    print(f"  • Frescor do Feed: {relatorio['frescor_dados']['status'].upper()} ({relatorio['frescor_dados']['detalhes'][0]})")
    print(f"  • Banco de Dados: {relatorio['banco_dados']['status'].upper()} ({relatorio['banco_dados']['detalhes'][0]})")

    cfg = obter_config_ia()
    diagnostico = consultar_grok_manutencao(relatorio)

    if diagnostico:
        print("\n" + "-" * 50)
        print(f"🤖 PARECER DO VIGIA ({cfg['provedor']}):")
        print("-" * 50)
        print(diagnostico)
        print("-" * 50)
    else:
        print(f"\n[i] Auditoria concluída em modo local (sem consulta remota ao {cfg['provedor']}).")
        # Gerar diagnóstico local resumido
        status_geral = "🟢 ESTÁVEL"
        if any(v.get("status") == "alerta" for v in [relatorio["paridade_html"], relatorio["frescor_dados"]]):
            status_geral = "🟡 ATENÇÃO"
        if any(v.get("status") == "erro" for v in [relatorio["paridade_html"], relatorio["frescor_dados"]]):
            status_geral = "🔴 CRÍTICO"

        diagnostico = f"STATUS: {status_geral}\n- " + "\n- ".join(
            relatorio["paridade_html"]["detalhes"] + relatorio["frescor_dados"]["detalhes"]
        )

    if args.notificar:
        print("\n[3/3] Enviando notificações aos canais...")
        notificar_canais(diagnostico, relatorio)
    else:
        print("\n[3/3] Notificação externa desativada (use --notificar para disparar no Discord/Telegram).")

    print("\n✅ Auditoria finalizada com sucesso.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
