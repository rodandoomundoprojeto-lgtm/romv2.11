"""Orquestrador do pipeline de curadoria (Coleta -> Memória -> Cérebro -> Snapshot -> Backend).

Uso:
    python -m curadoria.pipeline            # executa, grava snapshot data/vitrine_ia.json e envia ao backend
    python -m curadoria.pipeline --dry-run  # gera insights e atualiza snapshot, sem enviar ao backend
"""
import argparse
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

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
SNAPSHOT_VITRINE_PADRAO = Path(__file__).resolve().parents[1] / "data" / "vitrine_ia.json"
SNAPSHOT_VITRINE = SNAPSHOT_VITRINE_PADRAO


def _parse_iso_utc(raw: Any) -> Optional[datetime]:
    """Converte string ISO-8601 ou datetime em datetime aware UTC."""
    if isinstance(raw, datetime):
        dt = raw
    elif isinstance(raw, str) and raw.strip():
        try:
            dt = datetime.fromisoformat(raw.strip().replace("Z", "+00:00"))
        except Exception:
            return None
    else:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _parse_iso_ts(raw: Any) -> float:
    dt = _parse_iso_utc(raw)
    return dt.timestamp() if dt is not None else 0.0


def _item_nao_expirado(item: Dict[str, Any], agora: datetime) -> bool:
    """Retorna False apenas se o item possui expires_at explícito <= agora."""
    exp_dt = _parse_iso_utc(item.get("expires_at"))
    if exp_dt is not None:
        return exp_dt > agora
    return True


def _chave_sort_vitrine(item: Dict[str, Any]) -> tuple:
    """Chave de ordenação decrescente por recência (`data_publicacao` -> `updated_at` -> score)."""
    pub_raw = item.get("data_publicacao") or item.get("created_at") or item.get("publicado_em") or ""
    pub_ts = _parse_iso_ts(pub_raw)
    upd_ts = _parse_iso_ts(item.get("updated_at"))
    score = int(item.get("urgencia_score") or item.get("relevancia_score") or 0)
    return (1 if pub_ts > 0 else 0, pub_ts, upd_ts, score)


def _ler_snapshot_arquivo(caminho: Path) -> Dict[str, Any]:
    if caminho.exists():
        try:
            dados = json.loads(caminho.read_text(encoding="utf-8"))
            if isinstance(dados, dict):
                return dados
        except Exception:
            return {}
    return {}


def _ler_snapshot_vitrine_previo(caminho: Path) -> Dict[str, Any]:
    """Lê o snapshot anterior do banco (caminho canônico) ou do arquivo local."""
    if caminho == SNAPSHOT_VITRINE_PADRAO:
        try:
            from src.estado_db import ler_estado

            estado = ler_estado("vitrine_ia")
            if isinstance(estado, dict) and estado:
                return estado
        except Exception:
            pass

    return _ler_snapshot_arquivo(caminho)


def _gravar_snapshot_arquivo(caminho: Path, snapshot: Dict[str, Any]) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")


def _gravar_snapshot_vitrine(caminho: Path, snapshot: Dict[str, Any]) -> None:
    """Grava o snapshot no arquivo e espelha no banco quando disponível."""
    _gravar_snapshot_arquivo(caminho, snapshot)

    if caminho == SNAPSHOT_VITRINE_PADRAO:
        try:
            from src.estado_db import gravar_estado

            gravar_estado("vitrine_ia", snapshot)
        except Exception:
            pass


def _construir_snapshot_vitrine_mesclado(
    dados_prev: Any,
    payload: CuradoriaPayload,
    agora: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Mescla insights de curadoria preservando itens não expirados do pulso e `data_publicacao` originais."""
    ref_agora = agora or datetime.now(timezone.utc)
    agora_iso = ref_agora.strftime("%Y-%m-%dT%H:%M:%SZ")
    prev = dados_prev if isinstance(dados_prev, dict) else {}

    mapa_existente: Dict[str, str] = {}
    for lista_key in ("temas_ativos", "temas_curadoria"):
        raw_lista = prev.get(lista_key)
        if not isinstance(raw_lista, list):
            continue
        for t_prev in raw_lista:
            if not isinstance(t_prev, dict):
                continue
            dp = (
                t_prev.get("data_publicacao")
                or t_prev.get("created_at")
                or t_prev.get("publicado_em")
                or t_prev.get("updated_at")
            )
            if not dp:
                continue
            s = str(t_prev.get("slug") or "").strip()
            tit = str(t_prev.get("titulo_tema") or t_prev.get("titulo_curto") or "").lower().strip()
            if s and s not in mapa_existente:
                mapa_existente[s] = str(dp)
            if tit and tit not in mapa_existente:
                mapa_existente[tit] = str(dp)

    temas_curadoria: List[Dict[str, Any]] = []
    vistos_slugs = set()
    vistos_titulos = set()

    for item in payload.insights:
        tit_norm = item.titulo_tema.lower().strip()
        data_pub = (
            mapa_existente.get(item.slug)
            or mapa_existente.get(tit_norm)
            or agora_iso
        )
        ttl_h = max(1, int(item.ttl_horas or 24))
        expires_iso = (ref_agora + timedelta(hours=ttl_h)).strftime("%Y-%m-%dT%H:%M:%SZ")
        tema_obj = {
            "slug": item.slug,
            "titulo_tema": item.titulo_tema,
            "status": item.status,
            "origem_pipeline": "curadoria",
            "categoria_primaria": item.categoria_primaria,
            "categorias_cruzadas": list(item.categorias_cruzadas),
            "rota_editoria": MAPA_ROTAS_EDITORIA.get(item.categoria_primaria, "/ultimas-noticias"),
            "relevancia_score": item.relevancia_score,
            "ttl_horas": ttl_h,
            "expires_at": expires_iso,
            "palavras_chave_busca": [kw.lower().strip() for kw in item.palavras_chave_busca],
            "gatilho_vitrine": item.gatilho_vitrine,
            "sintese_nerd": item.sintese_nerd,
            "data_publicacao": data_pub,
            "updated_at": agora_iso,
        }
        temas_curadoria.append(tema_obj)
        if item.slug:
            vistos_slugs.add(item.slug)
        if tit_norm:
            vistos_titulos.add(tit_norm)

    temas_mesclados: List[Dict[str, Any]] = list(temas_curadoria)
    if isinstance(prev.get("temas_ativos"), list):
        for t_prev in prev["temas_ativos"]:
            if not isinstance(t_prev, dict):
                continue
            s_prev = str(t_prev.get("slug") or "").strip()
            tit_prev = str(t_prev.get("titulo_tema") or t_prev.get("titulo_curto") or t_prev.get("titulo") or "").lower().strip()
            if s_prev and s_prev in vistos_slugs:
                continue
            if tit_prev and tit_prev in vistos_titulos:
                continue
            if not _item_nao_expirado(t_prev, ref_agora):
                continue
            # Preserva temas do pulso (ou outros não-curadoria) sem que o ciclo de 3h os apague
            if str(t_prev.get("origem_pipeline") or "").strip().lower() == "curadoria":
                continue
            if s_prev:
                vistos_slugs.add(s_prev)
            if tit_prev:
                vistos_titulos.add(tit_prev)
            temas_mesclados.append(dict(t_prev))

    temas_curadoria_ord = sorted(temas_curadoria, key=_chave_sort_vitrine, reverse=True)[:20]
    temas_mesclados.sort(key=_chave_sort_vitrine, reverse=True)
    temas_mesclados = temas_mesclados[:20]

    snapshot: Dict[str, Any] = {
        "ok": True,
        "cached": False,
        "source": "snapshot",
        "updatedAt": agora_iso,
        "batch_id": payload.batch_id,
        "temas_ativos": temas_mesclados,
        "temas_curadoria": temas_curadoria_ord,
    }
    if isinstance(prev.get("noticias_quentes"), list):
        nq_ativas = [
            dict(n)
            for n in prev["noticias_quentes"]
            if isinstance(n, dict) and _item_nao_expirado(n, ref_agora)
        ]
        nq_ativas.sort(key=_chave_sort_vitrine, reverse=True)
        snapshot["noticias_quentes"] = nq_ativas[:20]
    return snapshot


def salvar_snapshot_vitrine(payload: CuradoriaPayload) -> None:
    """Gera/atualiza `vitrine_ia` preservando temas do pulso, timestamps originais e ordem cronológica."""
    snapshot: Optional[Dict[str, Any]] = None

    if SNAPSHOT_VITRINE == SNAPSHOT_VITRINE_PADRAO:
        try:
            from src.estado_db import atualizar_estado

            snapshot_db = atualizar_estado(
                "vitrine_ia",
                lambda atual: _construir_snapshot_vitrine_mesclado(
                    atual if isinstance(atual, dict) and atual else _ler_snapshot_arquivo(SNAPSHOT_VITRINE),
                    payload,
                ),
                default={},
            )
            if isinstance(snapshot_db, dict) and snapshot_db:
                snapshot = snapshot_db
                _gravar_snapshot_arquivo(SNAPSHOT_VITRINE, snapshot)
        except Exception:
            snapshot = None

    if snapshot is None:
        dados_prev = _ler_snapshot_vitrine_previo(SNAPSHOT_VITRINE)
        snapshot = _construir_snapshot_vitrine_mesclado(dados_prev, payload)
        _gravar_snapshot_arquivo(SNAPSHOT_VITRINE, snapshot)

    temas_ativos = snapshot.get("temas_ativos") or []
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

