"""Testes unitários da camada Backend do Dossiê 3.0 (Hub Vivo de Inteligência Jornalística)."""
from __future__ import annotations

import inspect
import sys
from pathlib import Path
from typing import Any, Dict, List

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import pytest

from api.routes_dossies import (
    DossieCreatePayload,
    DossierAuditReportModel,
    DossierCoverageAngleModel,
    DossierEditorialBriefingModel,
    DossierTimelineItemModel,
    DossieUpdatePayload,
    auditar_conteudo_dossie,
    calcular_coverage_stats,
    validar_urls_internas_dossie,
)
from src.classificador_dossies import _pontuar, classificar_materia
from src.dossies_pulso import (
    DOSSIES_PULSO_ADVISORY_LOCK_KEY,
    DossierPulseOutputModel,
    executar_pulso_dossies_lote,
)


# ---------------------------------------------------------------------------
# 1. Classificador Ponderado (Regra 7 + Anti-Falso-Positivo)
# ---------------------------------------------------------------------------

def test_classificador_min_score_default_is_2():
    sig = inspect.signature(classificar_materia)
    assert sig.parameters["min_score"].default == 2


def test_classificador_pontuacao_ponderada_titulo_frase_resumo():
    regras = {
        "palavras_chave": ["guerra comercial", "tarifas", "mercosul"],
        "paises": ["BR", "US"],
    }
    # Frase composta exata no título (+3) + país (+1 porque kw_score >= 2) = 4
    m_frase = {"titulo": "Nova Guerra Comercial pressiona mercados globais", "resumo": "", "pais_iso": "US"}
    assert _pontuar(m_frase, regras) == 4

    # Palavra-chave simples no título (+2) sem país da lista = 2
    m_titulo = {"titulo": "Tarifas de importação sobem na Europa", "resumo": "", "pais_iso": "FR"}
    assert _pontuar(m_titulo, regras) == 2

    # Palavra-chave apenas no resumo (+1) -> país NÃO soma porque kw_score < 2
    m_resumo = {"titulo": "Agenda econômica da semana", "resumo": "Debate sobre o Mercosul avança.", "pais_iso": "BR"}
    assert _pontuar(m_resumo, regras) == 1


def test_classificador_nao_classifica_apenas_por_pais():
    regras = {"palavras_chave": ["eleicoes", "congresso"], "paises": ["BR"]}
    materia = {
        "titulo": "Previsão do tempo indica chuvas fortes no Sudeste",
        "resumo": "Instituto meteorológico emite alerta para o fim de semana.",
        "pais_iso": "BR",
    }
    assert _pontuar(materia, regras) == 0


def test_classificador_evita_falso_positivo_substring_curta():
    regras_ia = {"palavras_chave": ["ia", "onu"], "paises": ["BR"]}

    # 'ia' não deve casar dentro de 'polícia' nem 'onu' dentro de 'bônus'
    falso_positivo = {
        "titulo": "Polícia investiga fraude no pagamento de bônus anual",
        "resumo": "Operação ocorreu em cinco estados brasileiros.",
        "pais_iso": "BR",
    }
    assert _pontuar(falso_positivo, regras_ia) == 0

    # 'ia' como palavra inteira no título deve casar (+2) + país (+1) = 3
    verdadeiro = {
        "titulo": "Regulação de IA avança no Senado brasileiro",
        "resumo": "Projeto define regras para modelos generativos.",
        "pais_iso": "BR",
    }
    assert _pontuar(verdadeiro, regras_ia) == 3


# ---------------------------------------------------------------------------
# 2. Schemas Pydantic v2 (Dossiê 3.0)
# ---------------------------------------------------------------------------

def test_schemas_pydantic_dossie_3_0():
    briefing = DossierEditorialBriefingModel(
        latest_shift={
            "summary": "Governo anunciou nova rodada de negociações bilaterais.",
            "updated_at": "2026-11-28",
            "highlight_tag": "Última atualização",
        },
        key_players=[
            {
                "name": "Banco Central",
                "role": "Autoridade monetária",
                "country_iso": "BR",
                "stance_summary": "Mantém postura cautelosa diante da inflação global.",
            }
        ],
        key_numbers=[
            {
                "value": "US$ 12 bi",
                "label": "Volume comercial anual",
                "source": "FMI",
                "context": "Representa aumento de 8% frente ao ano anterior.",
            }
        ],
        practical_impacts=[
            {
                "audience": "empresas_comercio",
                "title": "Custos de importação",
                "summary": "Exportadores podem enfrentar ajustes tarifários no próximo trimestre.",
            }
        ],
        open_questions=[
            {
                "question": "Quando a medida entra em vigor?",
                "answer": "A implementação depende de ratificação parlamentar prevista para 2027.",
            }
        ],
    )
    assert briefing.latest_shift is not None
    assert briefing.key_players[0].country_iso == "BR"

    angle = DossierCoverageAngleModel(
        label="Imprensa local vs. internacional",
        region_or_scope="BR / Europa",
        summary="Veículos locais destacam impacto fiscal; internacionais focam em cadeias globais.",
        sample_outlets=["Folha", "Reuters"],
    )
    assert len(angle.sample_outlets) == 2

    tl_item = DossierTimelineItemModel(
        date="2026-11-28",
        display_date="28 Nov 2026",
        title="Anúncio do acordo preliminar",
        summary="Delegações confirmaram texto-base após três dias de reuniões técnicas.",
        type="turning_point",
        source_name="Reuters",
        source_url="https://www.reuters.com/world/exemplo",
    )
    assert tl_item.source_name == "Reuters"

    audit = DossierAuditReportModel(
        approved=True,
        nota_isencao=92,
        ressalvas_integradas=True,
        avisos=[],
        urls_validadas=["/entenda/acordo-comercial"],
        urls_removidas=[],
        audited_at="2026-11-28T03:00:00+00:00",
    )
    assert audit.approved is True

    pulse = DossierPulseOutputModel(
        proposed_latest_shift={
            "summary": "Nova rodada técnica foi concluída em Bruxelas.",
            "updated_at": "2026-11-28",
            "highlight_tag": "Pulso recente",
        },
        proposed_timeline_item={
            "date": "2026-11-28",
            "display_date": "28 Nov 2026",
            "title": "Conclusão da rodada técnica",
            "summary": "Negociadores fecharam capítulos sanitários e aduaneiros.",
            "type": "past",
            "source_name": "AFP",
            "source_url": "https://www.afp.com/exemplo",
        },
    )
    assert pulse.proposed_timeline_item is not None

    upd = DossieUpdatePayload(
        editorial_briefing=briefing.model_dump(),
        coverage_angles=[angle.model_dump()],
        audit_report=audit.model_dump(),
    )
    assert upd.editorial_briefing is not None

    crt = DossieCreatePayload(
        slug="acordo-comercial-2026",
        titulo="Acordo Comercial 2026",
        subtitulo="Cobertura comparada das negociações comerciais internacionais.",
        data_inicio="2026-11-01",
        editorial_briefing=briefing.model_dump(),
        coverage_angles=[angle.model_dump()],
        audit_report=audit.model_dump(),
    )
    assert crt.slug == "acordo-comercial-2026"


# ---------------------------------------------------------------------------
# 3. Cálculo de coverage_stats
# ---------------------------------------------------------------------------

def test_calcular_coverage_stats_vazio():
    stats = calcular_coverage_stats([])
    assert stats == {
        "total_materias": 0,
        "total_veiculos": 0,
        "primary_sources_count": 0,
        "by_country": [],
        "by_bias": [],
    }


def test_calcular_coverage_stats_completo():
    materias: List[Dict[str, Any]] = [
        {"veiculo_nome": "Folha", "pais_veiculo": "BR", "vies": "centro", "materia_url": "https://folha.uol.com.br/a"},
        {"veiculo_nome": "Folha", "pais_veiculo": "BR", "vies": "centro", "materia_url": "https://folha.uol.com.br/b"},
        {"veiculo_nome": "Banco Central", "pais_veiculo": "BR", "vies": "oficial", "materia_url": "https://www.bcb.gov.br/nota"},
        {"veiculo_nome": "Reuters", "pais_veiculo": "GB", "vies": "centro", "materia_url": "https://www.reuters.com/x"},
        {"veiculo_nome": "Le Monde", "pais_veiculo": "FR", "vies": "centro_esquerda", "materia_url": "https://www.lemonde.fr/y"},
    ]
    stats = calcular_coverage_stats(materias)
    assert stats["total_materias"] == 5
    assert stats["total_veiculos"] == 4
    assert stats["primary_sources_count"] == 1
    assert stats["by_country"][0] == {"pais": "BR", "count": 3, "pct": 60}
    assert stats["by_bias"][0] == {"vies": "centro", "count": 3, "pct": 60}


# ---------------------------------------------------------------------------
# 4. Validação Determinística de URLs Internas (Regra 11) e Auditoria
# ---------------------------------------------------------------------------

class _FakeCursor:
    def __init__(self, existing_slugs: Dict[str, set[str]], lock_result: bool = True):
        self.existing_slugs = existing_slugs
        self.lock_result = lock_result
        self._last_result: Any = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql: str, params: Any = None):
        s = sql.lower()
        if "pg_try_advisory_lock" in s:
            self._last_result = (self.lock_result,)
            return
        if "pg_advisory_unlock" in s:
            self._last_result = (True,)
            return
        slug = params[0] if params else ""
        if "from ai_entenda_o_assunto" in s:
            self._last_result = (1,) if slug in self.existing_slugs.get("entenda", set()) else None
        elif "from ai_colunas_editoriais" in s:
            self._last_result = (1,) if slug in self.existing_slugs.get("colunas", set()) else None
        elif "from dossies" in s:
            self._last_result = (1,) if slug in self.existing_slugs.get("dossies", set()) else None
        else:
            self._last_result = None

    def fetchone(self):
        return self._last_result

    def fetchall(self):
        return []


class _FakeConn:
    def __init__(self, existing_slugs: Dict[str, set[str]], lock_result: bool = True):
        self.existing_slugs = existing_slugs
        self.lock_result = lock_result

    def cursor(self):
        return _FakeCursor(self.existing_slugs, lock_result=self.lock_result)

    def rollback(self):
        pass


def test_validar_urls_internas_deterministico():
    conn = _FakeConn({"entenda": {"inflacao-global"}, "colunas": {"geopolitica-energia"}})
    sitemap = {"/dossies/copa-2026"}

    validadas, removidas = validar_urls_internas_dossie(
        conn,
        [
            "/entenda/inflacao-global",
            "/colunas/geopolitica-energia",
            "/dossies/copa-2026",
            "/entenda/slug-alucinado-404",
            "https://www.rodandoomundo.com.br/colunas/inexistente-999",
        ],
        sitemap_routes=sitemap,
    )
    assert set(validadas) == {"/entenda/inflacao-global", "/colunas/geopolitica-energia", "/dossies/copa-2026"}
    assert set(removidas) == {"/entenda/slug-alucinado-404", "/colunas/inexistente-999"}


def test_auditar_conteudo_dossie_remove_urls_invalidas():
    conn = _FakeConn({"entenda": {"tarifas-eua"}})
    conteudo = {
        "executive_summary": {
            "context": "Veja detalhes em /entenda/tarifas-eua e no link quebrado /colunas/alucinacao-404.",
            "pillars": [],
        },
        "timeline": [
            {"date": "2026-01-01", "display_date": "Jan 2026", "title": "A", "summary": "S", "type": "past", "source_url": "javascript:alert(1)"},
            {"date": "2026-02-01", "display_date": "Fev 2026", "title": "B", "summary": "S", "type": "turning_point"},
            {"date": "2026-03-01", "display_date": "Mar 2026", "title": "C", "summary": "S", "type": "upcoming"},
        ],
        "editorial_briefing": {
            "key_players": [{"name": "OMC", "role": "Órgão", "country_iso": None, "stance_summary": "Monitora disputas."}],
            "open_questions": [{"question": "Qual o impacto?", "answer": "Depende de negociações."}],
        },
        "coverage_angles": [
            {"label": "Local vs Global", "region_or_scope": "BR/US", "summary": "Enfoques distintos.", "sample_outlets": ["Reuters"]}
        ],
    }

    report = auditar_conteudo_dossie(conteudo, conn=conn, sitemap_routes=set())
    assert report["approved"] is True
    assert report["urls_validadas"] == ["/entenda/tarifas-eua"]
    assert report["urls_removidas"] == ["/colunas/alucinacao-404"]
    assert "/colunas/alucinacao-404" not in conteudo["executive_summary"]["context"]
    assert conteudo["timeline"][0]["source_url"] is None


def test_executar_pulso_dossies_lote_respeita_advisory_lock():
    conn_locked = _FakeConn({}, lock_result=False)
    res = executar_pulso_dossies_lote(conn_locked, min_novas=3)
    assert res["ok"] is True
    assert res["locked"] is True
    assert res["processados"] == 0
    assert DOSSIES_PULSO_ADVISORY_LOCK_KEY == 98230411
