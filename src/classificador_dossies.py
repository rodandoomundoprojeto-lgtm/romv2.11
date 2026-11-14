"""Classificador de matérias em dossiês (Fase 3).

- Considera APENAS dossiês `ao_vivo` no instante da ingestão (função SQL `dossies_elegiveis_ingestao`;
  permanentes são sempre ao vivo; especiais só dentro da janela data_inicio..data_fim).
- Associação idempotente: INSERT ... ON CONFLICT (dossie_id, materia_url) DO NOTHING.
- `veiculos_unicos_count` é recalculado atomicamente pelo trigger `trg_dossie_materias_veiculos`
  (migração 004) na mesma transação do INSERT, com advisory lock por dossiê.
"""
from __future__ import annotations

import logging
import unicodedata
from typing import Any, Dict, List, Optional

logger = logging.getLogger("rom.classificador_dossies")

SQL_ELEGIVEIS = "SELECT id, slug, tipo, regras_classificacao FROM dossies_elegiveis_ingestao(NOW());"

SQL_ASSOCIAR = """
INSERT INTO dossie_materias (dossie_id, materia_titulo, materia_url, veiculo_nome, pais_veiculo, vies, publicado_em)
VALUES (%(dossie_id)s, %(titulo)s, %(url)s, %(veiculo)s, %(pais)s, %(vies)s, COALESCE(%(publicado_em)s, NOW()))
ON CONFLICT (dossie_id, materia_url) DO NOTHING
RETURNING id;
"""


def _norm(txt: str) -> str:
    base = unicodedata.normalize("NFKD", txt or "").encode("ascii", "ignore").decode().lower()
    return base


def carregar_dossies_elegiveis(conn: Any) -> List[Dict[str, Any]]:
    """Dossiês estritamente ao_vivo agora (ignora em_breve e arquivo)."""
    try:
        with conn.cursor() as cur:
            cur.execute(SQL_ELEGIVEIS)
            cols = [c.name for c in cur.description]
            rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    except Exception:
        logger.exception("Falha ao consultar dossiês elegíveis (ao_vivo); migração 004 aplicada?")
        raise
    logger.info("Dossiês elegíveis (ao_vivo): %d", len(rows))
    return rows


def _pontuar(materia: Dict[str, Any], regras: Dict[str, Any]) -> int:
    texto = _norm(f"{materia.get('titulo', '')} {materia.get('resumo', '')}")
    kws = [_norm(k) for k in (regras or {}).get("palavras_chave", []) if k]
    paises = [str(p).upper() for p in (regras or {}).get("paises", [])]
    score = sum(1 for k in kws if k and k in texto)
    if paises and str(materia.get("pais_iso", "")).upper() in paises:
        score += 1
    return score


def classificar_materia(conn: Any, materia: Dict[str, Any], dossies: Optional[List[Dict[str, Any]]] = None,
                        min_score: int = 1) -> Dict[str, int]:
    """Associa a matéria aos dossiês ao_vivo compatíveis. Uma transação por matéria (atômica).

    `materia`: titulo, url, veiculo, pais_iso, vies?, resumo?, publicado_em?
    Retorna {"avaliados", "associados", "duplicados"}.
    """
    url = (materia.get("url") or "").strip()
    veiculo = (materia.get("veiculo") or "").strip()
    if not url or not veiculo:
        logger.warning("Matéria ignorada (url/veiculo ausente): %r", materia.get("titulo"))
        return {"avaliados": 0, "associados": 0, "duplicados": 0}

    dossies = dossies if dossies is not None else carregar_dossies_elegiveis(conn)
    res = {"avaliados": len(dossies), "associados": 0, "duplicados": 0}
    try:
        with conn.transaction(), conn.cursor() as cur:
            for d in dossies:
                if _pontuar(materia, d["regras_classificacao"]) < min_score:
                    continue
                cur.execute(SQL_ASSOCIAR, {
                    "dossie_id": d["id"], "titulo": materia.get("titulo", "")[:1000], "url": url,
                    "veiculo": veiculo[:150], "pais": (materia.get("pais_iso") or None) and str(materia["pais_iso"])[:2].upper(),
                    "vies": materia.get("vies"), "publicado_em": materia.get("publicado_em"),
                })
                if cur.fetchone():
                    res["associados"] += 1
                    logger.info("Associada a '%s': %s", d["slug"], url)
                else:
                    res["duplicados"] += 1
                    logger.debug("Duplicata ignorada em '%s': %s", d["slug"], url)
    except Exception:
        logger.exception("Falha ao associar matéria %s (rollback; contagens preservadas)", url)
        raise
    return res
