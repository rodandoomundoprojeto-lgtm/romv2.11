"""Fontes curadas para o Agente de Curadoria (RSS editoriais + config/sources.json + Google Trends BR)."""

FEEDS_RSS_RODANDO_O_MUNDO = {
    "Politica": [
        "https://g1.globo.com/rss/g1/politica/",
        "https://agenciabrasil.ebc.com.br/rss/politica/feed.xml",
        "https://www.jota.info/feed",
        "https://www.canalmeio.com.br/feed/",
        "https://www.poder360.com.br/feed/",
    ],
    "Geopolitica_Radar": [
        "https://feeds.bbci.co.uk/portuguese/rss.xml",
        "https://www.aljazeera.com/xml/rss/all.xml",
        "https://www.foreignaffairs.com/rss.xml",
        "https://geopoliticalfutures.com/feed/",
    ],
    "Economia": [
        "https://g1.globo.com/rss/g1/economia/",
        "https://www.infomoney.com.br/feed/",
        "https://thenewscc.beehiiv.com/feed",
    ],
    "Cultura": [
        "https://www.nexojornal.com.br/rss.xml",
        "https://aventurasnahistoria.com.br/feed",
    ],
}

GOOGLE_TRENDS_RSS = "https://trends.google.com/trending/rss?geo=BR"

USER_AGENT = "Mozilla/5.0 (RodandoOMundoBot/1.0; +https://www.rodandoomundo.com.br)"
