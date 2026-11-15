"""Orquestrador do pipeline de curadoria (Coleta -> Memória -> Cérebro -> Snapshot -> Backend).

Uso:
    python -m curadoria.pipeline            # executa, grava snapshot data/vitrine_ia.json e envia ao backend
    python -m curadoria.pipeline --dry-run  # gera insights e atualiza snapshot, sem enviar ao backend
"""
import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import requests

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
    load_dotenv()
except ImportError:  # python-dotenv é opcional
    pass

from .agente.analisador import enviar_para_backend, executar_agente_analisador
from .agente.coletor import coletar_feeds_rss, coletar_google_trends
from .agente.schemas import MAPA_ROTAS_EDITORIA, CuradoriaPayload

SAIDA_LOCAL = Path(__file__).resolve().parent / "output" / "ultimo_payload.json"
SNAPSHOT_VITRINE = Path(__file__).resolve().parents[1] / "data" / "vitrine_ia.json"


def salvar_snapshot_vitrine(payload: CuradoriaPayload) -> None:
    """Gera data/vitrine_ia.json no formato exato da seção 4.2 do contrato SUG-CURADORIA-IA."""
    agora_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    mapa_existente: Dict[str, str] = {}
    if SNAPSHOT_VITRINE.exists():
        try:
            dados_prev = json.loads(SNAPSHOT_VITRINE.read_text(encoding="utf-8"))
            if isinstance(dados_prev, dict) and isinstance(dados_prev.get("temas_ativos"), list):
                for t_prev in dados_prev["temas_ativos"]:
                    if isinstance(t_prev, dict):
                        s = str(t_prev.get("slug") or "")
                        dp = (
                            t_prev.get("data_publicacao")
                            or t_prev.get("created_at")
                            or t_prev.get("publicado_em")
                            or t_prev.get("updated_at")
                        )
                        if s and dp:
                            mapa_existente[s] = dp
        except Exception:
            pass

    temas_ativos = []
    for item in payload.insights:
        data_pub = mapa_existente.get(item.slug, agora_iso)
        temas_ativos.append({
            "slug": item.slug,
            "titulo_tema": item.titulo_tema,
            "status": item.status,
            "categoria_primaria": item.categoria_primaria,
            "categorias_cruzadas": list(item.categorias_cruzadas),
            "rota_editoria": MAPA_ROTAS_EDITORIA.get(item.categoria_primaria, "/ultimas-noticias"),
            "relevancia_score": item.relevancia_score,
            "palavras_chave_busca": [kw.lower().strip() for kw in item.palavras_chave_busca],
            "gatilho_vitrine": item.gatilho_vitrine,
            "sintese_nerd": item.sintese_nerd,
            "data_publicacao": data_pub,
            "updated_at": agora_iso,
        })
    snapshot = {
        "ok": True,
        "cached": False,
        "source": "snapshot",
        "updatedAt": agora_iso,
        "batch_id": payload.batch_id,
        "temas_ativos": temas_ativos,
    }
    SNAPSHOT_VITRINE.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_VITRINE.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[curadoria] Snapshot público atualizado -> {SNAPSHOT_VITRINE} ({len(temas_ativos)} temas)")


def notificar_gaps_criticos(backend_url: str, api_token: str) -> None:
    """Se TELEGRAM_BOT_TOKEN ou DISCORD_WEBHOOK_URL estiverem configurados, alerta sobre GAP_CRITICO."""
    if not (os.getenv("TELEGRAM_BOT_TOKEN") or os.getenv("DISCORD_WEBHOOK_URL")):
        return
    try:
        from src.notifier import send_discord_webhook, send_telegram_alert
        resp = requests.get(
            f"{backend_url}/v1/gaps",
            headers={"Authorization": f"Bearer {api_token}"},
            timeout=10,
        )
        if resp.status_code != 200:
            return
        for gap in resp.json().get("content_gaps", []):
            if gap.get("status_cobertura") == "GAP_CRITICO":
                pauta = gap.get("pauta_para_escrever") or {}
                card = {
                    "categoria": gap.get("categoria_primaria", "Geopolitica"),
                    "titulo": f"[GAP CRÍTICO IA] {gap.get('titulo_tema', '')}",
                    "resumo": pauta.get("titulo_seo", gap.get("titulo_tema", "")),
                    "analise": pauta.get("angulo_editorial", "Pauta em alta sem cobertura no acervo."),
                    "fonte_nome": f"Curadoria IA (Score {gap.get('relevancia_score')})",
                    "fonte_url": "https://www.rodandoomundo.com.br",
                }
                send_telegram_alert(card)
                send_discord_webhook(card)
    except Exception as e:  # noqa: BLE001
        print(f"[Aviso] Não foi possível notificar gaps críticos: {e}")


def obter_historico(backend_url: str, api_token: str, horas: int = 48) -> list:
    if not api_token or "api.rodandoomundo.com.br" in backend_url:
        return []
    try:
        resp = requests.get(
            f"{backend_url}/v1/curadoria/historico",
            params={"horas": horas},
            headers={"Authorization": f"Bearer {api_token}"},
            timeout=5,
        )
        if resp.status_code == 200:
            return resp.json().get("slugs_recentes", [])
    except Exception as e:  # noqa: BLE001
        print(f"[Aviso] Não foi possível consultar histórico: {e}")
    return []


def gravar_direto_banco_se_disponivel(payload: CuradoriaPayload) -> bool:
    """Fallback direto via psycopg caso CURADORIA_DATABASE_URL esteja configurado e API HTTP não responda."""
    db_url = os.getenv("CURADORIA_DATABASE_URL", "")
    if not db_url or "[YOUR-PASSWORD]" in db_url:
        return False
    try:
        from datetime import timedelta
        import psycopg
        from psycopg.types.json import Jsonb

        agora = datetime.now(timezone.utc)
        query_upsert = """
            INSERT INTO ai_curadoria_insights (
                slug, batch_id, titulo_tema, status, categoria_primaria,
                categorias_cruzadas, relevancia_score, ttl_horas,
                palavras_chave_busca, gatilho_vitrine, sintese_nerd,
                sugestao_pauta_gap, updated_at, expires_at
            ) VALUES (
                %(slug)s, %(batch_id)s, %(titulo_tema)s, %(status)s, %(categoria_primaria)s,
                %(categorias_cruzadas)s, %(relevancia_score)s, %(ttl_horas)s,
                %(palavras_chave_busca)s, %(gatilho_vitrine)s, %(sintese_nerd)s,
                %(sugestao_pauta_gap)s, %(updated_at)s, %(expires_at)s
            )
            ON CONFLICT (slug) DO UPDATE SET
                batch_id = EXCLUDED.batch_id,
                titulo_tema = EXCLUDED.titulo_tema,
                status = EXCLUDED.status,
                categoria_primaria = EXCLUDED.categoria_primaria,
                categorias_cruzadas = EXCLUDED.categorias_cruzadas,
                relevancia_score = EXCLUDED.relevancia_score,
                ttl_horas = EXCLUDED.ttl_horas,
                palavras_chave_busca = EXCLUDED.palavras_chave_busca,
                gatilho_vitrine = EXCLUDED.gatilho_vitrine,
                sintese_nerd = EXCLUDED.sintese_nerd,
                sugestao_pauta_gap = EXCLUDED.sugestao_pauta_gap,
                updated_at = EXCLUDED.updated_at,
                expires_at = EXCLUDED.expires_at;
        """
        with psycopg.connect(db_url, connect_timeout=8, prepare_threshold=None) as conn:
            with conn.cursor() as cur:
                for item in payload.insights:
                    cur.execute(query_upsert, {
                        **item.model_dump(exclude={"sugestao_pauta_gap", "palavras_chave_busca"}),
                        "batch_id": payload.batch_id,
                        "palavras_chave_busca": [kw.lower().strip() for kw in item.palavras_chave_busca],
                        "sugestao_pauta_gap": Jsonb(item.sugestao_pauta_gap.model_dump()),
                        "updated_at": agora,
                        "expires_at": agora + timedelta(hours=item.ttl_horas),
                    })
                conn.commit()
        print(f"[curadoria] {len(payload.insights)} insights gravados diretamente no PostgreSQL.")
        return True
    except Exception as e:  # noqa: BLE001
        print(f"[Aviso] Gravação direta no PostgreSQL indisponível: {e}")
        return False


def rodar_pipeline_completo(dry_run: bool = False, horas_janela: int = 12) -> None:
    backend_url = os.getenv("CURADORIA_BACKEND_URL", "https://api.rodandoomundo.com.br").rstrip("/")
    api_token = os.getenv("CURADORIA_SECRET_TOKEN", "")

    lote_total = coletar_google_trends() + coletar_feeds_rss(horas_limite=horas_janela)
    print(f"[curadoria] Itens coletados: {len(lote_total)}")
    if not lote_total:
        print("[curadoria] Nenhum dado novo nesta janela.")
        return

    historico = obter_historico(backend_url, api_token)
    payload = executar_agente_analisador(noticias_brutas=lote_total, temas_recentes_enviados=historico)

    SAIDA_LOCAL.parent.mkdir(parents=True, exist_ok=True)
    SAIDA_LOCAL.write_text(payload.model_dump_json(indent=2), encoding="utf-8")
    print(f"[curadoria] {len(payload.insights)} insights gerados -> {SAIDA_LOCAL}")

    # Sempre salva o snapshot público data/vitrine_ia.json
    salvar_snapshot_vitrine(payload)

    if dry_run or not api_token:
        return

    if "api.rodandoomundo.com.br" not in backend_url:
        try:
            enviar_para_backend(payload, webhook_url=f"{backend_url}/v1/curadoria", api_token=api_token)
            notificar_gaps_criticos(backend_url, api_token)
            return
        except Exception as e:  # noqa: BLE001
            print(f"[Aviso] Falha ao enviar via HTTP ({e}); tentando gravação direta no banco...")

    gravar_direto_banco_se_disponivel(payload)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pipeline do Agente de Curadoria")
    parser.add_argument("--dry-run", action="store_true", help="Não envia ao backend")
    parser.add_argument("--horas", type=int, default=12, help="Janela temporal da coleta RSS")
    args = parser.parse_args()
    rodar_pipeline_completo(dry_run=args.dry_run, horas_janela=args.horas)

