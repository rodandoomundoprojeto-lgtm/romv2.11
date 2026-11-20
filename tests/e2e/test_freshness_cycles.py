"""4-Tier Opaque-Box E2E Test Suite for Python Pipelines, Persistence & FastAPI (F12–F16, Contracts 1–3).

Clean I/O-only mocking:
- Real production modules execute end-to-end (`redacao_v2`, `curadoria`, `src`, `api.routes_v2`, `curadoria.api.main`).
- Only external I/O boundaries are isolated: PostgreSQL (`FakePgConnection` via `psycopg.connect`),
  HTTP/RSS (`httpx.MockTransport` / XML-backed `requests` & `feedparser`), Gemini SDK (`FakeGenaiClient`),
  and filesystem (`tmp_path` patching both `*_PADRAO` and active path constants).
"""
from __future__ import annotations

import asyncio
import calendar
from collections import defaultdict
from datetime import datetime, timedelta, timezone
import importlib
import json
from pathlib import Path
import re
import time
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Tuple

import feedparser
from fastapi.testclient import TestClient
import httpx
import psycopg
import pytest

import api.routes_v2 as routes_v2
import curadoria.agente.analisador as cur_analisador
import curadoria.agente.coletor as cur_coletor
import curadoria.api.main as curadoria_main
import curadoria.pipeline as cur_pipeline
from curadoria.agente.schemas import CuradoriaPayload
import main as root_main
import redacao_v2.coletor_estudo as coletor_estudo
import redacao_v2.orquestrador_editorial as orq_editorial
import redacao_v2.pulso_noticias_quentes as pulso_nq
from redacao_v2.schemas import PayloadNoticiasQuentes
import src.analyst as legacy_analyst
import src.collector as legacy_collector
import src.estado_db as estado_db
import src.publisher as legacy_publisher

REPO_ROOT = Path(__file__).resolve().parents[2]


# ============================================================================
# Fake I/O Boundaries (PostgreSQL, GenAI, HTTP/XML, Path Isolation)
# ============================================================================


def _unwrap_jsonb(val: Any) -> Any:
    if hasattr(val, "obj"):
        return val.obj
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return val
    return val


def _to_utc_dt(val: Any) -> datetime:
    if isinstance(val, datetime):
        return val.replace(tzinfo=timezone.utc) if val.tzinfo is None else val.astimezone(timezone.utc)
    if isinstance(val, str) and val.strip():
        dt = datetime.fromisoformat(val.strip().replace("Z", "+00:00"))
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)
    return datetime.now(timezone.utc)


class FakeDatabase:
    """In-memory PostgreSQL state backing FakePgConnection across multi-cycle tests."""

    def __init__(self) -> None:
        self.now: datetime = datetime.now(timezone.utc)
        self.pipeline_state: Dict[str, Any] = {}
        self.noticias_quentes: Dict[str, Dict[str, Any]] = {}
        self.curadoria_insights: Dict[str, Dict[str, Any]] = {}
        self.eventos: Dict[str, Dict[str, Any]] = {}
        self.conteudos_gerados: List[Dict[str, Any]] = []
        self.config_operacional: Dict[str, str] = {"publicacao_automatica_ativa": "true"}
        self.execucoes_pipeline: List[Dict[str, Any]] = []
        self.fontes_referencia: List[Dict[str, Any]] = []
        self.locks_held: set[str] = set()
        self.busy_locks: set[str] = set()
        self.fail_connect: bool = False
        self._next_nq_id: int = 1
        self._next_ev_id: int = 1
        self._next_exec_id: int = 1

    def seed_noticia_quente(
        self,
        *,
        slug: str,
        titulo_curto: str,
        urgencia_score: int,
        relevancia_score: int,
        updated_at: datetime,
        expires_at: datetime,
        data_publicacao: Optional[datetime] = None,
        created_at: Optional[datetime] = None,
        destaque_ate: Optional[datetime] = None,
        categoria: str = "Geopolitica_Relacoes",
        paises_envolvidos: Optional[List[str]] = None,
        palavras_chave: Optional[List[str]] = None,
        status: str = "ativo",
    ) -> None:
        pub = data_publicacao or updated_at
        self.noticias_quentes[slug] = {
            "id": self._next_nq_id,
            "slug": slug,
            "batch_id": "seed-batch",
            "titulo_curto": titulo_curto,
            "resumo_pulso": f"Resumo factual de {titulo_curto}",
            "impacto_pratico": f"Impacto de {titulo_curto}",
            "categoria": categoria,
            "paises_envolvidos": list(paises_envolvidos or ["BR"]),
            "urgencia_score": urgencia_score,
            "relevancia_score": relevancia_score,
            "nivel_confianca": "alta",
            "ttl_horas": 6,
            "horas_em_destaque": 6,
            "veiculos_origem": ["Veículo Seed"],
            "fontes_urls": [f"https://example.com/{slug}"],
            "palavras_chave": list(palavras_chave or ["geopolitica", "economia"]),
            "links_internos_relacionados": [],
            "payload_json": {},
            "model_id": "gemini-2.5-flash",
            "status": status,
            "data_publicacao": pub,
            "created_at": created_at or pub,
            "destaque_ate": destaque_ate or expires_at,
            "expires_at": expires_at,
            "updated_at": updated_at,
        }
        self._next_nq_id += 1

    def seed_curadoria_insight(
        self,
        *,
        slug: str,
        titulo_tema: str,
        relevancia_score: int,
        updated_at: datetime,
        expires_at: datetime,
        data_publicacao: Optional[datetime] = None,
        categoria_primaria: str = "Geopolitica_Radar",
        categorias_cruzadas: Optional[List[str]] = None,
        palavras_chave_busca: Optional[List[str]] = None,
    ) -> None:
        pub = data_publicacao or updated_at
        self.curadoria_insights[slug] = {
            "slug": slug,
            "batch_id": "seed-curadoria",
            "titulo_tema": titulo_tema,
            "status": "em_alta",
            "categoria_primaria": categoria_primaria,
            "categorias_cruzadas": list(categorias_cruzadas or ["Economia"]),
            "relevancia_score": relevancia_score,
            "ttl_horas": 24,
            "palavras_chave_busca": list(palavras_chave_busca or ["economia", "geopolitica", "mercados", "global"]),
            "gatilho_vitrine": f"Gatilho {titulo_tema}",
            "sintese_nerd": f"Síntese {titulo_tema}",
            "sugestao_pauta_gap": {"titulo_seo": titulo_tema, "angulo_editorial": "Análise", "formato_ideal": "Guia Explicativo"},
            "data_publicacao": pub,
            "created_at": pub,
            "updated_at": updated_at,
            "expires_at": expires_at,
        }


class FakePgCursor:
    def __init__(self, db: FakeDatabase, row_factory: Any = None) -> None:
        self.db = db
        self.row_factory = row_factory
        self._results: List[Any] = []
        self._idx = 0

    def __enter__(self) -> "FakePgCursor":
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        return None

    def _emit_rows(self, rows: List[Dict[str, Any]]) -> None:
        self._results = [dict(r) for r in rows]
        self._idx = 0

    def fetchone(self) -> Any:
        if self._idx >= len(self._results):
            return None
        row = self._results[self._idx]
        self._idx += 1
        return row

    def fetchall(self) -> List[Any]:
        rows = self._results[self._idx:]
        self._idx = len(self._results)
        return rows

    def execute(self, sql: str, params: Any = None) -> None:
        norm = " ".join(sql.split())
        norm_lower = norm.lower()
        self._results = []
        self._idx = 0

        # DDL / Advisory locks
        if norm_lower.startswith("create table") or norm_lower.startswith("alter table"):
            return
        if "pg_advisory_xact_lock" in norm_lower:
            return
        if "pg_try_advisory_lock" in norm_lower:
            key = str(params[0]) if params else ""
            if key in self.db.busy_locks or key in self.db.locks_held:
                self._emit_rows([{"pg_try_advisory_lock": False}])
            else:
                self.db.locks_held.add(key)
                self._emit_rows([{"pg_try_advisory_lock": True}])
            return
        if "pg_advisory_unlock" in norm_lower:
            key = str(params[0]) if params else ""
            self.db.locks_held.discard(key)
            self._emit_rows([{"pg_advisory_unlock": True}])
            return

        # ai_pipeline_state
        if "from ai_pipeline_state" in norm_lower and "select payload" in norm_lower:
            chave = str(params[0])
            payload = self.db.pipeline_state.get(chave)
            if payload is not None:
                self._emit_rows([{"payload": json.loads(json.dumps(payload))}])
            return
        if "insert into ai_pipeline_state" in norm_lower:
            chave = str(params[0])
            payload = _unwrap_jsonb(params[1])
            self.db.pipeline_state[chave] = json.loads(json.dumps(payload))
            return

        # ai_config_operacional
        if "from ai_config_operacional" in norm_lower:
            val = self.db.config_operacional.get("publicacao_automatica_ativa")
            if val is not None:
                self._emit_rows([{"valor": val}])
            return

        # ai_fontes_referencia
        if "from ai_fontes_referencia" in norm_lower:
            self._emit_rows([])
            return

        # ai_execucoes_pipeline
        if "insert into ai_execucoes_pipeline" in norm_lower:
            eid = self.db._next_exec_id
            self.db._next_exec_id += 1
            self.db.execucoes_pipeline.append({"id": eid, "params": params})
            self._emit_rows([{"id": eid}])
            return
        if "update ai_execucoes_pipeline" in norm_lower:
            return

        # ai_noticias_quentes UPSERT
        if "insert into ai_noticias_quentes" in norm_lower:
            p = dict(params)
            slug = str(p["slug"])
            existing = self.db.noticias_quentes.get(slug)
            new_pub = _to_utc_dt(p.get("data_publicacao") or p.get("updated_at") or self.db.now)
            new_exp = _to_utc_dt(p["expires_at"])
            new_dest = _to_utc_dt(p["destaque_ate"])
            new_upd = _to_utc_dt(p["updated_at"])
            ttl_h = max(1, min(168, int(p.get("ttl_horas") or 6)))
            dest_h = max(1, min(24, int(p.get("horas_em_destaque") or ttl_h)))

            if existing:
                # Honor actual SQL conflict clauses (COALESCE/LEAST vs unconditional overwrite)
                if "coalesce(ai_noticias_quentes.data_publicacao" in norm_lower:
                    orig_pub = existing.get("data_publicacao") or existing.get("created_at") or new_pub
                else:
                    orig_pub = existing.get("created_at") or new_pub

                if "expires_at = least(" in norm_lower:
                    capped_exp = orig_pub + timedelta(hours=ttl_h)
                    final_exp = min(new_exp, capped_exp)
                else:
                    final_exp = new_exp

                if "destaque_ate = least(" in norm_lower:
                    capped_dest = orig_pub + timedelta(hours=dest_h)
                    final_dest = min(new_dest, capped_dest)
                else:
                    final_dest = new_dest

                if "is distinct from excluded" in norm_lower:
                    changed = (
                        existing.get("titulo_curto") != p.get("titulo_curto")
                        or existing.get("resumo_pulso") != p.get("resumo_pulso")
                    )
                    final_upd = new_upd if changed else existing.get("updated_at", new_upd)
                else:
                    final_upd = new_upd

                existing.update({
                    "batch_id": p["batch_id"],
                    "titulo_curto": p["titulo_curto"],
                    "resumo_pulso": p["resumo_pulso"],
                    "impacto_pratico": p.get("impacto_pratico"),
                    "categoria": p["categoria"],
                    "paises_envolvidos": list(p.get("paises_envolvidos") or []),
                    "urgencia_score": int(p["urgencia_score"]),
                    "relevancia_score": int(p["relevancia_score"]),
                    "nivel_confianca": p.get("nivel_confianca", "alta"),
                    "ttl_horas": ttl_h,
                    "horas_em_destaque": dest_h,
                    "veiculos_origem": list(p.get("veiculos_origem") or []),
                    "fontes_urls": list(p.get("fontes_urls") or []),
                    "palavras_chave": list(p.get("palavras_chave") or []),
                    "links_internos_relacionados": _unwrap_jsonb(p.get("links_internos_relacionados")),
                    "payload_json": _unwrap_jsonb(p.get("payload_json")),
                    "model_id": p.get("model_id"),
                    "status": p.get("status", "ativo"),
                    "data_publicacao": orig_pub,
                    "destaque_ate": final_dest,
                    "expires_at": final_exp,
                    "updated_at": final_upd,
                })
            else:
                self.db.noticias_quentes[slug] = {
                    "id": self.db._next_nq_id,
                    "slug": slug,
                    "batch_id": p["batch_id"],
                    "titulo_curto": p["titulo_curto"],
                    "resumo_pulso": p["resumo_pulso"],
                    "impacto_pratico": p.get("impacto_pratico"),
                    "categoria": p["categoria"],
                    "paises_envolvidos": list(p.get("paises_envolvidos") or []),
                    "urgencia_score": int(p["urgencia_score"]),
                    "relevancia_score": int(p["relevancia_score"]),
                    "nivel_confianca": p.get("nivel_confianca", "alta"),
                    "ttl_horas": ttl_h,
                    "horas_em_destaque": dest_h,
                    "veiculos_origem": list(p.get("veiculos_origem") or []),
                    "fontes_urls": list(p.get("fontes_urls") or []),
                    "palavras_chave": list(p.get("palavras_chave") or []),
                    "links_internos_relacionados": _unwrap_jsonb(p.get("links_internos_relacionados")),
                    "payload_json": _unwrap_jsonb(p.get("payload_json")),
                    "model_id": p.get("model_id"),
                    "status": p.get("status", "ativo"),
                    "data_publicacao": new_pub,
                    "created_at": new_pub,
                    "destaque_ate": new_dest,
                    "expires_at": new_exp,
                    "updated_at": new_upd,
                }
                self.db._next_nq_id += 1
            return

        # /v2/sugestoes-contextuais tag aggregation CTE
        if "with artigos_ativos as" in norm_lower and "from ai_noticias_quentes" in norm_lower:
            now = self.db.now
            p_list = list(params or [])
            limit = int(p_list[-1]) if p_list else 4
            rows = [
                r for r in self.db.noticias_quentes.values()
                if r["expires_at"] > now and r["destaque_ate"] > now and r["status"] in ("ativo", "publicado", "aguardando_revisao")
            ]
            # Basic scope filtering when pais param is present
            if "not (%s = any(paises_envolvidos))" in norm_lower and p_list:
                pais_up = str(p_list[1] if "categoria = %s" in norm_lower else p_list[0]).upper()
                rows = [r for r in rows if pais_up not in [c.upper() for c in r.get("paises_envolvidos", [])]]
            elif "%s = any(paises_envolvidos)" in norm_lower and p_list:
                pais_up = str(p_list[1] if "categoria = %s" in norm_lower else p_list[0]).upper()
                rows = [r for r in rows if pais_up in [c.upper() for c in r.get("paises_envolvidos", [])]]

            tag_groups: Dict[str, Dict[str, Any]] = {}
            for r in rows:
                for kw in (r.get("palavras_chave") or []):
                    raw = str(kw).strip()
                    low = raw.lower()
                    if len(low) < 2:
                        continue
                    grp = tag_groups.setdefault(low, {
                        "tag_norm": low,
                        "tag_display": raw,
                        "article_ids": set(),
                        "score_max": 0.0,
                        "ultima_atualizacao": r["updated_at"],
                    })
                    grp["article_ids"].add(r["id"])
                    score = r["urgencia_score"] * 0.6 + r["relevancia_score"] * 0.4
                    grp["score_max"] = max(grp["score_max"], score)
                    grp["ultima_atualizacao"] = max(grp["ultima_atualizacao"], r["updated_at"])

            agg = [
                {
                    "tag_norm": g["tag_norm"],
                    "tag_display": g["tag_display"],
                    "artigos_count": len(g["article_ids"]),
                    "score_max": g["score_max"],
                    "ultima_atualizacao": g["ultima_atualizacao"],
                }
                for g in tag_groups.values()
                if g["article_ids"]
            ]
            agg.sort(key=lambda x: (x["artigos_count"], x["score_max"], x["ultima_atualizacao"]), reverse=True)
            self._emit_rows(agg[:limit])
            return

        # ai_noticias_quentes SELECT
        if "from ai_noticias_quentes" in norm_lower:
            now = self.db.now
            p_list = list(params or [])
            rows = list(self.db.noticias_quentes.values())
            if "expires_at > now()" in norm_lower:
                rows = [r for r in rows if r["expires_at"] > now]
            if "destaque_ate > now()" in norm_lower:
                rows = [r for r in rows if r["destaque_ate"] > now]
            if "status in (" in norm_lower:
                rows = [r for r in rows if r["status"] in ("ativo", "publicado", "aguardando_revisao")]

            idx_p = 0
            if "categoria = %s" in norm_lower and idx_p < len(p_list):
                cat = p_list[idx_p]
                idx_p += 1
                rows = [r for r in rows if r.get("categoria") == cat]
            if "%s = any(paises_envolvidos)" in norm_lower and idx_p < len(p_list):
                pais_up = str(p_list[idx_p]).upper()
                idx_p += 1
                rows = [r for r in rows if pais_up in [c.upper() for c in r.get("paises_envolvidos", [])]]

            limit = int(p_list[-1]) if p_list else 15
            order_part = norm_lower.split("order by", 1)[1].split("limit", 1)[0] if "order by" in norm_lower else ""
            # Execute the exact ordering requested by SQL
            if order_part.strip().startswith("urgencia_score"):
                rows.sort(
                    key=lambda r: (r["urgencia_score"], r["relevancia_score"], r["updated_at"]),
                    reverse=True,
                )
            else:
                rows.sort(
                    key=lambda r: (
                        r.get("data_publicacao") or r.get("created_at") or r["updated_at"],
                        r["updated_at"],
                        r["urgencia_score"],
                        r["relevancia_score"],
                    ),
                    reverse=True,
                )
            # Project only the requested SELECT columns (matching real PostgreSQL)
            select_m = re.search(r"select\s+(.*?)\s+from\s+ai_noticias_quentes", norm_lower)
            if select_m and "*" not in select_m.group(1):
                col_tokens = [c.strip().split()[-1].split(".")[-1] for c in select_m.group(1).split(",")]
                projected = [{c: r.get(c) for c in col_tokens if c in r} for r in rows[:limit]]
                self._emit_rows(projected)
            else:
                self._emit_rows(rows[:limit])
            return

        # ai_eventos & ai_conteudos_gerados
        if "insert into ai_eventos" in norm_lower:
            p = dict(params)
            slug = str(p["slug"])
            ev = self.db.eventos.get(slug)
            if ev:
                ev.update({"titulo_evento": p["titulo_evento"], "updated_at": p["updated_at"]})
            else:
                eid = self.db._next_ev_id
                self.db._next_ev_id += 1
                ev = {"id": eid, **p, "created_at": p["updated_at"]}
                self.db.eventos[slug] = ev
            self._emit_rows([{"id": ev["id"]}])
            return
        if "from ai_conteudos_gerados" in norm_lower:
            self._emit_rows([{"coalesce": 0}])
            return
        if "insert into ai_conteudos_gerados" in norm_lower:
            self.db.conteudos_gerados.append({"params": params})
            return
        if "from ai_eventos" in norm_lower:
            self._emit_rows([])
            return
        if "from ai_coberturas_por_veiculo" in norm_lower:
            self._emit_rows([])
            return

        # ai_curadoria_insights
        if "insert into ai_curadoria_insights" in norm_lower:
            p = dict(params)
            slug = str(p["slug"])
            now = self.db.now
            existing = self.db.curadoria_insights.get(slug)
            pub = (existing.get("data_publicacao") if existing else None) or _to_utc_dt(p.get("updated_at") or now)
            self.db.curadoria_insights[slug] = {
                **p,
                "sugestao_pauta_gap": _unwrap_jsonb(p.get("sugestao_pauta_gap")),
                "data_publicacao": pub,
                "created_at": (existing.get("created_at") if existing else pub),
                "updated_at": _to_utc_dt(p["updated_at"]),
                "expires_at": _to_utc_dt(p["expires_at"]),
            }
            return
        if "select slug from ai_curadoria_insights" in norm_lower:
            rows = sorted(self.db.curadoria_insights.values(), key=lambda r: r["updated_at"], reverse=True)
            self._emit_rows([{"slug": r["slug"]} for r in rows])
            return
        if "from ai_curadoria_insights" in norm_lower:
            now = self.db.now
            p_list = list(params or [])
            rows = [r for r in self.db.curadoria_insights.values() if r["expires_at"] > now]
            if "categoria_primaria = %s" in norm_lower and len(p_list) >= 3:
                cat = p_list[0]
                rows = [
                    r for r in rows
                    if r.get("categoria_primaria") == cat or cat in (r.get("categorias_cruzadas") or [])
                ]
            limit = int(p_list[-1]) if p_list else 6
            order_part = norm_lower.split("order by", 1)[1].split("limit", 1)[0] if "order by" in norm_lower else ""
            if order_part.strip().startswith("relevancia_score"):
                rows.sort(key=lambda r: r["relevancia_score"], reverse=True)
            else:
                rows.sort(
                    key=lambda r: (
                        r.get("data_publicacao") or r.get("created_at") or r["updated_at"],
                        r["updated_at"],
                        r["relevancia_score"],
                    ),
                    reverse=True,
                )
            self._emit_rows(rows[:limit])
            return

        # Default fallback (e.g. conteudos / sitemap queries)
        self._emit_rows([])


class FakePgConnection:
    def __init__(self, db: FakeDatabase, row_factory: Any = None) -> None:
        self.db = db
        self.row_factory = row_factory
        self.closed = False

    def __enter__(self) -> "FakePgConnection":
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        return None

    def cursor(self) -> FakePgCursor:
        return FakePgCursor(self.db, row_factory=self.row_factory)

    def commit(self) -> None:
        pass

    def rollback(self) -> None:
        pass

    def close(self) -> None:
        self.closed = True


class FakeGenaiClient:
    """I/O-only fake for google.genai.Client capturing model/contents/config."""

    def __init__(self, responder: Any) -> None:
        self.calls: List[Dict[str, Any]] = []
        self._responder = responder
        self.models = self

    def generate_content(self, model: str, contents: Any, config: Any = None) -> Any:
        self.calls.append({"model": model, "contents": contents, "config": config})
        result = self._responder(model, contents, config) if callable(self._responder) else self._responder
        if isinstance(result, BaseException):
            raise result
        if hasattr(result, "text") or hasattr(result, "parsed"):
            return result
        if isinstance(result, str):
            return SimpleNamespace(text=result, parsed=None)
        if hasattr(result, "model_dump_json"):
            return SimpleNamespace(text=result.model_dump_json(), parsed=result)
        return SimpleNamespace(text=json.dumps(result), parsed=result)


class FakePathRoot:
    """Redirects `Path(__file__).resolve().parents[1]` in api.routes_v2 to tmp_path."""

    def __init__(self, tmp_root: Path, raw: Any = None) -> None:
        self._tmp_root = tmp_root
        self._raw = Path(raw) if raw is not None else tmp_root

    def resolve(self) -> "FakePathRoot":
        return self

    @property
    def parents(self) -> Tuple[Path, Path]:
        return (self._tmp_root, self._tmp_root)

    def __truediv__(self, other: Any) -> Path:
        return self._tmp_root / other

    def is_file(self) -> bool:
        return self._raw.is_file()

    def exists(self) -> bool:
        return self._raw.exists()

    def read_text(self, *args: Any, **kwargs: Any) -> str:
        return self._raw.read_text(*args, **kwargs)


def _rss2_xml(items: List[Dict[str, Optional[str]]], title: str = "Feed Teste") -> bytes:
    entries_xml = []
    for it in items:
        pub_tag = f"<pubDate>{it['pubDate']}</pubDate>" if it.get("pubDate") else ""
        guid_tag = f"<guid>{it.get('guid') or it['link']}</guid>"
        entries_xml.append(
            f"<item><title>{it['title']}</title><link>{it['link']}</link>"
            f"{guid_tag}<description>{it.get('description', 'Descrição longa o suficiente para passar o filtro mínimo de cem caracteres exigido pelo coletor de notícias internacional.')}</description>"
            f"{pub_tag}</item>"
        )
    xml = (
        f'<?xml version="1.0" encoding="UTF-8"?>'
        f'<rss version="2.0"><channel><title>{title}</title><link>https://example.com</link>'
        f'{"".join(entries_xml)}</channel></rss>'
    )
    return xml.encode("utf-8")


def _atom_xml(entries: List[Dict[str, Optional[str]]], title: str = "Atom Teste") -> bytes:
    entries_xml = []
    for it in entries:
        pub_tag = f"<published>{it['published']}</published>" if it.get("published") else ""
        upd_tag = f"<updated>{it['updated']}</updated>" if it.get("updated") else ""
        entries_xml.append(
            f"<entry><id>{it.get('id') or it['link']}</id><title>{it['title']}</title>"
            f"<link href=\"{it['link']}\"/>"
            f"<summary>{it.get('summary', 'Resumo Atom detalhado com mais de cem caracteres para cobrir o requisito mínimo de conteúdo do coletor RSS e Atom.')}</summary>"
            f"{pub_tag}{upd_tag}</entry>"
        )
    xml = (
        f'<?xml version="1.0" encoding="UTF-8"?>'
        f'<feed xmlns="http://www.w3.org/2005/Atom"><title>{title}</title>'
        f'{"".join(entries_xml)}</feed>'
    )
    return xml.encode("utf-8")


@pytest.fixture()
def isolated_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Fully isolates DB, filesystem snapshots, caches, and env vars for each E2E test."""
    db = FakeDatabase()
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    (tmp_path / "config").mkdir(parents=True, exist_ok=True)
    (tmp_path / "curadoria_out").mkdir(parents=True, exist_ok=True)

    vitrine_tmp = tmp_path / "data" / "vitrine_ia.json"
    feed_tmp = tmp_path / "data" / "feed_output.json"
    history_tmp = tmp_path / "data" / "history.json"
    sources_tmp = tmp_path / "config" / "sources.json"
    saida_curadoria_tmp = tmp_path / "curadoria_out" / "ultimo_payload.json"

    sources_tmp.write_text("[]", encoding="utf-8")

    # Clear module caches & reset table flag before test
    routes_v2._SUGESTOES_CACHE.clear()
    curadoria_main._rate_buckets.clear()
    estado_db._tabela_garantida = False

    # Clear any Gemini model env overrides so default compliance is genuinely tested
    for var in ("GEMINI_MODEL", "GEMINI_MODEL_PULSO", "GEMINI_MODEL_EDITORIAL", "GEMINI_MODEL_RADAR", "CURADORIA_MODEL", "GEMINI_SUGESTAO_MODEL"):
        monkeypatch.delenv(var, raising=False)
    importlib.reload(cur_analisador)
    importlib.reload(pulso_nq)
    importlib.reload(orq_editorial)
    cur_pipeline.executar_agente_analisador = cur_analisador.executar_agente_analisador

    monkeypatch.setenv("CURADORIA_DATABASE_URL", "postgresql://test:test@localhost:5432/testdb")
    monkeypatch.setenv("DATABASE_URL", "postgresql://test:test@localhost:5432/testdb")
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setenv("CURADORIA_SECRET_TOKEN", "test-secret-token")
    monkeypatch.setenv("CURADORIA_BACKEND_URL", "https://api.rodandoomundo.com.br")
    monkeypatch.setenv("ROM_DISABLE_NOTIFICATIONS", "1")
    for env_notif in (
        "DISCORD_WEBHOOK_URL",
        "DISCORD_WEBHOOK_RADAR",
        "DISCORD_WEBHOOK_EDITORIAL",
        "DISCORD_WEBHOOK_CRITICO",
        "DISCORD_WEBHOOK_MANUTENCAO",
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_CHAT_ID",
    ):
        monkeypatch.delenv(env_notif, raising=False)

    def fake_connect(*args: Any, **kwargs: Any) -> FakePgConnection:
        if db.fail_connect:
            raise psycopg.OperationalError("Simulated DB outage")
        return FakePgConnection(db, row_factory=kwargs.get("row_factory"))

    monkeypatch.setattr(psycopg, "connect", fake_connect)
    monkeypatch.setattr(curadoria_main.psycopg, "connect", fake_connect)
    monkeypatch.setattr(routes_v2.psycopg, "connect", fake_connect)
    if estado_db.psycopg is not None:
        monkeypatch.setattr(estado_db.psycopg, "connect", fake_connect)

    # Patch BOTH *_PADRAO and active path constants so DB-mirroring paths work in tmp_path
    monkeypatch.setattr(pulso_nq, "SNAPSHOT_VITRINE_PATH", vitrine_tmp)
    monkeypatch.setattr(cur_pipeline, "SNAPSHOT_VITRINE_PADRAO", vitrine_tmp)
    monkeypatch.setattr(cur_pipeline, "SNAPSHOT_VITRINE", vitrine_tmp)
    monkeypatch.setattr(cur_pipeline, "SAIDA_LOCAL", saida_curadoria_tmp)
    monkeypatch.setattr(cur_coletor, "SOURCES_JSON_PATH", sources_tmp)

    monkeypatch.setattr(legacy_publisher, "FEED_OUTPUT_PATH_PADRAO", str(feed_tmp))
    monkeypatch.setattr(legacy_publisher, "FEED_OUTPUT_PATH", str(feed_tmp))
    monkeypatch.setattr(legacy_publisher, "HISTORY_PATH_PADRAO", str(history_tmp))
    monkeypatch.setattr(legacy_publisher, "HISTORY_PATH", str(history_tmp))
    monkeypatch.setattr(legacy_analyst, "FEED_OUTPUT_PATH_PADRAO", str(feed_tmp))
    monkeypatch.setattr(legacy_analyst, "FEED_OUTPUT_PATH", str(feed_tmp))
    monkeypatch.setattr(legacy_collector, "CONFIG_PATH", str(sources_tmp))
    monkeypatch.setattr(legacy_collector, "HISTORY_PATH", str(history_tmp))

    monkeypatch.setattr(routes_v2, "Path", lambda raw=None: FakePathRoot(tmp_path, raw))

    yield SimpleNamespace(
        db=db,
        tmp_path=tmp_path,
        vitrine_path=vitrine_tmp,
        feed_path=feed_tmp,
        history_path=history_tmp,
        sources_path=sources_tmp,
    )

    routes_v2._SUGESTOES_CACHE.clear()
    curadoria_main._rate_buckets.clear()
    estado_db._tabela_garantida = False
    root_main.app.dependency_overrides.clear()
    curadoria_main.app.dependency_overrides.clear()


def _install_httpx_mock(monkeypatch: pytest.MonkeyPatch, routes: Dict[str, bytes]) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url in routes:
            return httpx.Response(200, content=routes[url])
        return httpx.Response(404, content=b"")

    transport = httpx.MockTransport(handler)
    real_async_client = httpx.AsyncClient

    class PatchedAsyncClient(real_async_client):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            kwargs.pop("transport", None)
            super().__init__(transport=transport, *args, **kwargs)

    monkeypatch.setattr(coletor_estudo.httpx, "AsyncClient", PatchedAsyncClient)


def _make_pulso_payload(batch_id: str, items: List[Dict[str, Any]], model_id: str = "gemini-2.5-flash") -> PayloadNoticiasQuentes:
    normalized = []
    for it in items:
        d = dict(it)
        d.setdefault("resumo_pulso", f"Resumo de {d.get('titulo_curto', 'item')}")
        d.setdefault("urgencia_score", 80)
        d.setdefault("relevancia_score", d["urgencia_score"])
        normalized.append(d)
    return PayloadNoticiasQuentes.model_validate({
        "batch_id": batch_id,
        "model_id": model_id,
        "noticias_quentes": normalized,
        "eventos_comparados": [],
    })


def _make_curadoria_payload(batch_id: str, insights: List[Dict[str, Any]]) -> CuradoriaPayload:
    full_insights = []
    for it in insights:
        full_insights.append({
            "slug": it["slug"],
            "titulo_tema": it["titulo_tema"],
            "status": it.get("status", "em_alta"),
            "categoria_primaria": it.get("categoria_primaria", "Geopolitica_Radar"),
            "categorias_cruzadas": it.get("categorias_cruzadas", ["Economia"]),
            "relevancia_score": it.get("relevancia_score", 85),
            "ttl_horas": it.get("ttl_horas", 24),
            "palavras_chave_busca": it.get("palavras_chave_busca", ["economia", "geopolitica", "mercados", "global"]),
            "gatilho_vitrine": it.get("gatilho_vitrine", f"Gatilho para {it['titulo_tema']}"),
            "sintese_nerd": it.get("sintese_nerd", f"Síntese contextual para {it['titulo_tema']}"),
            "sugestao_pauta_gap": it.get("sugestao_pauta_gap", {
                "titulo_seo": f"Entenda {it['titulo_tema']}",
                "angulo_editorial": "Análise apartidária dos impactos práticos.",
                "formato_ideal": "Analise Geopolitica",
            }),
        })
    return CuradoriaPayload.model_validate({"batch_id": batch_id, "insights": full_insights})


# ============================================================================
# TIER 1 — FEATURE COVERAGE (Happy-Path Isolated Verification: F12–F15)
# ============================================================================


def test_t1_f12_pulso_collector_snapshot_sorting_ttl_and_lock(isolated_env, monkeypatch):
    """F12: Pulso collector UTC dates, age cutoff, snapshot recency sorting, expiry pruning, slug stability & lock."""
    now = datetime.now(timezone.utc).replace(microsecond=0)
    t_recent = (now - timedelta(minutes=20)).strftime("%a, %d %b %Y %H:%M:%S GMT")
    t_mid = (now - timedelta(hours=2)).strftime("%a, %d %b %Y %H:%M:%S GMT")
    t_too_old = (now - timedelta(hours=48)).strftime("%a, %d %b %Y %H:%M:%S GMT")

    feed_url = "https://feed.example.com/pulso.xml"
    _install_httpx_mock(monkeypatch, {
        feed_url: _rss2_xml([
            {"title": "Old 48h", "link": "https://ex.com/old", "pubDate": t_too_old},
            {"title": "Mid 2h", "link": "https://ex.com/mid", "pubDate": t_mid},
            {"title": "Fresh 20m", "link": "https://ex.com/fresh", "pubDate": t_recent},
        ])
    })

    async def _collect():
        async with httpx.AsyncClient() as client:
            return await coletor_estudo.coletar_feed_individual_async(
                client,
                {"nome": "Fonte Pulso", "url": feed_url, "tipo_fonte": "rss_feed"},
                max_itens=10,
                max_idade_horas=12.0,
            )

    collected = asyncio.run(_collect())
    assert [it["titulo"] for it in collected] == ["Fresh 20m", "Mid 2h"]
    assert collected[0]["published_at"].endswith("+00:00") or collected[0]["published_at"].endswith("Z")

    # Seed an already-expired item + pre-existing slug in snapshot before Cycle 2
    t_orig = (now - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    t_new = (now - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
    t_exp = (now - timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
    isolated_env.vitrine_path.write_text(json.dumps({
        "updatedAt": t_orig,
        "temas_ativos": [
            {"slug": "exp-item", "titulo_tema": "Expired Theme", "data_publicacao": t_orig, "expires_at": t_exp, "urgencia_score": 99},
            {"slug": "keep-item", "titulo_tema": "Kept Theme", "data_publicacao": t_orig, "expires_at": (now + timedelta(hours=4)).strftime("%Y-%m-%dT%H:%M:%SZ"), "urgencia_score": 98},
        ],
        "noticias_quentes": [
            {"slug": "exp-item", "titulo_curto": "Expired Theme", "data_publicacao": t_orig, "expires_at": t_exp, "urgencia_score": 99},
            {"slug": "keep-item", "titulo_curto": "Kept Theme", "data_publicacao": t_orig, "expires_at": (now + timedelta(hours=4)).strftime("%Y-%m-%dT%H:%M:%SZ"), "urgencia_score": 98},
        ],
    }), encoding="utf-8")

    payload = _make_pulso_payload("20261118-1200", [
        {
            "slug": "keep-item",
            "titulo_curto": "Kept Theme",
            "resumo_pulso": "Resumo mantido.",
            "urgencia_score": 98,
            "relevancia_score": 95,
            "data_publicacao": t_new,  # Re-seen with newer timestamp -> must keep original!
        },
        {
            "slug": "breaking-lower-score",
            "titulo_curto": "Breaking Lower Score",
            "resumo_pulso": "Fato novo de 5 minutos.",
            "urgencia_score": 70,
            "relevancia_score": 70,
            "data_publicacao": t_new,
        },
    ])
    pulso_nq.salvar_snapshot_vitrine_pulso(payload)
    snap = json.loads(isolated_env.vitrine_path.read_text(encoding="utf-8"))
    slugs_temas = [t["slug"] for t in snap["temas_ativos"]]
    slugs_nq = [n["slug"] for n in snap["noticias_quentes"]]
    assert "exp-item" not in slugs_temas and "exp-item" not in slugs_nq
    assert slugs_temas[0] == "breaking-lower-score"
    assert slugs_nq[0] == "breaking-lower-score"
    kept = next(t for t in snap["temas_ativos"] if t["slug"] == "keep-item")
    assert kept["data_publicacao"] == t_orig

    # Advisory lock busy -> pipeline aborts cleanly returning None
    monkeypatch.setattr(pulso_nq, "_carregar_fontes_pulso_com_banco", lambda _db: [{"nome": "F", "url": feed_url}])
    fake_ai = FakeGenaiClient(payload)
    isolated_env.db.busy_locks.add(pulso_nq.LOCK_PULSO_KEY)
    res_locked = asyncio.run(pulso_nq.executar_pipeline_pulso_async(client=fake_ai))
    assert res_locked is None

    # Advisory lock free -> executes with gemini-3.5-flash & persists
    isolated_env.db.busy_locks.clear()
    res_ok = asyncio.run(pulso_nq.executar_pipeline_pulso_async(client=fake_ai))
    assert res_ok is not None
    assert fake_ai.calls[0]["model"] == "gemini-3.5-flash"
    assert "breaking-lower-score" in isolated_env.db.noticias_quentes


def test_t1_f13_curadoria_collector_preserves_pulso_and_workflow(isolated_env, monkeypatch):
    """F13: Curadoria time window, RSS collection ordering, gemini-2.5 model, pulso preservation, workflow safety."""
    now = datetime.now(timezone.utc).replace(microsecond=0)
    t_11h = (now - timedelta(hours=11)).strftime("%a, %d %b %Y %H:%M:%S GMT")
    t_1h = (now - timedelta(hours=1)).strftime("%a, %d %b %Y %H:%M:%S GMT")
    t_20h = (now - timedelta(hours=20)).strftime("%a, %d %b %Y %H:%M:%S GMT")

    # 11h GMT fits within 12h window; 20h GMT rejected
    parsed_ok = feedparser.parse(_rss2_xml([{"title": "11h", "link": "https://ex.com/11", "pubDate": t_11h}])).entries[0]
    parsed_old = feedparser.parse(_rss2_xml([{"title": "20h", "link": "https://ex.com/20", "pubDate": t_20h}])).entries[0]
    assert cur_coletor.dentro_da_janela_tempo(parsed_ok, horas_limite=12) is True
    assert cur_coletor.dentro_da_janela_tempo(parsed_old, horas_limite=12) is False

    feed_url = "https://feed.example.com/curadoria.xml"
    xml_bytes = _rss2_xml([
        {"title": "Older 11h Item", "link": "https://ex.com/11", "pubDate": t_11h},
        {"title": "Fresh 1h Item", "link": "https://ex.com/1", "pubDate": t_1h},
        {"title": "Stale 20h Item", "link": "https://ex.com/20", "pubDate": t_20h},
    ])
    monkeypatch.setattr(cur_coletor, "FEEDS_RSS_RODANDO_O_MUNDO", {"Economia": [feed_url]})
    monkeypatch.setattr(cur_coletor.requests, "get", lambda *a, **kw: SimpleNamespace(content=xml_bytes))
    collected = cur_coletor.coletar_feeds_rss(horas_limite=12, por_feed=10)
    assert [it["titulo"] for it in collected] == ["Fresh 1h Item", "Older 11h Item"]

    # Seed pulso items in vitrine_ia first
    t_pulso = (now - timedelta(minutes=25)).strftime("%Y-%m-%dT%H:%M:%SZ")
    pulso_nq.salvar_snapshot_vitrine_pulso(_make_pulso_payload("20261118-1135", [{
        "slug": "pulso-theme-1",
        "titulo_curto": "Pulso Active Theme",
        "resumo_pulso": "Resumo pulso.",
        "urgencia_score": 88,
        "relevancia_score": 85,
        "data_publicacao": t_pulso,
    }]))

    # Check curadoria analisador uses gemini-2.5-*
    cur_payload = _make_curadoria_payload("20261118-1200", [{
        "slug": "curadoria-theme-1",
        "titulo_tema": "Curadoria Theme",
        "relevancia_score": 92,
    }])
    fake_ai = FakeGenaiClient(cur_payload)
    monkeypatch.setattr(cur_analisador.genai, "Client", lambda **kw: fake_ai)
    out_payload = cur_analisador.executar_agente_analisador(collected, [])
    assert fake_ai.calls[0]["model"].startswith("gemini-3.")

    # Run curadoria salvar_snapshot_vitrine -> MUST preserve pulso-theme-1
    cur_pipeline.salvar_snapshot_vitrine(out_payload)
    snap = json.loads(isolated_env.vitrine_path.read_text(encoding="utf-8"))
    slugs = [t["slug"] for t in snap["temas_ativos"]]
    assert "pulso-theme-1" in slugs, "curadoria/pipeline.py wiped pulso_30m tema from vitrine_ia!"
    assert "curadoria-theme-1" in slugs
    assert slugs[0] == "curadoria-theme-1"  # newer than t_pulso (T0-25m)
    assert isolated_env.db.pipeline_state["vitrine_ia"]["temas_ativos"][0]["slug"] == "curadoria-theme-1"

    # Workflow check: .github/workflows/curadoria.yml must NOT commit/push data/vitrine_ia.json
    wf_text = (REPO_ROOT / ".github" / "workflows" / "curadoria.yml").read_text(encoding="utf-8")
    assert "git push" not in wf_text.lower()
    assert "git add data/vitrine_ia.json" not in wf_text.lower()


def test_t1_f14_legacy_collector_analyst_publisher_and_manual_cards(isolated_env, monkeypatch):
    """F14: src.collector sorting before slice, analyst DB preference & gemini-2.5, publisher DB authority & manual sort/cap."""
    now = datetime.now(timezone.utc).replace(microsecond=0)
    # 7 items where items 6 & 7 are newest and item 1 is undated
    xml_items = [
        {"title": "Undated Item 1", "link": "https://ex.com/u1", "pubDate": None},
    ]
    for i in range(2, 6):
        xml_items.append({
            "title": f"Older Item {i}",
            "link": f"https://ex.com/o{i}",
            "pubDate": (now - timedelta(hours=10 + i)).strftime("%a, %d %b %Y %H:%M:%S GMT"),
        })
    xml_items.append({
        "title": "Newest Item 6",
        "link": "https://ex.com/n6",
        "pubDate": (now - timedelta(minutes=5)).strftime("%a, %d %b %Y %H:%M:%S GMT"),
    })
    xml_items.append({
        "title": "Second Newest Item 7",
        "link": "https://ex.com/n7",
        "pubDate": (now - timedelta(minutes=15)).strftime("%a, %d %b %Y %H:%M:%S GMT"),
    })

    isolated_env.sources_path.write_text(json.dumps([
        {"nome": "Fonte Legacy", "tipo": "rss", "id_ou_url": "https://feed.example.com/legacy.xml", "categoria": "geopolitica"}
    ]), encoding="utf-8")
    parsed_feed = feedparser.parse(_rss2_xml(xml_items))
    monkeypatch.setattr(legacy_collector.feedparser, "parse", lambda _url: parsed_feed)

    collected = legacy_collector.collect_new_items()
    titles = [c["texto_conteudo"].splitlines()[0].replace("Título: ", "") for c in collected]
    assert "Newest Item 6" in titles
    assert "Second Newest Item 7" in titles
    assert "Undated Item 1" not in titles  # sorted after dated items -> excluded by top 5 slice

    # DB vs stale disk divergence for analyst & publisher
    t_db = (now - timedelta(minutes=20)).strftime("%Y-%m-%dT%H:%M:%SZ")
    t_disk_old = (now - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%SZ")
    isolated_env.db.pipeline_state["feed_output"] = [
        {
            "titulo": "Authoritative DB Card",
            "resumo": "Resumo DB.",
            "analise": "Análise DB.",
            "categoria": "geopolitica",
            "fonte_nome": "Veículo DB",
            "fonte_url": "https://db.example.com/1",
            "data_publicacao": t_db,
        }
    ]
    isolated_env.feed_path.write_text(json.dumps([
        {
            "titulo": "Stale Disk Card",
            "resumo": "Resumo Disk.",
            "analise": "Análise Disk.",
            "categoria": "geopolitica",
            "fonte_nome": "Veículo Disk",
            "fonte_url": "https://disk.example.com/old",
            "data_publicacao": t_disk_old,
        }
    ]), encoding="utf-8")

    # src.analyst reads DB first and uses gemini-2.5-flash
    recent = legacy_analyst.get_recent_titles(10)
    assert recent == ["Authoritative DB Card"]
    fake_ai = FakeGenaiClient(json.dumps({"duplicado": False, "titulo": "Analise Nova", "resumo": "R", "analise": "A"}))
    monkeypatch.setattr(legacy_analyst.genai, "Client", lambda **kw: fake_ai)
    analyzed = legacy_analyst.analyze_item({
        "item_id": "id-1", "fonte_nome": "Fonte", "fonte_url": "https://ex.com/1",
        "categoria": "geopolitica", "texto_conteudo": "Conteudo suficiente", "data_publicacao": t_db,
    })
    assert analyzed is not None and fake_ai.calls[0]["model"] == "gemini-3.5-flash"

    # src.publisher treats DB as authoritative (must NOT resurrect Stale Disk Card)
    t_pub_new = (now - timedelta(minutes=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    legacy_publisher.publish_cards([{
        "titulo": "Brand New Published Card",
        "resumo": "Resumo",
        "analise": "Analise",
        "categoria": "geopolitica",
        "fonte_nome": "Veículo Novo",
        "fonte_url": "https://novo.example.com/2",
        "data_publicacao": t_pub_new,
    }])
    db_feed = isolated_env.db.pipeline_state["feed_output"]
    feed_titles = [c["titulo"] for c in db_feed]
    assert feed_titles[0] == "Brand New Published Card"
    assert "Authoritative DB Card" in feed_titles
    assert "Stale Disk Card" not in feed_titles, "Stale disk card resurrected over authoritative DB!"

    # Manual card published with older timestamp must stay sorted newest-first, not blindly pinned at index 0
    t_manual_old = (now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    legacy_publisher.publicar_card_manual({
        "slug": "manual-older-backdate",
        "titulo": "Manual Backdated Card",
        "resumo": "Resumo manual",
        "data_publicacao": t_manual_old,
    })
    db_feed_after_manual = isolated_env.db.pipeline_state["feed_output"]
    assert db_feed_after_manual[0]["titulo"] == "Brand New Published Card", (
        "publicar_card_manual inserted older card at index 0 without sorting by data_publicacao DESC!"
    )


def test_t1_f15_fastapi_ordering_fallback_cache_busting_and_models(isolated_env, monkeypatch):
    """F15: FastAPI recency-first ordering, DB fallback, cache-busting (_t & refresh=1), and Gemini 2.5 models."""
    now = isolated_env.db.now
    t_old = now - timedelta(hours=18)
    t_new = now - timedelta(minutes=3)

    isolated_env.db.seed_noticia_quente(
        slug="nq-old-high",
        titulo_curto="Old Score 99",
        urgencia_score=99,
        relevancia_score=99,
        updated_at=t_old,
        data_publicacao=t_old,
        expires_at=now + timedelta(hours=6),
        palavras_chave=["tarifas", "antigo"],
    )
    isolated_env.db.seed_noticia_quente(
        slug="nq-new-mid",
        titulo_curto="New Score 75",
        urgencia_score=75,
        relevancia_score=75,
        updated_at=t_new,
        data_publicacao=t_new,
        expires_at=now + timedelta(hours=6),
        palavras_chave=["dolar", "agora"],
    )
    isolated_env.db.seed_curadoria_insight(
        slug="cur-old-high",
        titulo_tema="Curadoria Old Score 99",
        relevancia_score=99,
        updated_at=t_old,
        data_publicacao=t_old,
        expires_at=now + timedelta(hours=12),
    )
    isolated_env.db.seed_curadoria_insight(
        slug="cur-new-mid",
        titulo_tema="Curadoria New Score 70",
        relevancia_score=70,
        updated_at=t_new,
        data_publicacao=t_new,
        expires_at=now + timedelta(hours=12),
    )

    client_root = TestClient(root_main.app)
    client_cur = TestClient(curadoria_main.app)

    # 1. /v1/noticias-quentes recency-first
    r_nq = client_root.get("/v1/noticias-quentes")
    assert r_nq.status_code == 200
    assert r_nq.json()["noticias_quentes"][0]["slug"] == "nq-new-mid"

    # 2. /v1/vitrine/em-alta recency-first & no long s-maxage=300
    r_vit = client_cur.get("/v1/vitrine/em-alta")
    assert r_vit.status_code == 200
    assert r_vit.json()["temas_ativos"][0]["slug"] == "cur-new-mid"
    assert "s-maxage=300" not in r_vit.headers.get("cache-control", "")

    # 3. /v2/sugestoes-contextuais bypasses _SUGESTOES_CACHE on BOTH ?_t= and ?refresh=1 + returns no-store
    r_sug_1 = client_root.get("/v2/sugestoes-contextuais?pais=BR")
    assert r_sug_1.status_code == 200
    assert r_sug_1.json()["cached"] is False

    # Add a brand new breaking keyword in DB while _SUGESTOES_CACHE is warm
    isolated_env.db.seed_noticia_quente(
        slug="nq-breaking-tag",
        titulo_curto="Breaking Tag",
        urgencia_score=95,
        relevancia_score=95,
        updated_at=now,
        data_publicacao=now,
        expires_at=now + timedelta(hours=6),
        palavras_chave=["selic", "selic"],
    )
    isolated_env.db.seed_noticia_quente(
        slug="nq-breaking-tag-2",
        titulo_curto="Breaking Tag 2",
        urgencia_score=95,
        relevancia_score=95,
        updated_at=now,
        data_publicacao=now,
        expires_at=now + timedelta(hours=6),
        palavras_chave=["selic"],
    )

    r_sug_t = client_root.get("/v2/sugestoes-contextuais?pais=BR&_t=1731934000000")
    assert r_sug_t.status_code == 200
    assert r_sug_t.json()["cached"] is False
    assert "no-store" in r_sug_t.headers.get("cache-control", "")
    assert any(s["termo_busca"].lower() == "selic" for s in r_sug_t.json()["sugestoes"])

    r_sug_ref = client_root.get("/v2/sugestoes-contextuais?pais=BR&refresh=1")
    assert r_sug_ref.status_code == 200
    assert r_sug_ref.json()["cached"] is False
    assert "no-store" in r_sug_ref.headers.get("cache-control", "")

    # 4. DB outage graceful fallback on both /v1/noticias-quentes and /v1/vitrine/em-alta
    isolated_env.vitrine_path.write_text(json.dumps({
        "updatedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "temas_ativos": [{"slug": "snap-tema-1", "titulo_tema": "Snap Tema", "categoria_primaria": "Economia", "relevancia_score": 88, "data_publicacao": now.strftime("%Y-%m-%dT%H:%M:%SZ")}],
        "noticias_quentes": [{"slug": "snap-nq-1", "titulo_curto": "Snap NQ", "categoria": "Economia_Comercio", "urgencia_score": 88, "data_publicacao": now.strftime("%Y-%m-%dT%H:%M:%SZ")}],
    }), encoding="utf-8")
    isolated_env.db.fail_connect = True
    r_nq_fb = client_root.get("/v1/noticias-quentes")
    assert r_nq_fb.status_code == 200
    assert len(r_nq_fb.json()["noticias_quentes"]) >= 1
    r_vit_fb = client_cur.get("/v1/vitrine/em-alta")
    assert r_vit_fb.status_code == 200
    assert len(r_vit_fb.json()["temas_ativos"]) >= 1
    assert "no-store" in r_vit_fb.headers.get("cache-control", "")

    # 5. Gemini 3.5 model defaults compliance
    assert pulso_nq.MODELO_PULSO == "gemini-3.5-flash"
    assert orq_editorial.MODELO_EDITORIAL == "gemini-3.5-flash"
    assert cur_analisador.MODELO_PADRAO.startswith("gemini-3.")
    # Check admin_sugerir_fonte default model list uses gemini-3.*
    isolated_env.db.fail_connect = False
    fake_ai = FakeGenaiClient(json.dumps({"sugestoes": [{"nome": "ONU", "url": "https://news.un.org/feed/subscribe/pt/news/all/rss.xml", "tipo_fonte": "rss_feed", "cadencia": "pulso_30m", "pais_iso": "UN", "justificativa": "Oficial"}]}))
    import google.genai as real_genai
    monkeypatch.setattr(real_genai, "Client", lambda **kw: fake_ai)
    monkeypatch.setenv("ADMIN_PASSWORD", "test-secret-token")
    r_sug_fonte = client_root.post(
        "/v2/admin/fontes/sugerir",
        json={"tema": "Comércio Global", "quantidade": 1},
        headers={"Authorization": "Bearer test-secret-token"},
    )
    assert r_sug_fonte.status_code == 200
    assert fake_ai.calls[0]["model"].startswith("gemini-3.")


# ============================================================================
# TIER 2 — BOUNDARY & CORNER CASES
# ============================================================================


def test_t2_01_undated_rss_items_never_stamped_now_and_sorted_last(isolated_env, monkeypatch):
    """EC-01: Undated RSS items get empty/null date, sort strictly after dated items, and are rejected by curadoria."""
    now = datetime.now(timezone.utc).replace(microsecond=0)
    t_3h = (now - timedelta(hours=3)).strftime("%a, %d %b %Y %H:%M:%S GMT")
    t_1h = (now - timedelta(hours=1)).strftime("%a, %d %b %Y %H:%M:%S GMT")

    # 1. src.collector
    undated_entry = SimpleNamespace(
        title="Sem Data", link="https://ex.com/u", id="id-u", summary="S" * 120,
        published_parsed=None, updated_parsed=None, published=None, updated=None, data_publicacao=None, pubDate=None,
    )
    assert legacy_collector.parse_entry_date(undated_entry) == ""

    xml_bytes = _rss2_xml([
        {"title": "Undated First In Feed", "link": "https://ex.com/u", "pubDate": None},
        {"title": "Dated 3h", "link": "https://ex.com/3h", "pubDate": t_3h},
        {"title": "Dated 1h", "link": "https://ex.com/1h", "pubDate": t_1h},
    ])
    isolated_env.sources_path.write_text(json.dumps([
        {"nome": "Fonte Undated", "tipo": "rss", "id_ou_url": "https://ex.com/rss", "categoria": "economia"}
    ]), encoding="utf-8")
    parsed = feedparser.parse(xml_bytes)
    monkeypatch.setattr(legacy_collector.feedparser, "parse", lambda _u: parsed)
    items = legacy_collector.collect_new_items()
    assert items[0]["data_publicacao"].startswith(now.strftime("%Y-"))
    assert "Dated 1h" in items[0]["texto_conteudo"]
    assert "Dated 3h" in items[1]["texto_conteudo"]
    assert items[-1]["data_publicacao"] == ""

    # 2. redacao_v2.coletor_estudo
    feed_url = "https://feed.example.com/undated.xml"
    _install_httpx_mock(monkeypatch, {feed_url: xml_bytes})
    async def _run():
        async with httpx.AsyncClient() as c:
            return await coletor_estudo.coletar_feed_individual_async(c, feed_url, max_itens=10)
    pulso_items = asyncio.run(_run())
    assert [it["titulo"] for it in pulso_items] == ["Dated 1h", "Dated 3h", "Undated First In Feed"]
    assert pulso_items[-1]["published_at"] is None

    # 3. curadoria.agente.coletor rejects undated entries from window
    assert cur_coletor.dentro_da_janela_tempo(undated_entry, horas_limite=12) is False


def test_t2_02_atom_entry_feeds_parsed_cleanly(isolated_env, monkeypatch):
    """EC-02: Atom <feed><entry> with <published>/<updated> parsed cleanly by all Python collectors."""
    now = datetime.now(timezone.utc).replace(microsecond=0)
    t_recent = (now - timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
    t_older = (now - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")

    atom_bytes = _atom_xml([
        {"title": "Atom Older", "link": "https://ex.com/a1", "published": t_older, "updated": t_older},
        {"title": "Atom Recent", "link": "https://ex.com/a2", "published": t_recent, "updated": t_recent},
    ])
    feed_url = "https://feed.example.com/atom.xml"

    # 1. coletor_estudo
    _install_httpx_mock(monkeypatch, {feed_url: atom_bytes})
    async def _run():
        async with httpx.AsyncClient() as c:
            return await coletor_estudo.coletar_feed_individual_async(c, feed_url, max_itens=10)
    pulso_res = asyncio.run(_run())
    assert [it["titulo"] for it in pulso_res] == ["Atom Recent", "Atom Older"]

    # 2. curadoria.agente.coletor
    monkeypatch.setattr(cur_coletor, "FEEDS_RSS_RODANDO_O_MUNDO", {"Geopolitica_Radar": [feed_url]})
    monkeypatch.setattr(cur_coletor.requests, "get", lambda *a, **kw: SimpleNamespace(content=atom_bytes))
    cur_res = cur_coletor.coletar_feeds_rss(horas_limite=12, por_feed=10)
    assert [it["titulo"] for it in cur_res] == ["Atom Recent", "Atom Older"]

    # 3. src.collector
    isolated_env.sources_path.write_text(json.dumps([
        {"nome": "Atom Src", "tipo": "rss", "id_ou_url": feed_url, "categoria": "cultura"}
    ]), encoding="utf-8")
    parsed_atom = feedparser.parse(atom_bytes)
    monkeypatch.setattr(legacy_collector.feedparser, "parse", lambda _u: parsed_atom)
    leg_res = legacy_collector.collect_new_items()
    assert len(leg_res) == 2
    assert "Atom Recent" in leg_res[0]["texto_conteudo"]


def test_t2_03_high_score_old_does_not_beat_newer_item(isolated_env):
    """EC-03: urgencia_score=99 (24h old) never beats urgencia_score=80 (10m old)."""
    now = isolated_env.db.now
    t_old = now - timedelta(hours=24)
    t_new = now - timedelta(minutes=10)

    # Vitrine snapshot
    pulso_nq.salvar_snapshot_vitrine_pulso(_make_pulso_payload("20261118-1200", [
        {"slug": "old-99", "titulo_curto": "Old 99", "resumo_pulso": "R", "urgencia_score": 99, "relevancia_score": 99, "data_publicacao": t_old.strftime("%Y-%m-%dT%H:%M:%SZ")},
        {"slug": "new-80", "titulo_curto": "New 80", "resumo_pulso": "R", "urgencia_score": 80, "relevancia_score": 80, "data_publicacao": t_new.strftime("%Y-%m-%dT%H:%M:%SZ")},
    ]))
    snap = json.loads(isolated_env.vitrine_path.read_text(encoding="utf-8"))
    assert snap["temas_ativos"][0]["slug"] == "new-80"
    assert snap["noticias_quentes"][0]["slug"] == "new-80"

    # FastAPI endpoints
    isolated_env.db.seed_noticia_quente(slug="old-99", titulo_curto="Old 99", urgencia_score=99, relevancia_score=99, updated_at=t_old, data_publicacao=t_old, expires_at=now + timedelta(hours=6))
    isolated_env.db.seed_noticia_quente(slug="new-80", titulo_curto="New 80", urgencia_score=80, relevancia_score=80, updated_at=t_new, data_publicacao=t_new, expires_at=now + timedelta(hours=6))
    isolated_env.db.seed_curadoria_insight(slug="cur-old-99", titulo_tema="Cur Old 99", relevancia_score=99, updated_at=t_old, data_publicacao=t_old, expires_at=now + timedelta(hours=24))
    isolated_env.db.seed_curadoria_insight(slug="cur-new-80", titulo_tema="Cur New 80", relevancia_score=80, updated_at=t_new, data_publicacao=t_new, expires_at=now + timedelta(hours=24))

    c_root = TestClient(root_main.app)
    c_cur = TestClient(curadoria_main.app)
    assert c_root.get("/v1/noticias-quentes").json()["noticias_quentes"][0]["slug"] == "new-80"
    assert c_cur.get("/v1/vitrine/em-alta").json()["temas_ativos"][0]["slug"] == "cur-new-80"


def test_t2_04_timezone_mktime_shift_safety_cross_platform(monkeypatch):
    """EC-04: Proves calendar.timegm is used instead of time.mktime even under simulated UTC-3 local TZ on Windows/Linux."""
    def poisoned_mktime(_struct: Any) -> float:
        raise AssertionError("time.mktime must NOT be called on UTC struct_time!")

    monkeypatch.setattr(time, "mktime", poisoned_mktime)

    pub_str = "Wed, 18 Nov 2026 12:00:00 GMT"
    entry = feedparser.parse(_rss2_xml([{"title": "TZ Test", "link": "https://ex.com/tz", "pubDate": pub_str}])).entries[0]

    iso_pulso = coletor_estudo.extrair_data_publicacao(entry)
    assert iso_pulso is not None and iso_pulso.startswith("2026-11-18T12:00:00")

    iso_legacy = legacy_collector.parse_entry_date(entry)
    assert iso_legacy.startswith("2026-11-18T12:00:00")

    dt_cur = cur_coletor.extrair_data_publicacao_entry(entry)
    assert dt_cur == datetime(2026, 11, 18, 12, 0, 0, tzinfo=timezone.utc)


def test_t2_05_expired_ttl_pruned_and_no_sliding_reset_on_stale_slug(isolated_env):
    """EC-06: Expired items are pruned; re-upserting a stale slug does NOT extend expires_at forward."""
    now = isolated_env.db.now
    t_old_pub = now - timedelta(hours=10)
    t_expired = now - timedelta(hours=4)

    # Seed DB with stale slug already published 10h ago with ttl=6h (expired 4h ago)
    isolated_env.db.seed_noticia_quente(
        slug="stale-slug",
        titulo_curto="Stale Slug",
        urgencia_score=90,
        relevancia_score=90,
        updated_at=t_old_pub,
        data_publicacao=t_old_pub,
        expires_at=t_expired,
        destaque_ate=t_expired,
    )

    payload = _make_pulso_payload("20261118-1200", [{
        "slug": "stale-slug",
        "titulo_curto": "Stale Slug",
        "resumo_pulso": "Mesma notícia.",
        "urgencia_score": 90,
        "relevancia_score": 90,
        "ttl_horas": 6,
        "horas_em_destaque": 6,
        "data_publicacao": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }])

    with psycopg.connect("postgresql://test") as conn:
        pulso_nq.executar_upsert_noticias_quentes(conn, payload, agora=now)

    row = isolated_env.db.noticias_quentes["stale-slug"]
    assert row["data_publicacao"] == t_old_pub
    assert row["expires_at"] <= now, "Stale slug had its expires_at reset into the future!"


def test_t2_06_cache_busting_t_refresh_force_and_empty_db_fallback(isolated_env):
    """EC-05 & EC-08: ?_t=, ?refresh=1, ?force=1 set Cache-Control: no-store; empty/down DB falls back cleanly."""
    now = isolated_env.db.now
    isolated_env.vitrine_path.write_text(json.dumps({
        "updatedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "temas_ativos": [{"slug": "fb-tema", "titulo_tema": "FB Tema", "categoria_primaria": "Economia", "relevancia_score": 80, "data_publicacao": now.strftime("%Y-%m-%dT%H:%M:%SZ")}],
        "noticias_quentes": [{"slug": "fb-nq", "titulo_curto": "FB NQ", "categoria": "Economia_Comercio", "urgencia_score": 80, "data_publicacao": now.strftime("%Y-%m-%dT%H:%M:%SZ")}],
    }), encoding="utf-8")

    isolated_env.db.fail_connect = True
    c_root = TestClient(root_main.app)
    c_cur = TestClient(curadoria_main.app)

    for qs in ("?_t=123456", "?refresh=1", "?force=1"):
        r1 = c_root.get(f"/v1/noticias-quentes{qs}")
        assert r1.status_code == 200
        assert "no-store" in r1.headers.get("cache-control", "")
        assert len(r1.json()["noticias_quentes"]) >= 1

        r2 = c_cur.get(f"/v1/vitrine/em-alta{qs}")
        assert r2.status_code == 200
        assert "no-store" in r2.headers.get("cache-control", "")
        assert len(r2.json()["temas_ativos"]) >= 1

        r3 = c_root.get(f"/v2/sugestoes-contextuais{qs}")
        assert r3.status_code == 200
        assert "no-store" in r3.headers.get("cache-control", "")

        r4 = c_root.get(f"/api/radar{qs}")
        assert r4.status_code == 200
        assert "no-store" in r4.headers.get("cache-control", "")


def test_t2_07_bounded_source_rotation_and_clock_skew_legacy_date(isolated_env):
    """EC-11 & EC-12: Bounded rotation keeps 48h-old distinct source below 30m items; clock skew & legacy date tolerated."""
    now = datetime.now(timezone.utc).replace(microsecond=0)
    cards = []
    for i in range(8):
        cards.append({
            "titulo": f"Fresh A {i}",
            "fonte_nome": "Veículo A",
            "fonte_url": f"https://a.com/{i}",
            "data_publicacao": (now - timedelta(minutes=i * 3)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        })
    cards.append({
        "titulo": "Stale Distinct B 48h",
        "fonte_nome": "Veículo B",
        "fonte_url": "https://b.com/old",
        "data_publicacao": (now - timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%SZ"),
    })

    rotated = legacy_publisher.sortir_cards_rodizio_amplo(cards)
    pos_stale_b = [c["titulo"] for c in rotated].index("Stale Distinct B 48h")
    assert pos_stale_b == len(rotated) - 1, f"48h-old card jumped ahead to index {pos_stale_b}!"

    # Clock skew (+2m) + legacy non-ISO date in /api/radar
    isolated_env.feed_path.write_text(json.dumps([
        {"titulo": "Future Skew", "fonte_nome": "A", "fonte_url": "https://a.com/f", "data_publicacao": (now + timedelta(minutes=2)).strftime("%Y-%m-%dT%H:%M:%SZ")},
        {"titulo": "Legacy Non-ISO", "fonte_nome": "B", "fonte_url": "https://b.com/l", "data_publicacao": "15/11/2026 10:00"},
    ]), encoding="utf-8")
    c_root = TestClient(root_main.app)
    r = c_root.get("/api/radar?_t=1&refresh=1")
    assert r.status_code == 200
    data = r.json()
    assert data["atualizado_em"] == "Atualizado agora"
    assert [it["titulo"] for it in data["items"]] == ["Future Skew", "Legacy Non-ISO"]


# ============================================================================
# TIER 3 — CROSS-FEATURE PAIRWISE INTEGRATION
# ============================================================================


def test_t3_01_pulso_curadoria_pulso_interleave(isolated_env, monkeypatch):
    """T3-01 (F12 + F13 + F15): Pulso P1 (T0) -> Curadoria C1 (T0+10m) -> Pulso P2 (T0+30m) coexist & order newest-first."""
    base = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(hours=1)
    t_p1 = base.strftime("%Y-%m-%dT%H:%M:%SZ")
    t_c1 = (base + timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
    t_p2 = (base + timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Step 1: Pulso P1
    pulso_nq.salvar_snapshot_vitrine_pulso(_make_pulso_payload("b1", [{
        "slug": "p1-slug", "titulo_curto": "Pulso P1", "resumo_pulso": "R1",
        "urgencia_score": 90, "relevancia_score": 90, "data_publicacao": t_p1,
    }]))

    # Step 2: Curadoria C1 (simulating clock at T0+10m)
    cur_payload = _make_curadoria_payload("b2", [{
        "slug": "c1-slug", "titulo_tema": "Curadoria C1", "relevancia_score": 85,
    }])
    monkeypatch.setattr(
        cur_pipeline,
        "_construir_snapshot_vitrine_mesclado",
        lambda prev, pl, agora=None, _orig=cur_pipeline._construir_snapshot_vitrine_mesclado: _orig(
            prev, pl, agora=base + timedelta(minutes=10)
        ),
    )
    cur_pipeline.salvar_snapshot_vitrine(cur_payload)

    # Step 3: Pulso P2 (with P1 re-seen at T0+30m)
    pulso_nq.salvar_snapshot_vitrine_pulso(_make_pulso_payload("b3", [
        {"slug": "p1-slug", "titulo_curto": "Pulso P1", "resumo_pulso": "R1", "urgencia_score": 90, "data_publicacao": t_p2},
        {"slug": "p2-slug", "titulo_curto": "Pulso P2", "resumo_pulso": "R2", "urgencia_score": 72, "data_publicacao": t_p2},
    ]))

    snap = json.loads(isolated_env.vitrine_path.read_text(encoding="utf-8"))
    db_snap = isolated_env.db.pipeline_state["vitrine_ia"]
    for source_snap in (snap, db_snap):
        slugs = [t["slug"] for t in source_snap["temas_ativos"]]
        assert slugs == ["p2-slug", "c1-slug", "p1-slug"], f"Expected P2->C1->P1, got {slugs}"
        p1_item = next(t for t in source_snap["temas_ativos"] if t["slug"] == "p1-slug")
        assert p1_item["data_publicacao"] == t_p1
        c1_item = next(t for t in source_snap["temas_ativos"] if t["slug"] == "c1-slug")
        assert c1_item["data_publicacao"] == t_c1


def test_t3_02_db_authoritative_over_stale_disk_json(isolated_env):
    """T3-02 (F14 + F15): Stale disk data/*.json (48h old) never overwrites or leaks into authoritative DB state."""
    now = isolated_env.db.now
    t_db = (now - timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
    t_disk = (now - timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%SZ")

    isolated_env.feed_path.write_text(json.dumps([{
        "titulo": "OLD-DISK-FEED", "resumo": "Old", "analise": "Old",
        "categoria": "geopolitica", "fonte_nome": "Old", "fonte_url": "https://old.com/1", "data_publicacao": t_disk,
    }]), encoding="utf-8")
    isolated_env.vitrine_path.write_text(json.dumps({
        "updatedAt": t_disk,
        "temas_ativos": [{"slug": "old-disk-tema", "titulo_tema": "OLD-DISK-TEMA", "data_publicacao": t_disk, "relevancia_score": 99}],
        "noticias_quentes": [{"slug": "old-disk-nq", "titulo_curto": "OLD-DISK-NQ", "data_publicacao": t_disk, "urgencia_score": 99}],
    }), encoding="utf-8")

    isolated_env.db.pipeline_state["feed_output"] = [{
        "titulo": "NEW-DB-FEED", "resumo": "New", "analise": "New",
        "categoria": "geopolitica", "fonte_nome": "Veículo DB", "fonte_url": "https://new.com/1", "data_publicacao": t_db,
    }]
    isolated_env.db.pipeline_state["vitrine_ia"] = {
        "updatedAt": t_db,
        "temas_ativos": [{"slug": "new-db-tema", "titulo_tema": "NEW-DB-TEMA", "data_publicacao": t_db, "relevancia_score": 80}],
        "noticias_quentes": [{"slug": "new-db-nq", "titulo_curto": "NEW-DB-NQ", "data_publicacao": t_db, "urgencia_score": 80}],
    }

    assert legacy_analyst.get_recent_titles(10) == ["NEW-DB-FEED"]
    legacy_publisher.publish_cards([{
        "titulo": "NEW-DB-FEED-2", "resumo": "New 2", "analise": "New 2",
        "categoria": "economia", "fonte_nome": "Veículo DB 2", "fonte_url": "https://new.com/2",
        "data_publicacao": (now - timedelta(minutes=2)).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }])
    db_titles = [c["titulo"] for c in isolated_env.db.pipeline_state["feed_output"]]
    assert "OLD-DISK-FEED" not in db_titles

    c_root = TestClient(root_main.app)
    radar_titles = [it["titulo"] for it in c_root.get("/api/radar?_t=1&refresh=1").json()["items"]]
    assert "OLD-DISK-FEED" not in radar_titles
    assert "OLD-DISK-TEMA" not in radar_titles
    assert "NEW-DB-FEED-2" in radar_titles


# ============================================================================
# TIER 4 — REAL-WORLD MULTI-CYCLE PRODUCTION SCENARIOS (4+ CYCLES EACH)
# ============================================================================


def test_t4_01_five_cycle_radar_and_pulso_production_lifecycle(isolated_env, monkeypatch):
    """T4-01 (5 cycles): Pulso + Legacy Radar collection, refresh, transient DB outage + recovery, zero reversion."""
    base = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(hours=2)
    c_root = TestClient(root_main.app)
    monkeypatch.setattr(pulso_nq, "_carregar_fontes_pulso_com_banco", lambda _db: [{"nome": "F", "url": "https://feed.example.com/t401.xml"}])

    def _run_pulso_cycle(cycle_dt: datetime, rss_items: List[Dict[str, str]], batch: str, nq_items: List[Dict[str, Any]]):
        isolated_env.db.now = cycle_dt
        _install_httpx_mock(monkeypatch, {"https://feed.example.com/t401.xml": _rss2_xml(rss_items)})
        fake_ai = FakeGenaiClient(_make_pulso_payload(batch, nq_items))
        return asyncio.run(pulso_nq.executar_pipeline_pulso_async(client=fake_ai))

    # Cycle 1 (T+0m): 3 old items (T-12h) + 2 initial items (T+0m)
    t_old12 = (base - timedelta(hours=12)).strftime("%Y-%m-%dT%H:%M:%SZ")
    t_c1 = base.strftime("%Y-%m-%dT%H:%M:%SZ")
    _run_pulso_cycle(
        base,
        [{"title": "Initial Feed", "link": "https://ex.com/c1", "pubDate": base.strftime("%a, %d %b %Y %H:%M:%S GMT")}],
        "b-c1",
        [
            {"slug": "old-12h", "titulo_curto": "Old 12h Item", "resumo_pulso": "R", "urgencia_score": 99, "relevancia_score": 99, "data_publicacao": t_old12},
            {"slug": "c1-item", "titulo_curto": "Cycle 1 Fresh", "resumo_pulso": "R", "urgencia_score": 82, "relevancia_score": 82, "data_publicacao": t_c1},
        ],
    )
    legacy_publisher.publish_cards([
        {"titulo": "Radar Old 12h", "resumo": "R", "analise": "A", "categoria": "geopolitica", "fonte_nome": "Agência 1", "fonte_url": "https://ex.com/rold", "data_publicacao": t_old12},
        {"titulo": "Radar C1 Fresh", "resumo": "R", "analise": "A", "categoria": "economia", "fonte_nome": "Agência 2", "fonte_url": "https://ex.com/rc1", "data_publicacao": t_c1},
    ])

    # Cycle 2 (T+30m): Breaking item (score 75 < 99) + re-seen C1 item
    c2_dt = base + timedelta(minutes=30)
    t_c2 = c2_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    _run_pulso_cycle(
        c2_dt,
        [{"title": "Breaking Feed", "link": "https://ex.com/c2", "pubDate": c2_dt.strftime("%a, %d %b %Y %H:%M:%S GMT")}],
        "b-c2",
        [
            {"slug": "c1-item", "titulo_curto": "Cycle 1 Fresh", "resumo_pulso": "R", "urgencia_score": 82, "relevancia_score": 82, "data_publicacao": t_c2},
            {"slug": "c2-breaking", "titulo_curto": "Cycle 2 Breaking", "resumo_pulso": "R", "urgencia_score": 75, "relevancia_score": 75, "data_publicacao": t_c2},
        ],
    )
    legacy_publisher.publish_cards([
        {"titulo": "Radar C2 Breaking", "resumo": "R", "analise": "A", "categoria": "geopolitica", "fonte_nome": "Agência 3", "fonte_url": "https://ex.com/rc2", "data_publicacao": t_c2},
    ])

    # Cycle 3 (T+45m): Manual refresh via FastAPI endpoints
    r_rad_3 = c_root.get("/api/radar?refresh=1&_t=3000")
    r_nq_3 = c_root.get("/v1/noticias-quentes?refresh=1&_t=3000")
    assert r_rad_3.status_code == 200 and "no-store" in r_rad_3.headers.get("cache-control", "")
    assert r_nq_3.status_code == 200
    assert r_nq_3.json()["noticias_quentes"][0]["slug"] == "c2-breaking"
    c1_row = next(n for n in r_nq_3.json()["noticias_quentes"] if n["slug"] == "c1-item")
    assert c1_row["updated_at"].startswith(t_c1[:16]) or isolated_env.db.noticias_quentes["c1-item"]["data_publicacao"] == base

    # Cycle 4 (T+60m): Transient DB outage fallback -> DB recovers with Cycle 4 breaking item
    isolated_env.db.fail_connect = True
    r_rad_fb = c_root.get("/api/radar?_t=4000")
    r_nq_fb = c_root.get("/v1/noticias-quentes?_t=4000")
    assert r_rad_fb.status_code == 200 and "no-store" in r_rad_fb.headers.get("cache-control", "")
    assert r_nq_fb.status_code == 200 and len(r_nq_fb.json()["noticias_quentes"]) >= 1

    isolated_env.db.fail_connect = False
    c4_dt = base + timedelta(minutes=60)
    t_c4 = c4_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    _run_pulso_cycle(
        c4_dt,
        [{"title": "Cycle 4 Feed", "link": "https://ex.com/c4", "pubDate": c4_dt.strftime("%a, %d %b %Y %H:%M:%S GMT")}],
        "b-c4",
        [{"slug": "c4-breaking", "titulo_curto": "Cycle 4 Breaking", "resumo_pulso": "R", "urgencia_score": 70, "relevancia_score": 70, "data_publicacao": t_c4}],
    )

    # Cycle 5 (T+65m): Repeated reloads confirm Cycle 4 Breaking remains #1 with zero reversion
    for tick in ("5001", "5002"):
        r_rad_5 = c_root.get(f"/api/radar?_t={tick}")
        r_nq_5 = c_root.get(f"/v1/noticias-quentes?_t={tick}")
        assert r_rad_5.json()["items"][0]["slug"] == "c4-breaking"
        assert r_nq_5.json()["noticias_quentes"][0]["slug"] == "c4-breaking"


def test_t4_02_four_cycle_pulso_curadoria_interleave_with_expiry_and_outage(isolated_env, monkeypatch):
    """T4-02 (4 cycles): Pulso P1 -> Curadoria C1 -> Pulso P2 + expiry prune -> DB outage + recovery P3."""
    base = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(hours=2)
    c_root = TestClient(root_main.app)
    c_cur = TestClient(curadoria_main.app)
    real_pulso_mesclar = pulso_nq._mesclar_snapshot_vitrine_pulso
    real_cur_mesclar = cur_pipeline._construir_snapshot_vitrine_mesclado

    # Cycle 1 (T+0m): Pulso writes P1 + exp-soon (expires at T+20m)
    t_p1 = base.strftime("%Y-%m-%dT%H:%M:%SZ")
    monkeypatch.setattr(
        pulso_nq,
        "_mesclar_snapshot_vitrine_pulso",
        lambda prev, pl, agora_dt=None: real_pulso_mesclar(prev, pl, agora_dt=base),
    )
    pulso_nq.salvar_snapshot_vitrine_pulso({
        "batch_id": "b1",
        "noticias_quentes": [
            {"slug": "p1", "titulo_curto": "Pulso P1", "resumo_pulso": "R1", "urgencia_score": 85, "relevancia_score": 85, "data_publicacao": t_p1},
            {"slug": "exp-soon", "titulo_curto": "Expired Soon", "resumo_pulso": "Rx", "urgencia_score": 99, "relevancia_score": 99, "data_publicacao": (base - timedelta(hours=8)).strftime("%Y-%m-%dT%H:%M:%SZ"), "expires_at": (base + timedelta(minutes=20)).strftime("%Y-%m-%dT%H:%M:%SZ")},
        ],
    })
    isolated_env.db.seed_noticia_quente(slug="p1", titulo_curto="Pulso P1", urgencia_score=85, relevancia_score=85, updated_at=base, data_publicacao=base, expires_at=base + timedelta(hours=6))

    # Cycle 2 (T+10m): Curadoria runs with C1 while stale disk JSON tries to pollute
    c2_dt = base + timedelta(minutes=10)
    t_c1 = c2_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    monkeypatch.setattr(
        cur_pipeline,
        "_construir_snapshot_vitrine_mesclado",
        lambda prev, pl, agora=None: real_cur_mesclar(prev, pl, agora=c2_dt),
    )
    c1_pl = _make_curadoria_payload("b2", [{"slug": "c1", "titulo_tema": "Curadoria C1", "relevancia_score": 82}])
    cur_pipeline.salvar_snapshot_vitrine(c1_pl)
    isolated_env.db.seed_curadoria_insight(slug="c1", titulo_tema="Curadoria C1", relevancia_score=82, updated_at=c2_dt, data_publicacao=c2_dt, expires_at=c2_dt + timedelta(hours=24))

    # Cycle 3 (T+30m): Pulso writes P2 and re-sees P1; exp-soon is now expired and must be pruned
    c3_dt = base + timedelta(minutes=30)
    t_p2 = c3_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    monkeypatch.setattr(
        pulso_nq,
        "_mesclar_snapshot_vitrine_pulso",
        lambda prev, pl, agora_dt=None: real_pulso_mesclar(prev, pl, agora_dt=c3_dt),
    )
    pulso_nq.salvar_snapshot_vitrine_pulso(_make_pulso_payload("b3", [
        {"slug": "p1", "titulo_curto": "Pulso P1", "resumo_pulso": "R1", "urgencia_score": 85, "data_publicacao": t_p2},
        {"slug": "p2", "titulo_curto": "Pulso P2", "resumo_pulso": "R2", "urgencia_score": 78, "data_publicacao": t_p2},
    ]))
    snap3 = json.loads(isolated_env.vitrine_path.read_text(encoding="utf-8"))
    assert [t["slug"] for t in snap3["temas_ativos"]] == ["p2", "c1", "p1"]
    assert next(t for t in snap3["temas_ativos"] if t["slug"] == "p1")["data_publicacao"] == t_p1

    # Cycle 4 (T+60m): DB outage -> fallback serves snapshot with no-store -> recovers with P3
    isolated_env.db.fail_connect = True
    r_fb = c_cur.get("/v1/vitrine/em-alta?refresh=1&_t=4")
    assert r_fb.status_code == 200 and "no-store" in r_fb.headers.get("cache-control", "")
    assert len(r_fb.json()["temas_ativos"]) >= 3

    isolated_env.db.fail_connect = False
    c4_dt = base + timedelta(minutes=60)
    t_p3 = c4_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    monkeypatch.setattr(
        pulso_nq,
        "_mesclar_snapshot_vitrine_pulso",
        lambda prev, pl, agora_dt=None: real_pulso_mesclar(prev, pl, agora_dt=c4_dt),
    )
    pulso_nq.salvar_snapshot_vitrine_pulso(_make_pulso_payload("b4", [
        {"slug": "p3", "titulo_curto": "Pulso P3", "resumo_pulso": "R3", "urgencia_score": 74, "data_publicacao": t_p3},
    ]))
    snap4 = json.loads(isolated_env.vitrine_path.read_text(encoding="utf-8"))
    assert [t["slug"] for t in snap4["temas_ativos"]] == ["p3", "p2", "c1", "p1"]
    assert c_root.get("/api/radar?_t=4").json()["items"][0]["slug"] == "p3"


def test_t4_04_four_cycle_stale_disk_vs_db_and_workflow(isolated_env):
    """T4-04 (4 cycles): Authoritative DB prevails across publisher, analyst, curadoria, DB outage, and recovery."""
    now = isolated_env.db.now
    t_disk = (now - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%SZ")
    t_c1 = (now - timedelta(minutes=45)).strftime("%Y-%m-%dT%H:%M:%SZ")
    t_c2 = (now - timedelta(minutes=15)).strftime("%Y-%m-%dT%H:%M:%SZ")
    t_c4 = (now - timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Cycle 1: Stale disk vs fresh DB
    isolated_env.feed_path.write_text(json.dumps([{"titulo": "STALE-DISK-3D", "fonte_url": "https://stale/1", "data_publicacao": t_disk}]), encoding="utf-8")
    isolated_env.db.pipeline_state["feed_output"] = [{"titulo": "DB-C1", "resumo": "R", "analise": "A", "categoria": "economia", "fonte_nome": "F1", "fonte_url": "https://db/1", "data_publicacao": t_c1}]
    assert legacy_analyst.get_recent_titles(10) == ["DB-C1"]

    # Cycle 2: Publisher adds T+30m while stale disk untouched beforehand
    legacy_publisher.publish_cards([{"titulo": "DB-C2", "resumo": "R2", "analise": "A2", "categoria": "politica", "fonte_nome": "F2", "fonte_url": "https://db/2", "data_publicacao": t_c2}])
    assert [c["titulo"] for c in isolated_env.db.pipeline_state["feed_output"]] == ["DB-C2", "DB-C1"]

    # Cycle 3: Curadoria preserves DB pulso themes
    isolated_env.db.pipeline_state["vitrine_ia"] = {
        "updatedAt": t_c2,
        "temas_ativos": [{"slug": "pulso-keep", "titulo_tema": "Pulso Keep", "origem_pipeline": "pulso", "data_publicacao": t_c2}],
    }
    cur_pipeline.salvar_snapshot_vitrine(_make_curadoria_payload("b3", [{"slug": "cur-c3", "titulo_tema": "Cur C3"}]))
    assert any(t["slug"] == "pulso-keep" for t in isolated_env.db.pipeline_state["vitrine_ia"]["temas_ativos"])

    # Cycle 4: DB outage fallback -> recovery with newer card
    c_root = TestClient(root_main.app)
    isolated_env.db.fail_connect = True
    assert c_root.get("/api/radar?_t=1").status_code == 200
    isolated_env.db.fail_connect = False
    legacy_publisher.publish_cards([{"titulo": "DB-C4", "resumo": "R4", "analise": "A4", "categoria": "geopolitica", "fonte_nome": "F3", "fonte_url": "https://db/4", "data_publicacao": t_c4}])
    radar_titles = [it["titulo"] for it in c_root.get("/api/radar?refresh=1&_t=2").json()["items"]]
    assert "STALE-DISK-3D" not in radar_titles
    assert "DB-C4" in radar_titles[:3]


def test_t4_06_four_cycle_timezone_shift_and_clock_skew_resilience(isolated_env, monkeypatch):
    """T4-06 (4 cycles): Simulated UTC-3 local TZ (poisoned time.mktime) + clock skew + undated across all collectors & API."""
    # Simulate time.mktime introducing a +10800s (+3h) shift if any code mistakenly calls mktime on UTC struct_time!
    real_mktime = time.mktime
    monkeypatch.setattr(time, "mktime", lambda st: real_mktime(st) + 10800.0)

    now = datetime.now(timezone.utc).replace(microsecond=0)
    t_c1 = (now - timedelta(hours=1)).strftime("%a, %d %b %Y %H:%M:%S GMT")
    t_c2 = (now - timedelta(minutes=20)).strftime("%a, %d %b %Y %H:%M:%S GMT")
    t_skew = (now + timedelta(minutes=2)).strftime("%a, %d %b %Y %H:%M:%S GMT")

    feed_url = "https://feed.example.com/tz4.xml"
    # Cycle 1: Collect T-1h + undated under poisoned mktime
    xml_1 = _rss2_xml([
        {"title": "TZ Cycle 1 Item", "link": "https://ex.com/tz1", "pubDate": t_c1},
        {"title": "TZ Undated Item", "link": "https://ex.com/tzu", "pubDate": None},
    ])
    _install_httpx_mock(monkeypatch, {feed_url: xml_1})
    async def _collect():
        async with httpx.AsyncClient() as c:
            return await coletor_estudo.coletar_feed_individual_async(c, feed_url, max_itens=10)
    c1_items = asyncio.run(_collect())
    assert c1_items[0]["published_at"].startswith((now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M"))
    assert c1_items[1]["published_at"] is None

    # Cycle 2: Collect T-20m + +2m clock skew under poisoned mktime across curadoria & legacy collector
    xml_2 = _rss2_xml([
        {"title": "TZ Cycle 2 Item", "link": "https://ex.com/tz2", "pubDate": t_c2},
        {"title": "TZ Skew +2m Item", "link": "https://ex.com/tzs", "pubDate": t_skew},
    ])
    monkeypatch.setattr(cur_coletor, "FEEDS_RSS_RODANDO_O_MUNDO", {"Geopolitica_Radar": [feed_url]})
    monkeypatch.setattr(cur_coletor.requests, "get", lambda *a, **kw: SimpleNamespace(content=xml_2))
    cur_items = cur_coletor.coletar_feeds_rss(horas_limite=12, por_feed=10)
    assert cur_items[0]["titulo"] == "TZ Skew +2m Item"
    assert cur_items[1]["titulo"] == "TZ Cycle 2 Item"

    # Cycle 3: Publish to pulso snapshot & legacy feed
    pulso_nq.salvar_snapshot_vitrine_pulso(_make_pulso_payload("btz", [
        {"slug": "tz-c1", "titulo_curto": "TZ Cycle 1", "resumo_pulso": "R", "urgencia_score": 95, "data_publicacao": c1_items[0]["published_at"]},
        {"slug": "tz-c2", "titulo_curto": "TZ Cycle 2", "resumo_pulso": "R", "urgencia_score": 80, "data_publicacao": cur_items[1]["data_publicacao"]},
        {"slug": "tz-skew", "titulo_curto": "TZ Skew +2m", "resumo_pulso": "R", "urgencia_score": 75, "data_publicacao": cur_items[0]["data_publicacao"]},
    ]))

    # Cycle 4: FastAPI /api/radar reload renders TZ Skew -> TZ C2 -> TZ C1 in exact chronological order
    c_root = TestClient(root_main.app)
    r = c_root.get("/api/radar?refresh=1&_t=999")
    assert r.status_code == 200
    assert [it["slug"] for it in r.json()["items"]] == ["tz-skew", "tz-c2", "tz-c1"]
