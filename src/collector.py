"""
Módulo de Coleta: Lê config/sources.json, processa RSS e YouTube, e extrai textos/legendas.
"""
import json
import os
import re
from datetime import datetime, timezone
from typing import List, Dict, Any
import feedparser
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound

CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config", "sources.json")
HISTORY_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "history.json")


def load_sources() -> List[Dict[str, Any]]:
    """Carrega as fontes configuradas."""
    if not os.path.exists(CONFIG_PATH):
        return []
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def load_history() -> set:
    """Carrega os IDs já processados do histórico."""
    if not os.path.exists(HISTORY_PATH):
        return set()
    try:
        with open(HISTORY_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return set(data.get("processed_ids", []))
    except Exception:
        return set()


def extract_youtube_video_id(entry: Any) -> str:
    """Extrai o ID do vídeo a partir da entrada do feed do YouTube."""
    if hasattr(entry, "yt_videoid"):
        return entry.yt_videoid
    # Fallback via regex no link
    link = getattr(entry, "link", "")
    match = re.search(r"(?:v=|\/embed\/|\/watch\?v=|\/v\/|youtu\.be\/|\/shorts\/)([A-Za-z0-9_-]{11})", link)
    if match:
        return match.group(1)
    return ""


def get_youtube_content(entry: Any, video_id: str) -> str:
    """Obtém a transcrição do vídeo ou faz fallback para título e descrição."""
    title = getattr(entry, "title", "").strip()
    summary = getattr(entry, "summary", "") or ""
    
    # Se media_description existir
    if hasattr(entry, "media_description"):
        summary = entry.media_description

    transcript_text = ""
    if video_id:
        try:
            transcript_list = YouTubeTranscriptApi.get_transcript(
                video_id, languages=["pt", "pt-BR", "en", "es"]
            )
            # Unir falas com limite de segurança para economia de tokens
            transcript_text = " ".join([t.get("text", "") for t in transcript_list])
        except (TranscriptsDisabled, NoTranscriptFound):
            pass
        except Exception:
            pass

    if transcript_text and len(transcript_text.strip()) >= 100:
        return f"Título: {title}\n\nTranscrição:\n{transcript_text[:4000]}"
    
    # Fallback para descrição
    return f"Título: {title}\n\nDescrição:\n{summary}".strip()


def parse_entry_date(entry: Any) -> str:
    """Retorna a data de publicação no padrão ISO 8601 UTC."""
    if hasattr(entry, "published_parsed") and entry.published_parsed:
        dt = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
        return dt.isoformat()
    if hasattr(entry, "updated_parsed") and entry.updated_parsed:
        dt = datetime(*entry.updated_parsed[:6], tzinfo=timezone.utc)
        return dt.isoformat()
    return datetime.now(timezone.utc).isoformat()


def collect_new_items() -> List[Dict[str, Any]]:
    """Coleta novos itens não processados das fontes configuradas."""
    sources = load_sources()
    history = load_history()
    new_items: List[Dict[str, Any]] = []

    for source in sources:
        nome = source.get("nome", "Fonte Desconhecida")
        tipo = source.get("tipo", "rss")
        id_ou_url = source.get("id_ou_url", "")
        categoria = source.get("categoria", "geral")

        if tipo == "youtube":
            # Converte Channel ID para feed XML oficial do YouTube
            feed_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={id_ou_url}"
        else:
            feed_url = id_ou_url

        try:
            feed = feedparser.parse(feed_url)
            if not feed.entries:
                continue

            # Processa até os 5 itens mais recentes de cada fonte por execução
            for entry in feed.entries[:5]:
                # Identificador único (id da entrada ou link)
                item_id = getattr(entry, "id", None) or getattr(entry, "link", None)
                if not item_id:
                    continue

                if item_id in history:
                    continue

                link = getattr(entry, "link", "")
                data_pub = parse_entry_date(entry)

                if tipo == "youtube":
                    video_id = extract_youtube_video_id(entry)
                    raw_content = get_youtube_content(entry, video_id)
                else:
                    title = getattr(entry, "title", "").strip()
                    summary = getattr(entry, "summary", "") or getattr(entry, "description", "") or ""
                    raw_content = f"Título: {title}\n\nConteúdo:\n{summary}".strip()

                # Regra de Economia: Ignora conteúdos menores que 100 caracteres
                if len(raw_content) < 100:
                    continue

                new_items.append({
                    "item_id": item_id,
                    "fonte_nome": nome,
                    "fonte_url": link,
                    "categoria": categoria,
                    "texto_conteudo": raw_content,
                    "data_publicacao": data_pub
                })

        except Exception as e:
            # Resiliência: Não trava o fluxo se uma fonte específica falhar
            print(f"[!] Erro ao coletar da fonte '{nome}': {e}")
            continue

    return new_items
