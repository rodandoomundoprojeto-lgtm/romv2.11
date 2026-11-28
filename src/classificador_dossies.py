"""Classificador de matérias em dossiês (Fase 3).

- Considera APENAS dossiês `ao_vivo` no instante da ingestão (função SQL `dossies_elegiveis_ingestao`;
  permanentes são sempre ao vivo; especiais só dentro da janela data_inicio..data_fim).
- Associação idempotente: INSERT ... ON CONFLICT (dossie_id, materia_url) DO NOTHING.
- `veiculos_unicos_count` é recalculado atomicamente pelo trigger `trg_dossie_materias_veiculos`
  (migração 004) na mesma transação do INSERT, com advisory lock por dossiê.
"""
from __future__ import annotations

import logging
import re
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
    return re.sub(r"\s+", " ", base).strip()


def _contem_termo(texto_norm: str, kw_norm: str) -> bool:
    """Verifica ocorrência de termo/frase normalizada evitando falsos positivos em substrings curtas."""
    if not texto_norm or not kw_norm:
        return False
    if len(kw_norm) <= 4 or " " in kw_norm:
        return re.search(rf"(?<!\w){re.escape(kw_norm)}(?!\w)", texto_norm) is not None
    return kw_norm in texto_norm


def carregar_dossies_elegiveis(conn: Any) -> List[Dict[str, Any]]:
    """Dossiês estritamente ao_vivo agora (ignora em_breve e arquivo)."""
    try:
        with conn.cursor() as cur:
            cur.execute(SQL_ELEGIVEIS)
            cols = [c.name for c in cur.description]
            raw_rows = cur.fetchall()
            rows = [dict(r) if isinstance(r, dict) else dict(zip(cols, r)) for r in raw_rows]
    except Exception:
        logger.exception("Falha ao consultar dossiês elegíveis (ao_vivo); migração 004 aplicada?")
        raise
    logger.info("Dossiês elegíveis (ao_vivo): %d", len(rows))
    return rows


def _pontuar(materia: Dict[str, Any], regras: Dict[str, Any]) -> int:
    """Pontuação ponderada de relevância (Regra 7 / Dossiê 3.0):
    - Frase exata de palavra-chave composta no título: +3
    - Palavra-chave no título: +2
    - Palavra-chave apenas no resumo: +1
    - Fronteira de palavra para termos curtos (<= 4 chars) evita falsos positivos (ex: 'ia' em 'polícia')
    - Bônus de país (+1) aplicado SOMENTE quando kw_score >= 2 (nunca classifica apenas pelo país).
    """
    titulo_norm = _norm(str(materia.get("titulo") or ""))
    resumo_norm = _norm(str(materia.get("resumo") or ""))
    kws = [_norm(str(k)) for k in (regras or {}).get("palavras_chave", []) if str(k or "").strip()]
    paises = [str(p).strip().upper() for p in (regras or {}).get("paises", []) if str(p or "").strip()]

    kw_score = 0
    for k in kws:
        if not k:
            continue
        if _contem_termo(titulo_norm, k):
            kw_score += 3 if " " in k else 2
        elif _contem_termo(resumo_norm, k):
            kw_score += 1

    score = kw_score
    if kw_score >= 2 and paises and str(materia.get("pais_iso") or "").strip().upper() in paises:
        score += 1
    return score


def classificar_materia(conn: Any, materia: Dict[str, Any], dossies: Optional[List[Dict[str, Any]]] = None,
                        min_score: int = 2) -> Dict[str, int]:
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


def classificar_lote_materias(
    conn: Any,
    materias: List[Dict[str, Any]],
    min_score: int = 2,
) -> Dict[str, int]:
    """Classifica um lote de matérias contra todos os dossiês ao_vivo."""
    if not materias:
        return {"materias": 0, "associados": 0, "duplicados": 0, "erros": 0}
    dossies = carregar_dossies_elegiveis(conn)
    totais = {"materias": len(materias), "associados": 0, "duplicados": 0, "erros": 0}
    if not dossies:
        return totais
    for mat in materias:
        try:
            r = classificar_materia(conn, mat, dossies=dossies, min_score=min_score)
            totais["associados"] += r.get("associados", 0)
            totais["duplicados"] += r.get("duplicados", 0)
        except Exception:  # noqa: BLE001
            totais["erros"] += 1
    return totais

