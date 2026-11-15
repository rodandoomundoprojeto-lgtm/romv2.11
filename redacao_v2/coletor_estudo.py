"""Camada de Ingestão Assíncrona e Coleta de Acervo (Motor V2 — Rodando o Mundo).

Responsabilidades:
  1. Definir `FONTES_NOTICIAS_QUENTES_30MIN` (pulso rápido 30m) e `FONTES_ESTUDO_V2` (ciclo editorial 3h / biblioteca_v2),
     respeitando a política de governança de fontes de `docs/arquitetura_v2.md` (Seções 1, 2 e 3).
  2. Ler feeds RSS/Atom e canais institucionais (`youtube_rss` XML nativo) de forma assíncrona (`httpx` + `feedparser`),
     calculando `content_hash` (SHA-256) e respeitando `armazenamento_permitido` e `exibicao_permitida`.
  3. Buscar artigos e páginas já publicados em `rodandoomundo.com.br` via tabela `conteudos` (PostgreSQL)
     com fallback automático para `https://www.rodandoomundo.com.br/sitemap.xml` (e `sitemap.xml` local),
     retornando `[{"titulo": str, "url": str, "resumo": str}]`.
  4. Fornecer controle explícito de concorrência via PostgreSQL Session-Level Advisory Locks (`advisory_lock`)
     e validação estrita de URLs internas (`validar_urls_internas`).
"""
import asyncio
import hashlib
import os
import re
import time
import xml.etree.ElementTree as ET
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Generator, List, Optional, Tuple, Union
from urllib.parse import urlparse

import feedparser
import httpx
from bs4 import BeautifulSoup

try:
    from dotenv import load_dotenv
    ROOT_DIR = Path(__file__).resolve().parents[1]
    load_dotenv(ROOT_DIR / ".env")
    load_dotenv(ROOT_DIR / "curadoria" / ".env")
except ImportError:
    ROOT_DIR = Path(__file__).resolve().parents[1]

SITEMAP_URL_OFICIAL = "https://www.rodandoomundo.com.br/sitemap.xml"
SITEMAP_LOCAL_PATH = ROOT_DIR / "sitemap.xml"
USER_AGENT = "Mozilla/5.0 (compatible; RodandoOMundoBot/2.2; +https://www.rodandoomundo.com.br)"

# ============================================================================
# 1. LISTAS DE FONTES OFICIAIS (PULSO 30M E ESTUDO V2)
# ============================================================================

FONTES_NOTICIAS_QUENTES_30MIN: List[Dict[str, Any]] = [
    # Fontes Primárias Brasileiras (Pulso 30m — Seção 2 de docs/arquitetura_v2.md)
    {
        "nome": "Agência Brasil (EBC)",
        "url": "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "fonte_primaria",
        "cadencia": "pulso_30m",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "trecho_temporario",
        "exibicao_permitida": "manchete_sintese_e_link",
        "atribuicao_exigida": "Agência Brasil / EBC",
    },
    {
        "nome": "Notícias STF",
        "url": "https://portal.stf.jus.br/noticias/rss.asp",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "fonte_primaria",
        "cadencia": "pulso_30m",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "trecho_temporario",
        "exibicao_permitida": "manchete_sintese_e_link",
        "atribuicao_exigida": "Supremo Tribunal Federal (STF)",
    },
    {
        "nome": "Agência Senado",
        "url": "https://www12.senado.leg.br/noticias/feed/todasnoticias/RSS",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "fonte_primaria",
        "cadencia": "pulso_30m",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "trecho_temporario",
        "exibicao_permitida": "manchete_sintese_e_link",
        "atribuicao_exigida": "Agência Senado",
    },
    {
        "nome": "Agência Câmara",
        "url": "https://www.camara.leg.br/noticias/rss",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "fonte_primaria",
        "cadencia": "pulso_30m",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "trecho_temporario",
        "exibicao_permitida": "manchete_sintese_e_link",
        "atribuicao_exigida": "Agência Câmara",
    },
    # Veículos de Imprensa (Pulso 30m)
    {
        "nome": "BBC News Brasil",
        "url": "https://feeds.bbci.co.uk/portuguese/rss.xml",
        "pais_iso": "GB",
        "regiao": "Europa",
        "idioma": "pt",
        "tipo_fonte": "rss_feed",
        "cadencia": "pulso_30m",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "BBC News Brasil",
    },
    {
        "nome": "G1 Política",
        "url": "https://g1.globo.com/rss/g1/politica/",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "rss_feed",
        "cadencia": "pulso_30m",
        "peso_confianca": 4,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "G1",
    },
    {
        "nome": "G1 Economia",
        "url": "https://g1.globo.com/rss/g1/economia/",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "rss_feed",
        "cadencia": "pulso_30m",
        "peso_confianca": 4,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "G1 Economia",
    },
    {
        "nome": "G1 Mundo",
        "url": "https://g1.globo.com/rss/g1/mundo/",
        "pais_iso": "BR",
        "regiao": "Global",
        "idioma": "pt",
        "tipo_fonte": "rss_feed",
        "cadencia": "pulso_30m",
        "peso_confianca": 4,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "G1 Mundo",
    },
    {
        "nome": "Al Jazeera English",
        "url": "https://www.aljazeera.com/xml/rss/all.xml",
        "pais_iso": "QA",
        "regiao": "Oriente_Medio",
        "idioma": "en",
        "tipo_fonte": "rss_feed",
        "cadencia": "pulso_30m",
        "peso_confianca": 4,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "Al Jazeera",
    },
]

FONTES_ESTUDO_V2: List[Dict[str, Any]] = [
    # Fontes Primárias, Organismos Multilaterais e Análise Aprofundada (Ciclo 3h / Biblioteca V2)
    {
        "nome": "ONU News (Português)",
        "url": "https://news.un.org/feed/subscribe/pt/news/all/rss.xml",
        "pais_iso": "UN",
        "regiao": "Global",
        "idioma": "pt",
        "tipo_fonte": "fonte_primaria",
        "cadencia": "ciclo_3h",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "trecho_temporario",
        "exibicao_permitida": "manchete_sintese_e_link",
        "atribuicao_exigida": "ONU News",
    },
    {
        "nome": "Banco Central do Brasil",
        "url": "https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/noticias",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "fonte_primaria",
        "cadencia": "ciclo_3h",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "trecho_temporario",
        "exibicao_permitida": "manchete_sintese_e_link",
        "atribuicao_exigida": "Banco Central do Brasil",
    },
    {
        "nome": "Agência IBGE Notícias",
        "url": "https://agenciadenoticias.ibge.gov.br/agencia-noticias.xml",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "fonte_primaria",
        "cadencia": "ciclo_3h",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "trecho_temporario",
        "exibicao_permitida": "manchete_sintese_e_link",
        "atribuicao_exigida": "IBGE",
    },
    {
        "nome": "Nexo Jornal",
        "url": "https://www.nexojornal.com.br/rss.xml",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "rss_feed",
        "cadencia": "biblioteca_v2",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "Nexo Jornal",
    },
    {
        "nome": "InfoMoney Mercados",
        "url": "https://www.infomoney.com.br/feed/",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "rss_feed",
        "cadencia": "biblioteca_v2",
        "peso_confianca": 4,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "InfoMoney",
    },
    # Canais Oficiais no YouTube (RSS XML Nativo — Apenas Metadados, sem download de vídeo)
    {
        "nome": "TV Senado - YouTube",
        "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UCLgti7NuK0RuW9wty-fxPjQ",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "youtube_rss",
        "cadencia": "ciclo_3h",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "manchete_sintese_e_link",
        "atribuicao_exigida": "TV Senado (YouTube Oficial)",
    },
    {
        "nome": "Câmara dos Deputados - YouTube",
        "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UC-ZkSRh-7UEuwXJQ9UMCFJA",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "youtube_rss",
        "cadencia": "ciclo_3h",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "manchete_sintese_e_link",
        "atribuicao_exigida": "Câmara dos Deputados (YouTube)",
    },
    # --- NOVAS REFERÊNCIAS EXPANDIDAS (CÉREBRO V2: GEOPOLÍTICA, POLÍTICA E ECONOMIA) ---
    {
        "nome": "Xadrez Verbal (YouTube)",
        "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UCsMj2K36ejga547ge5cBscg",
        "pais_iso": "BR",
        "regiao": "Global",
        "idioma": "pt",
        "tipo_fonte": "youtube_rss",
        "cadencia": "ciclo_3h",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "manchete_sintese_e_link",
        "atribuicao_exigida": "Xadrez Verbal",
    },
    {
        "nome": "Petit Journal (YouTube)",
        "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UC-g5Ls_uobMiRatAWzhSTqA",
        "pais_iso": "BR",
        "regiao": "Global",
        "idioma": "pt",
        "tipo_fonte": "youtube_rss",
        "cadencia": "ciclo_3h",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "manchete_sintese_e_link",
        "atribuicao_exigida": "Petit Journal",
    },
    {
        "nome": "Chutando a Escada (YouTube)",
        "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UCn_HMLAk7lutYdOYjZB17ow",
        "pais_iso": "BR",
        "regiao": "Global",
        "idioma": "pt",
        "tipo_fonte": "youtube_rss",
        "cadencia": "ciclo_3h",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "manchete_sintese_e_link",
        "atribuicao_exigida": "Chutando a Escada",
    },
    {
        "nome": "Foro de Teresina - Revista Piauí (YouTube)",
        "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UCq-V8B_t_gUWlAJ5YaJSRzQ",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "youtube_rss",
        "cadencia": "ciclo_3h",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "manchete_sintese_e_link",
        "atribuicao_exigida": "Revista Piauí / Foro de Teresina",
    },
    {
        "nome": "Stock Pickers (YouTube)",
        "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UCx7ki_a6KpcvwQLBTz-zquA",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "youtube_rss",
        "cadencia": "ciclo_3h",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "manchete_sintese_e_link",
        "atribuicao_exigida": "Stock Pickers",
    },
    {
        "nome": "Os Economistas (YouTube)",
        "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UCIX5uq1meeqhtKdBIFwHGWg",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "youtube_rss",
        "cadencia": "ciclo_3h",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "manchete_sintese_e_link",
        "atribuicao_exigida": "Os Economistas",
    },
    {
        "nome": "Foreign Affairs",
        "url": "https://www.foreignaffairs.com/rss.xml",
        "pais_iso": "US",
        "regiao": "Global",
        "idioma": "en",
        "tipo_fonte": "rss_feed",
        "cadencia": "biblioteca_v2",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "Foreign Affairs",
    },
    {
        "nome": "Geopolitical Futures",
        "url": "https://geopoliticalfutures.com/feed/",
        "pais_iso": "US",
        "regiao": "Global",
        "idioma": "en",
        "tipo_fonte": "rss_feed",
        "cadencia": "biblioteca_v2",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "Geopolitical Futures",
    },
    {
        "nome": "JOTA Info",
        "url": "https://www.jota.info/feed",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "rss_feed",
        "cadencia": "biblioteca_v2",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "JOTA",
    },
    {
        "nome": "Canal Meio",
        "url": "https://www.canalmeio.com.br/feed/",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "rss_feed",
        "cadencia": "ciclo_3h",
        "peso_confianca": 4,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "Canal Meio",
    },
    {
        "nome": "Poder360",
        "url": "https://www.poder360.com.br/feed/",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "rss_feed",
        "cadencia": "ciclo_3h",
        "peso_confianca": 4,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "Poder360",
    },
    {
        "nome": "The News",
        "url": "https://thenewscc.beehiiv.com/feed",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "rss_feed",
        "cadencia": "ciclo_3h",
        "peso_confianca": 4,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "The News",
    },
    # --- GEOPOLÍTICA E POLÍTICA INTERNACIONAL (BRASIL / PT) ---
    {
        "nome": "Política Global (Oliver Stuenkel)",
        "url": "https://oliverstuenkel.substack.com/feed",
        "pais_iso": "BR",
        "regiao": "Global",
        "idioma": "pt",
        "tipo_fonte": "rss_feed",
        "cadencia": "biblioteca_v2",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "Oliver Stuenkel (Substack)",
    },
    {
        "nome": "Lucas Leite - Política Mundial",
        "url": "https://proflucasleite.substack.com/feed",
        "pais_iso": "BR",
        "regiao": "Global",
        "idioma": "pt",
        "tipo_fonte": "rss_feed",
        "cadencia": "biblioteca_v2",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "Prof. Lucas Leite (Substack)",
    },
    {
        "nome": "The Conversation Brasil",
        "url": "https://theconversation.com/br/articles.atom",
        "pais_iso": "BR",
        "regiao": "America_do_Sul",
        "idioma": "pt",
        "tipo_fonte": "rss_feed",
        "cadencia": "biblioteca_v2",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "The Conversation Brasil",
    },
    # --- GEOPOLÍTICA E ASSUNTOS GLOBAIS (ACADÊMICOS / EN) ---
    {
        "nome": "The Conversation US (World)",
        "url": "https://theconversation.com/us/world/articles.atom",
        "pais_iso": "US",
        "regiao": "Global",
        "idioma": "en",
        "tipo_fonte": "rss_feed",
        "cadencia": "biblioteca_v2",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "The Conversation US",
    },
    {
        "nome": "The Conversation UK (World)",
        "url": "https://theconversation.com/uk/world/articles.atom",
        "pais_iso": "GB",
        "regiao": "Global",
        "idioma": "en",
        "tipo_fonte": "rss_feed",
        "cadencia": "biblioteca_v2",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "The Conversation UK",
    },
    # --- DEFESA, ESTRATÉGIA MILITAR E SEGURANÇA INTERNACIONAL ---
    {
        "nome": "War on the Rocks",
        "url": "https://warontherocks.com/feed/",
        "pais_iso": "US",
        "regiao": "Global",
        "idioma": "en",
        "tipo_fonte": "rss_feed",
        "cadencia": "biblioteca_v2",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "War on the Rocks",
    },
    # --- TEORIA DE RELAÇÕES INTERNACIONAIS E ACADEMIA ---
    {
        "nome": "E-International Relations",
        "url": "https://www.e-ir.org/feed",
        "pais_iso": "GB",
        "regiao": "Global",
        "idioma": "en",
        "tipo_fonte": "rss_feed",
        "cadencia": "biblioteca_v2",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "E-International Relations",
    },
    {
        "nome": "LSE International Relations Blog",
        "url": "https://blogs.lse.ac.uk/internationalrelations/feed/",
        "pais_iso": "GB",
        "regiao": "Global",
        "idioma": "en",
        "tipo_fonte": "rss_feed",
        "cadencia": "biblioteca_v2",
        "peso_confianca": 5,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "LSE International Relations Blog",
    },
    # --- CONTRAPONTOS REALISTAS / MULTIPOLARES (PESO MODERADO PARA CONTRADITÓRIO) ---
    {
        "nome": "John's Substack (John J. Mearsheimer)",
        "url": "https://mearsheimer.substack.com/feed",
        "pais_iso": "US",
        "regiao": "Global",
        "idioma": "en",
        "tipo_fonte": "rss_feed",
        "cadencia": "biblioteca_v2",
        "peso_confianca": 4,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "John J. Mearsheimer (Substack)",
    },
    {
        "nome": "Glenn Diesen's Substack",
        "url": "https://glenndiesen.substack.com/feed",
        "pais_iso": "NO",
        "regiao": "Global",
        "idioma": "en",
        "tipo_fonte": "rss_feed",
        "cadencia": "biblioteca_v2",
        "peso_confianca": 3,
        "politica_uso_status": "aprovada",
        "coleta_permitida": True,
        "armazenamento_permitido": "apenas_metadados",
        "exibicao_permitida": "sintese_e_link",
        "atribuicao_exigida": "Glenn Diesen (Substack)",
    },
]

# Catálogo descritivo de rotas do sitemap oficial de rodandoomundo.com.br
CATALOGO_ROTAS_SITEMAP: Dict[str, Tuple[str, str]] = {
    "/": (
        "Rodando o Mundo — Atlas Jornalístico e Radar Global",
        "Página inicial do portal Rodando o Mundo com cobertura internacional comparada, mapa interativo e radar de notícias.",
    ),
    "/radar": (
        "Radar Geopolítico e Internacional — Rodando o Mundo",
        "Monitoramento em tempo real dos principais acontecimentos geopolíticos, econômicos e diplomáticos ao redor do mundo.",
    ),
    "/resumo-do-dia": (
        "Resumo do Dia — Os Fatos Mais Importantes Explicados",
        "Síntese diária curada com os acontecimentos essenciais do Brasil e do mundo e por que eles importam.",
    ),
    "/ultimas-noticias": (
        "Últimas Notícias em Tempo Real — Rodando o Mundo",
        "Fluxo contínuo de notícias atualizadas de veículos nacionais e internacionais verificados.",
    ),
    "/temas": (
        "Temas e Editorias Globais — Rodando o Mundo",
        "Hub central de páginas temáticas sobre geopolítica, economia, eleições, clima, tecnologia e sociedade.",
    ),
    "/entenda": (
        "Entenda o Assunto — Guias Explicativos e Contexto",
        "Explicações didáticas e aprofundadas sobre conceitos políticos, econômicos e geopolíticos recorrentes no noticiário.",
    ),
    "/politica/brasil": (
        "Política no Brasil — Cobertura Comparada e Instituições",
        "Acompanhamento dos Três Poderes (Executivo, Legislativo e STF), políticas públicas e articulações no Brasil.",
    ),
    "/economia/brasil": (
        "Economia no Brasil — Juros, Inflação, Câmbio e Fiscal",
        "Análise e notícias sobre Selic, IPCA, mercado de trabalho, câmbio e indicadores econômicos brasileiros.",
    ),
    "/politica/estados-unidos": (
        "Política nos Estados Unidos — Casa Branca, Congresso e Diplomacia",
        "Cobertura das decisões políticas, econômicas e geopolíticas dos Estados Unidos e seu impacto internacional.",
    ),
    "/guerra-ucrania": (
        "Guerra na Ucrânia e Segurança Europeia — Linha do Tempo e Contexto",
        "Cobertura especial, impactos geopolíticos, sanções e desdobramentos militares e diplomáticos do conflito no Leste Europeu.",
    ),
    "/clima": (
        "Clima, Meio Ambiente e Transição Energética — Rodando o Mundo",
        "Cobertura de cúpulas climáticas, COP30, eventos extremos, biodiversidade e acordos ambientais globais.",
    ),
    "/eleicoes": (
        "Eleições no Brasil e no Mundo — Calendário e Análises",
        "Acompanhamento de processos eleitorais, pesquisas, debates e sistemas políticos em diferentes democracias.",
    ),
    "/tecnologia": (
        "Tecnologia, Inteligência Artificial e Regulação Digital",
        "Inovação tecnológica, disputa por semicondutores, inteligência artificial e regulação das plataformas digitais.",
    ),
    "/esportes": (
        "Esportes e Grandes Eventos Globais — Rodando o Mundo",
        "Cobertura das principais competições internacionais, impacto econômico e cultural do esporte no mundo.",
    ),
    "/saude": (
        "Saúde Pública, Ciência e Bem-Estar Global",
        "Notícias sobre avanços médicos, alertas da OMS, políticas de saúde pública e descobertas científicas.",
    ),
    "/cultura": (
        "Cultura, História, Cinema e Destinos Globais",
        "Conexões entre produções culturais, patrimônio histórico, gastronomia e costumes pelo mundo.",
    ),
    "/entenda/o-que-e-inflacao": (
        "Entenda: O que é Inflação e como ela afeta o seu poder de compra",
        "Explicação didática sobre índices de preços (IPCA), causas da inflação, papel do Banco Central e impacto no custo de vida.",
    ),
    "/entenda/o-que-e-impeachment": (
        "Entenda: O que é Impeachment e como funciona o processo",
        "Guia completo sobre crimes de responsabilidade, rito na Câmara e no Senado e histórico constitucional.",
    ),
    "/entenda/o-que-e-o-orcamento": (
        "Entenda: O que é o Orçamento Público (LDO, LOA e Arcabouço Fiscal)",
        "Como o governo arrecada e define os gastos públicos, emendas parlamentares e metas fiscais.",
    ),
    "/entenda/como-funcionam-as-eleicoes-nos-eua": (
        "Entenda: Como funcionam as Eleições nos Estados Unidos e o Colégio Eleitoral",
        "Explicação detalhada das primárias, delegados, estados-pêndulo (swing states) e votação indireta nos EUA.",
    ),
    "/entenda/o-que-e-a-cop30": (
        "Entenda: O que é a COP30 e a importância da Conferência do Clima no Brasil",
        "Objetivos das conferências climáticas da ONU, metas de descarbonização, financiamento climático e papel da Amazônia.",
    ),
    "/entenda/o-que-e-sancao-internacional": (
        "Entenda: O que são Sanções Internacionais e como afetam a economia global",
        "Como funcionam bloqueios financeiros, embargos comerciais e restrições diplomáticas entre países.",
    ),
    "/metodologia": (
        "Metodologia Editorial e Governança de Fontes — Rodando o Mundo",
        "Critérios de curadoria, verificação factual, pluralidade de fontes e transparência editorial do portal.",
    ),
    "/sobre.html": (
        "Sobre o Rodando o Mundo — Nossa Missão e Arquitetura Jornalística",
        "Conheça o projeto Rodando o Mundo, plataforma de jornalismo comparado e descoberta internacional.",
    ),
    "/cadastrar-veiculo": (
        "Cadastrar Veículo no Atlas — Rodando o Mundo",
        "Formulário para sugestão e inclusão de novos veículos de imprensa no catálogo global do Rodando o Mundo.",
    ),
    "/parcerias": (
        "Parcerias Institucionais e Comerciais — Rodando o Mundo",
        "Informações para parceiros editoriais, anunciantes e projetos especiais no portal.",
    ),
    "/clube": (
        "Clube Rodando o Mundo — Comunidade e Benefícios",
        "Espaço dedicado aos leitores e apoiadores do jornalismo internacional independente.",
    ),
}


# ============================================================================
# 2. UTILITÁRIOS DE LIMPEZA, HASH E GOVERNANÇA
# ============================================================================

def limpar_html(texto_sujo: Optional[str], limite: int = 500) -> str:
    """Remove tags HTML, normaliza espaços em branco e trunca no limite especificado."""
    if not texto_sujo:
        return ""
    soup = BeautifulSoup(str(texto_sujo), "html.parser")
    texto = soup.get_text(separator=" ")
    texto = re.sub(r"\s+", " ", texto).strip()
    return texto[:limite]


def gerar_content_hash(canonical_url: str, titulo: str) -> str:
    """Gera hash SHA-256 determinístico de 64 caracteres para idempotência (`ai_documentos_coletados`)."""
    base = f"{(canonical_url or '').strip()}|{(titulo or '').strip()}"
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def extrair_data_publicacao(entry: Any) -> Optional[str]:
    """Converte a data de publicação do feedparser para string ISO-8601 UTC."""
    for attr in ("published_parsed", "updated_parsed"):
        parsed = getattr(entry, attr, None)
        if parsed:
            try:
                dt = datetime.fromtimestamp(time.mktime(parsed), tz=timezone.utc)
                return dt.isoformat()
            except Exception:
                pass
    return None


def normalizar_config_fonte(fonte: Union[str, Dict[str, Any]]) -> Dict[str, Any]:
    """Permite passar tanto um dict completo quanto uma string URL simples."""
    if isinstance(fonte, str):
        eh_yt = "youtube.com/feeds/videos.xml" in fonte
        return {
            "nome": fonte,
            "url": fonte,
            "pais_iso": "BR",
            "idioma": "pt",
            "tipo_fonte": "youtube_rss" if eh_yt else "rss_feed",
            "cadencia": "pulso_30m",
            "peso_confianca": 3,
            "politica_uso_status": "aprovada",
            "coleta_permitida": True,
            "armazenamento_permitido": "apenas_metadados",
            "exibicao_permitida": "sintese_e_link",
        }
    return dict(fonte)


# ============================================================================
# 3. CONTROLE DE CONCORRÊNCIA EXPLÍCITO (POSTGRESQL SESSION-LEVEL ADVISORY LOCK)
# ============================================================================

@contextmanager
def advisory_lock(conn: Any, recurso_chave: str) -> Generator[bool, None, None]:
    """Gerenciador de contexto para PostgreSQL Session-Level Advisory Lock (Seção 3 de docs/arquitetura_v2.md).

    Uso:
        with advisory_lock(conn, f"coleta_fonte:{source_id}") as adquirido:
            if not adquirido:
                # Registra status = 'ignorado_lock_ocupado' e encerra
                return
            # Executa operação protegida
    """
    adquirido = False
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_try_advisory_lock(hashtext(%s));", (recurso_chave,))
            row = cur.fetchone()
            if isinstance(row, dict):
                adquirido = bool(list(row.values())[0])
            elif row is not None:
                adquirido = bool(row[0])
        yield adquirido
    finally:
        if adquirido:
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT pg_advisory_unlock(hashtext(%s));", (recurso_chave,))
            except Exception as e:  # noqa: BLE001
                print(f"[Aviso] Erro ao liberar advisory lock para '{recurso_chave}': {e}")


# ============================================================================
# 4. LEITURA ASSÍNCRONA DE FEEDS (httpx + feedparser)
# ============================================================================

async def coletar_feed_individual_async(
    client: httpx.AsyncClient,
    fonte_raw: Union[str, Dict[str, Any]],
    max_itens: int = 10,
) -> List[Dict[str, Any]]:
    """Coleta e processa um único feed RSS/Atom/YouTube XML de forma assíncrona."""
    fonte = normalizar_config_fonte(fonte_raw)
    url = fonte.get("url", "").strip()
    if not url:
        return []

    # Governança (Seção 1): Só coleta fontes com política aprovada e coleta_permitida = True
    if fonte.get("politica_uso_status", "aprovada") != "aprovada" or not fonte.get("coleta_permitida", True):
        return []

    try:
        resp = await client.get(url, follow_redirects=True)
        resp.raise_for_status()
        conteudo_bytes = resp.content
    except Exception as e:  # noqa: BLE001
        print(f"[Aviso] Falha HTTP ao ler feed '{fonte.get('nome', url)}': {e}")
        return []

    # Parsing via feedparser (em thread se necessário ou direto em memória)
    feed = feedparser.parse(conteudo_bytes)
    nome_fonte = fonte.get("nome") or feed.feed.get("title") or url
    tipo_fonte = fonte.get("tipo_fonte", "rss_feed")
    armazenamento = fonte.get("armazenamento_permitido", "apenas_metadados")

    # Regra para youtube_rss: sempre apenas_metadados, sem retenção de mídia
    if tipo_fonte == "youtube_rss":
        armazenamento = "apenas_metadados"

    original_retido = armazenamento != "apenas_metadados"
    limitacao_auditoria = (
        None
        if original_retido
        else "Política da fonte permite apenas retenção de metadados; texto integral descartado após processamento."
    )

    itens: List[Dict[str, Any]] = []
    for entry in (feed.entries or [])[:max_itens]:
        titulo = limpar_html(entry.get("title", ""), limite=240)
        link = (entry.get("link") or "").strip()
        if not titulo or not link:
            continue

        # Em feeds YouTube RSS, a descrição vem em media_description ou summary
        resumo_bruto = (
            entry.get("summary")
            or entry.get("description")
            or entry.get("media_description")
            or ""
        )
        resumo = limpar_html(resumo_bruto, limite=450)
        content_hash = gerar_content_hash(link, titulo)

        itens.append({
            "fonte": nome_fonte,
            "fonte_url": url,
            "tipo_fonte": tipo_fonte,
            "cadencia": fonte.get("cadencia", "pulso_30m"),
            "pais_iso": fonte.get("pais_iso", "BR"),
            "idioma": fonte.get("idioma", "pt"),
            "peso_confianca": fonte.get("peso_confianca", 3),
            "exibicao_permitida": fonte.get("exibicao_permitida", "sintese_e_link"),
            "titulo": titulo,
            "url": link,
            "canonical_url": link,
            "resumo": resumo,
            "trecho_utilizado": resumo if original_retido else None,
            "original_retido": original_retido,
            "limitacao_auditoria": limitacao_auditoria,
            "content_hash": content_hash,
            "published_at": extrair_data_publicacao(entry),
        })

    return itens


async def coletar_fontes_async(
    fontes: List[Union[str, Dict[str, Any]]],
    max_itens_por_fonte: int = 10,
    concorrencia_max: int = 6,
    timeout_segundos: float = 12.0,
) -> List[Dict[str, Any]]:
    """Lê múltiplas fontes RSS/XML em paralelo com `httpx.AsyncClient` e deduplicação por URL/título."""
    semaforo = asyncio.Semaphore(concorrencia_max)
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8",
    }

    async with httpx.AsyncClient(headers=headers, timeout=timeout_segundos) as client:
        async def _tarefa(f: Union[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
            async with semaforo:
                return await coletar_feed_individual_async(client, f, max_itens=max_itens_por_fonte)

        resultados = await asyncio.gather(*[_tarefa(f) for f in fontes], return_exceptions=True)

    itens_consolidados: List[Dict[str, Any]] = []
    chaves_vistas = set()

    for res in resultados:
        if isinstance(res, Exception) or not isinstance(res, list):
            continue
        for item in res:
            chave = (item["canonical_url"].lower(), item["titulo"].lower())
            if chave in chaves_vistas:
                continue
            chaves_vistas.add(chave)
            itens_consolidados.append(item)

    return itens_consolidados


async def coletar_noticias_quentes_30min_async(
    max_itens_por_fonte: int = 8,
    fontes_custom: Optional[List[Union[str, Dict[str, Any]]]] = None,
) -> List[Dict[str, Any]]:
    """Coleta de forma assíncrona a lista `FONTES_NOTICIAS_QUENTES_30MIN`."""
    alvo = fontes_custom if fontes_custom is not None else FONTES_NOTICIAS_QUENTES_30MIN
    return await coletar_fontes_async(alvo, max_itens_por_fonte=max_itens_por_fonte)


async def coletar_fontes_estudo_v2_async(
    max_itens_por_fonte: int = 8,
    fontes_custom: Optional[List[Union[str, Dict[str, Any]]]] = None,
) -> List[Dict[str, Any]]:
    """Coleta de forma assíncrona a lista `FONTES_ESTUDO_V2`."""
    alvo = fontes_custom if fontes_custom is not None else FONTES_ESTUDO_V2
    return await coletar_fontes_async(alvo, max_itens_por_fonte=max_itens_por_fonte)


# ============================================================================
# 5. BUSCA DE ARTIGOS PUBLICADOS NO RODANDOOMUNDO.COM.BR (DB + FALLBACK SITEMAP)
# ============================================================================

def _humanizar_url_sitemap(url: str) -> Dict[str, str]:
    """Converte uma URL do sitemap.xml em `{titulo, url, resumo}` usando o catálogo ou inferência limpa."""
    parsed = urlparse(url)
    path = parsed.path or "/"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")

    if path in CATALOGO_ROTAS_SITEMAP:
        titulo, resumo = CATALOGO_ROTAS_SITEMAP[path]
        return {"titulo": titulo, "url": url, "resumo": resumo}

    # Inferência caso surja uma nova rota no sitemap.xml
    segmentos = [s for s in path.strip("/").split("/") if s]
    if not segmentos:
        titulo_inf = "Rodando o Mundo — Página Inicial"
    else:
        ultimo = segmentos[-1].replace(".html", "").replace("-", " ").title()
        prefixo = segmentos[0].replace("-", " ").title() if len(segmentos) > 1 else "Portal"
        titulo_inf = f"{prefixo}: {ultimo} — Rodando o Mundo"

    resumo_inf = f"Conteúdo publicado no portal Rodando o Mundo na rota {path}."
    return {"titulo": titulo_inf, "url": url, "resumo": resumo_inf}


def parsear_xml_sitemap(xml_texto: str) -> List[Dict[str, str]]:
    """Extrai todas as tags `<loc>` de um XML de sitemap e retorna `[{titulo, url, resumo}]`."""
    if not xml_texto or "<urlset" not in xml_texto:
        return []
    artigos: List[Dict[str, str]] = []
    urls_vistas = set()
    try:
        root = ET.fromstring(xml_texto.strip())
        for elem in root.iter():
            if elem.tag.endswith("loc") and elem.text:
                loc = elem.text.strip()
                if loc and loc not in urls_vistas:
                    urls_vistas.add(loc)
                    artigos.append(_humanizar_url_sitemap(loc))
    except Exception as e:  # noqa: BLE001
        print(f"[Aviso] Erro ao fazer parse do XML do sitemap: {e}")
    return artigos


async def carregar_sitemap_rom_async(
    sitemap_url: str = SITEMAP_URL_OFICIAL,
    timeout_segundos: float = 10.0,
) -> List[Dict[str, str]]:
    """Busca o sitemap oficial via HTTP assíncrono, com fallback resiliente para `sitemap.xml` local."""
    headers = {"User-Agent": USER_AGENT, "Accept": "application/xml, text/xml, */*;q=0.8"}
    try:
        async with httpx.AsyncClient(headers=headers, timeout=timeout_segundos) as client:
            resp = await client.get(sitemap_url, follow_redirects=True)
            if resp.status_code == 200 and "<urlset" in resp.text:
                itens = parsear_xml_sitemap(resp.text)
                if itens:
                    return itens
    except Exception as e:  # noqa: BLE001
        print(f"[Aviso] Falha ao buscar sitemap remoto ({sitemap_url}): {e}")

    # Fallback para o arquivo sitemap.xml local do repositório
    if SITEMAP_LOCAL_PATH.exists():
        try:
            xml_local = SITEMAP_LOCAL_PATH.read_text(encoding="utf-8")
            return parsear_xml_sitemap(xml_local)
        except Exception as e:  # noqa: BLE001
            print(f"[Aviso] Falha ao ler sitemap local ({SITEMAP_LOCAL_PATH}): {e}")

    return []


def _mapear_conteudo_para_url_sitemap(
    titulo: str,
    categoria: str,
    urls_sitemap_validas: List[str],
) -> str:
    """Resolve uma URL interna garantidamente válida do sitemap para um registro da tabela `conteudos`."""
    t_lower = (titulo or "").lower()
    cat_lower = (categoria or "").lower()

    mapa_palavras_rota = [
        ("inflação", "https://www.rodandoomundo.com.br/entenda/o-que-e-inflacao"),
        ("inflacao", "https://www.rodandoomundo.com.br/entenda/o-que-e-inflacao"),
        ("impeachment", "https://www.rodandoomundo.com.br/entenda/o-que-e-impeachment"),
        ("orçamento", "https://www.rodandoomundo.com.br/entenda/o-que-e-o-orcamento"),
        ("orcamento", "https://www.rodandoomundo.com.br/entenda/o-que-e-o-orcamento"),
        ("eleições nos eua", "https://www.rodandoomundo.com.br/entenda/como-funcionam-as-eleicoes-nos-eua"),
        ("colégio eleitoral", "https://www.rodandoomundo.com.br/entenda/como-funcionam-as-eleicoes-nos-eua"),
        ("cop30", "https://www.rodandoomundo.com.br/entenda/o-que-e-a-cop30"),
        ("sanção", "https://www.rodandoomundo.com.br/entenda/o-que-e-sancao-internacional"),
        ("sancao", "https://www.rodandoomundo.com.br/entenda/o-que-e-sancao-internacional"),
        ("sanções", "https://www.rodandoomundo.com.br/entenda/o-que-e-sancao-internacional"),
        ("ucrânia", "https://www.rodandoomundo.com.br/guerra-ucrania"),
        ("ucrania", "https://www.rodandoomundo.com.br/guerra-ucrania"),
        ("estados unidos", "https://www.rodandoomundo.com.br/politica/estados-unidos"),
        ("casa branca", "https://www.rodandoomundo.com.br/politica/estados-unidos"),
        ("clima", "https://www.rodandoomundo.com.br/clima"),
        ("eleiç", "https://www.rodandoomundo.com.br/eleicoes"),
        ("tecnologia", "https://www.rodandoomundo.com.br/tecnologia"),
        ("inteligência artificial", "https://www.rodandoomundo.com.br/tecnologia"),
        ("saúde", "https://www.rodandoomundo.com.br/saude"),
        ("esporte", "https://www.rodandoomundo.com.br/esportes"),
    ]

    set_validas = set(urls_sitemap_validas)
    for termo, rota_url in mapa_palavras_rota:
        if termo in t_lower and (not set_validas or rota_url in set_validas):
            return rota_url

    if "economia" in cat_lower:
        return "https://www.rodandoomundo.com.br/economia/brasil"
    if "eleic" in cat_lower:
        return "https://www.rodandoomundo.com.br/eleicoes"
    if "geopolit" in cat_lower or "radar" in cat_lower:
        return "https://www.rodandoomundo.com.br/radar"
    if "cultura" in cat_lower:
        return "https://www.rodandoomundo.com.br/cultura"
    if "resumo" in cat_lower:
        return "https://www.rodandoomundo.com.br/resumo-do-dia"
    return "https://www.rodandoomundo.com.br/politica/brasil"


def _consultar_tabela_conteudos_db(
    db_url: str,
    urls_sitemap_validas: List[str],
    limite: int = 80,
) -> List[Dict[str, str]]:
    """Consulta a tabela `conteudos` no PostgreSQL e retorna `[{titulo, url, resumo}]`."""
    if not db_url:
        return []
    try:
        import psycopg
        from psycopg.rows import dict_row

        with psycopg.connect(db_url, connect_timeout=5, row_factory=dict_row, prepare_threshold=None) as conn:
            with conn.cursor() as cur:
                # Verifica colunas existentes na tabela conteudos
                cur.execute(
                    """
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = 'conteudos';
                    """
                )
                colunas = {r["column_name"] for r in cur.fetchall()}
                if not colunas:
                    return []

                tem_url = "url" in colunas or "slug" in colunas
                if "url" in colunas:
                    query = "SELECT titulo, url, resumo, categoria FROM conteudos ORDER BY publicado_em DESC NULLS LAST LIMIT %s;"
                elif "slug" in colunas:
                    query = "SELECT titulo, slug, resumo, categoria FROM conteudos ORDER BY publicado_em DESC NULLS LAST LIMIT %s;"
                else:
                    query = "SELECT titulo, resumo, categoria FROM conteudos ORDER BY publicado_em DESC NULLS LAST LIMIT %s;"

                cur.execute(query, (limite,))
                rows = cur.fetchall()

        resultados: List[Dict[str, str]] = []
        for r in rows:
            titulo = (r.get("titulo") or "").strip()
            resumo = (r.get("resumo") or titulo).strip()
            categoria = (r.get("categoria") or "").strip()
            if not titulo:
                continue

            url_item = ""
            if tem_url:
                bruto = (r.get("url") or r.get("slug") or "").strip()
                if bruto.startswith("http"):
                    url_item = bruto
                elif bruto:
                    url_item = f"https://www.rodandoomundo.com.br/{bruto.lstrip('/')}"

            if not url_item:
                url_item = _mapear_conteudo_para_url_sitemap(titulo, categoria, urls_sitemap_validas)

            resultados.append({
                "titulo": titulo,
                "url": url_item,
                "resumo": resumo[:400],
            })
        return resultados
    except Exception as e:  # noqa: BLE001
        print(f"[Aviso] Consulta à tabela `conteudos` indisponível (usando fallback sitemap.xml): {e}")
        return []


async def buscar_artigos_publicados_rom_async(
    db_url: Optional[str] = None,
    sitemap_url: str = SITEMAP_URL_OFICIAL,
    limite: int = 80,
) -> List[Dict[str, str]]:
    """Busca artigos e páginas já publicados no `rodandoomundo.com.br` via tabela `conteudos`
    com fallback automático para `https://www.rodandoomundo.com.br/sitemap.xml`.

    Retorna:
        Lista de dicionários no formato `[{"titulo": str, "url": str, "resumo": str}]`.
    """
    database_url = (
        db_url
        or os.getenv("DATABASE_URL")
        or os.getenv("CURADORIA_DATABASE_URL")
        or ""
    ).strip()

    # Carrega o sitemap para garantir conjunto de URLs canônicas reais e servir de fallback imediato
    itens_sitemap = await carregar_sitemap_rom_async(sitemap_url=sitemap_url)
    urls_sitemap_validas = [item["url"] for item in itens_sitemap]

    itens_db: List[Dict[str, str]] = []
    if database_url:
        itens_db = await asyncio.to_thread(
            _consultar_tabela_conteudos_db,
            database_url,
            urls_sitemap_validas,
            limite,
        )

    if itens_db:
        # Mescla os artigos do banco com as rotas estruturais do sitemap sem duplicar título
        titulos_vistos = {i["titulo"].lower() for i in itens_db}
        combinados = list(itens_db)
        for item_sm in itens_sitemap:
            if item_sm["titulo"].lower() not in titulos_vistos:
                combinados.append(item_sm)
                titulos_vistos.add(item_sm["titulo"].lower())
        return combinados[:limite]

    return itens_sitemap[:limite]


def buscar_artigos_publicados_rom(
    db_url: Optional[str] = None,
    sitemap_url: str = SITEMAP_URL_OFICIAL,
    limite: int = 80,
) -> List[Dict[str, str]]:
    """Wrapper síncrono para `buscar_artigos_publicados_rom_async`."""
    return asyncio.run(
        buscar_artigos_publicados_rom_async(db_url=db_url, sitemap_url=sitemap_url, limite=limite)
    )


# ============================================================================
# 6. VALIDAÇÃO ESTRITA DE URLS INTERNAS CONTRA BANCO / SITEMAP (REGRA 11)
# ============================================================================

def validar_urls_internas(
    links_sugeridos: List[Dict[str, str]],
    acervo_publicado: List[Dict[str, str]],
) -> Tuple[List[Dict[str, str]], List[str]]:
    """Valida uma lista de links internos contra o acervo real do banco/sitemap.

    Retorna:
        `(links_validados, urls_invalidas_removidas)`
        Apenas links cuja URL exista comprovadamente em `acervo_publicado` são mantidos.
    """
    mapa_urls_validas = {
        item["url"].rstrip("/").lower(): item
        for item in acervo_publicado
        if item.get("url")
    }

    validados: List[Dict[str, str]] = []
    removidas: List[str] = []

    for link in links_sugeridos:
        url_cand = (link.get("url_existente") or link.get("url") or "").strip()
        chave = url_cand.rstrip("/").lower()
        if chave and chave in mapa_urls_validas:
            item_real = mapa_urls_validas[chave]
            validados.append({
                "titulo_existente": link.get("titulo_existente") or item_real["titulo"],
                "url_existente": item_real["url"],
                "motivo_conexao": link.get("motivo_conexao") or item_real["resumo"],
            })
        elif url_cand:
            removidas.append(url_cand)

    return validados, removidas


# ============================================================================
# 7. EXECUÇÃO DIRETA / TESTE RÁPIDO DE CLI
# ============================================================================

async def _teste_rapido_cli() -> None:
    print("=== Teste Rápido: redacao_v2/coletor_estudo.py ===")
    fontes_teste = [
        FONTES_NOTICIAS_QUENTES_30MIN[0],  # Agência Brasil (EBC)
        FONTES_NOTICIAS_QUENTES_30MIN[4],  # BBC News Brasil
        FONTES_ESTUDO_V2[0],               # ONU News Português
    ]
    print(f"1) Coletando {len(fontes_teste)} feeds assincronamente (httpx + feedparser)...")
    itens_feeds = await coletar_fontes_async(fontes_teste, max_itens_por_fonte=3)
    print(f"   -> Total de itens coletados dos feeds: {len(itens_feeds)}")
    for idx, item in enumerate(itens_feeds[:4], 1):
        print(f"   [{idx}] ({item['fonte']}) {item['titulo']} -> {item['url']}")

    print("\n2) Buscando artigos publicados no rodandoomundo.com.br (DB conteudos -> fallback sitemap.xml)...")
    artigos_rom = await buscar_artigos_publicados_rom_async(limite=15)
    print(f"   -> Total de artigos/rotas retornados: {len(artigos_rom)}")
    for idx, art in enumerate(artigos_rom[:5], 1):
        print(f"   [{idx}] {art['titulo']} | {art['url']}")
        print(f"       Resumo: {art['resumo'][:90]}...")


if __name__ == "__main__":
    asyncio.run(_teste_rapido_cli())
