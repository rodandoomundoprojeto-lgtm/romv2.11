"""Estado de execução compartilhado do pipeline em PostgreSQL (JSONB).

Os arquivos em ``data/`` deixam de ser a única fonte de verdade: ``vitrine_ia``,
``feed_output`` e ``history`` passam a viver também na tabela
``ai_pipeline_state``. O arquivo continua sendo gravado como espelho/fallback
durante a migração (Nível 2B), então qualquer falha de banco degrada para o
comportamento antigo em vez de quebrar o pipeline.

Uso típico::

    from src.estado_db import ler_estado, gravar_estado

    snapshot = ler_estado("vitrine_ia")       # None quando o banco não está disponível
    gravar_estado("feed_output", cards)       # False quando o banco não está disponível

Contrato de retorno:
  - ``ler_estado`` devolve ``None`` quando não há banco, tabela ou linha.
  - ``gravar_estado`` devolve ``False`` quando não foi possível persistir.
  - ``atualizar_estado`` faz read-modify-write com ``SELECT ... FOR UPDATE``
    (união atômica de IDs do histórico) e devolve ``None`` em caso de falha.
"""
from __future__ import annotations

import os
from typing import Any, Callable, Optional

try:
    import psycopg
    from psycopg.types.json import Jsonb
except Exception:  # pragma: no cover - ambiente sem psycopg (fallback para arquivo)
    psycopg = None  # type: ignore[assignment]
    Jsonb = None  # type: ignore[assignment]

TABELA_ESTADO = "ai_pipeline_state"
CHAVES_ESTADO = ("vitrine_ia", "feed_output", "history")

_PLACEHOLDERS = ("[YOUR-PASSWORD]", "[POOLER-HOST]")

_DDL_ESTADO = f"""
CREATE TABLE IF NOT EXISTS {TABELA_ESTADO} (
    chave TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

_QUERY_UPSERT = f"""
    INSERT INTO {TABELA_ESTADO} (chave, payload, updated_at)
    VALUES (%s, %s, NOW())
    ON CONFLICT (chave) DO UPDATE
        SET payload = EXCLUDED.payload,
            updated_at = NOW()
"""

_tabela_garantida = False


def obter_database_url() -> str:
    """Resolve a URL do Postgres, ignorando placeholders de configuração."""
    url = (os.getenv("CURADORIA_DATABASE_URL") or os.getenv("DATABASE_URL") or "").strip()
    if not url or any(marcador in url for marcador in _PLACEHOLDERS):
        return ""
    return url


def banco_disponivel() -> bool:
    """True quando há driver e URL de banco configurados."""
    return psycopg is not None and bool(obter_database_url())


def _conectar(db_url: Optional[str] = None):
    if psycopg is None:
        return None
    url = (db_url or obter_database_url()).strip()
    if not url:
        return None
    return psycopg.connect(url, connect_timeout=5, prepare_threshold=None)


def garantir_tabela(conn, commit: bool = False) -> None:
    """Cria a tabela de estado de forma idempotente (uma vez por processo)."""
    global _tabela_garantida
    if _tabela_garantida:
        return
    with conn.cursor() as cur:
        cur.execute(_DDL_ESTADO)
    if commit:
        conn.commit()
    _tabela_garantida = True


def ler_estado(
    chave: str,
    conn: Optional[Any] = None,
    db_url: Optional[str] = None,
) -> Optional[Any]:
    """Lê o payload JSONB da chave informada.

    Aceita uma conexão já aberta (ex.: dependência FastAPI) ou abre a própria
    conexão. Nunca levanta exceção: qualquer falha vira ``None`` para o
    chamador usar o arquivo local.
    """
    if not chave:
        return None

    conexao = conn
    propria = conexao is None
    try:
        if propria:
            conexao = _conectar(db_url)
            if conexao is None:
                return None
        garantir_tabela(conexao, commit=propria)
        with conexao.cursor() as cur:
            cur.execute(f"SELECT payload FROM {TABELA_ESTADO} WHERE chave = %s", (chave,))
            linha = cur.fetchone()
        if not linha:
            return None
        payload = linha.get("payload") if isinstance(linha, dict) else linha[0]
        return payload if isinstance(payload, (dict, list)) else None
    except Exception:
        if propria and conexao is not None:
            try:
                conexao.rollback()
            except Exception:
                pass
        return None
    finally:
        if propria and conexao is not None:
            try:
                conexao.close()
            except Exception:
                pass


def gravar_estado(
    chave: str,
    payload: Any,
    conn: Optional[Any] = None,
    db_url: Optional[str] = None,
) -> bool:
    """Grava (upsert) o payload JSONB da chave. Retorna ``False`` em falha."""
    if not chave or not isinstance(payload, (dict, list)):
        return False

    conexao = conn
    propria = conexao is None
    try:
        if propria:
            conexao = _conectar(db_url)
            if conexao is None:
                return False
        garantir_tabela(conexao, commit=False)
        with conexao.cursor() as cur:
            cur.execute(_QUERY_UPSERT, (chave, Jsonb(payload)))
        conexao.commit()
        return True
    except Exception:
        try:
            conexao.rollback()
        except Exception:
            pass
        return False
    finally:
        if propria and conexao is not None:
            try:
                conexao.close()
            except Exception:
                pass


def atualizar_estado(
    chave: str,
    transformacao: Callable[[Any], Any],
    default: Any = None,
    db_url: Optional[str] = None,
) -> Optional[Any]:
    """Read-modify-write atômico de uma chave de estado.

    Usa ``SELECT ... FOR UPDATE`` para serializar concorrência (ex.: união de
    ``processed_ids``). Se o banco não estiver disponível ou ocorrer erro,
    devolve ``None`` para o chamador seguir com o arquivo local.
    """
    if not chave or not callable(transformacao):
        return None

    conexao = _conectar(db_url)
    if conexao is None:
        return None
    try:
        with conexao:
            garantir_tabela(conexao, commit=False)
            with conexao.cursor() as cur:
                cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s));", (chave,))
                cur.execute(
                    f"SELECT payload FROM {TABELA_ESTADO} WHERE chave = %s FOR UPDATE",
                    (chave,),
                )
                linha = cur.fetchone()
                if isinstance(linha, dict):
                    atual = linha.get("payload")
                else:
                    atual = linha[0] if linha else None
                atual = atual if isinstance(atual, (dict, list)) else default
                novo = transformacao(atual)
                if novo is None:
                    novo = default
                cur.execute(_QUERY_UPSERT, (chave, Jsonb(novo)))
            return novo
    except Exception:
        try:
            conexao.rollback()
        except Exception:
            pass
        return None
    finally:
        try:
            conexao.close()
        except Exception:
            pass
