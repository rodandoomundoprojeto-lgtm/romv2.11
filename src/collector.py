"""
Módulo de Coleta: Lê config/sources.json, processa RSS e YouTube, e extrai textos/legendas.
"""
import calendar
import email.utils
import json
import os
import re
import time
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
    """Carrega os IDs já processados do histórico (banco + arquivo).

    A leitura é a união das duas fontes para nunca perder deduplicação durante a
    migração. Se o banco não estiver configurado, o arquivo continua mandando.
    """
    ids: set = set()

    try:
        from src.estado_db import ler_estado

        estado = ler_estado("history")
        if isinstance(estado, dict):
            ids.update(str(item) for item in estado.get("processed_ids", []) if item)
    except Exception:
        pass

    if os.path.exists(HISTORY_PATH):
        try:
            with open(HISTORY_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
            ids.update(str(item) for item in data.get("processed_ids", []) if item)
        except Exception:
            pass

    return ids


def _get_field(obj: Any, field: str, default: Any = None) -> Any:
    """Acessa um atributo ou chave de dicionário de forma segura."""
    if isinstance(obj, dict):
        val = obj.get(field)
        if val is not None:
            return val
    try:
        return getattr(obj, field, default)
    except Exception:
        return default


def extract_youtube_video_id(entry: Any) -> str:
    """Extrai o ID do vídeo a partir da entrada do feed do YouTube."""
    yt_vid = _get_field(entry, "yt_videoid")
    if yt_vid and isinstance(yt_vid, str) and re.fullmatch(r"[A-Za-z0-9_-]{11}", yt_vid.strip()):
        return yt_vid.strip()

    # Se id for no formato canônico do YouTube: yt:video:ID
    item_id = _get_field(entry, "id")
    if isinstance(item_id, str) and item_id.strip().startswith("yt:video:"):
        vid = item_id.strip().removeprefix("yt:video:").strip()
        if re.fullmatch(r"[A-Za-z0-9_-]{11}", vid):
            return vid

    # Fallback via regex no link (suporta watch, youtu.be, shorts, embed, live)
    link = str(_get_field(entry, "link") or "").strip()
    if not link:
        return ""
    match = re.search(r"(?:v=|\/embed\/|\/watch\?v=|\/v\/|youtu\.be\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})", link)
    if match:
        return match.group(1)
    return ""


def get_youtube_content(entry: Any, video_id: str) -> str:
    """Obtém a transcrição do vídeo ou faz fallback para título e descrição."""
    title = str(_get_field(entry, "title") or "").strip()
    summary = str(_get_field(entry, "summary") or _get_field(entry, "description") or "").strip()

    # Se media_description existir
    media_desc = _get_field(entry, "media_description")
    if media_desc and str(media_desc).strip():
        summary = str(media_desc).strip()

    transcript_text = ""
    if video_id:
        try:
            if hasattr(YouTubeTranscriptApi, "get_transcript"):
                transcript_list = YouTubeTranscriptApi.get_transcript(
                    video_id, languages=["pt", "pt-BR", "en", "es"]
                )
            else:
                transcript_list = YouTubeTranscriptApi().fetch(
                    video_id, languages=["pt", "pt-BR", "en", "es"]
                )
            # Unir falas com limite de segurança para economia de tokens
            falas = []
            for t in transcript_list:
                texto = t.get("text") if isinstance(t, dict) else getattr(t, "text", str(t))
                if texto:
                    falas.append(str(texto))
            transcript_text = " ".join(falas)
        except (TranscriptsDisabled, NoTranscriptFound):
            pass
        except Exception:
            pass

    if transcript_text and len(transcript_text.strip()) >= 100:
        return f"Título: {title}\n\nTranscrição:\n{transcript_text[:4000]}"

    # Fallback para descrição
    return f"Título: {title}\n\nDescrição:\n{summary}".strip()


def parse_entry_date(entry: Any) -> str:
    """Retorna a data de publicação no padrão ISO 8601 UTC ou string vazia se ausente/inválida."""
    for field in ("published_parsed", "updated_parsed"):
        parsed = _get_field(entry, field)
        if not parsed:
            continue
        try:
            if isinstance(parsed, (tuple, time.struct_time)):
                seq = tuple(parsed)
                if len(seq) >= 6:
                    if len(seq) < 9:
                        seq = seq + (0,) * (9 - len(seq))
                    ts = calendar.timegm(seq[:9])
                    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
        except Exception:
            pass

    for date_field in ("published", "updated", "data_publicacao", "pubDate"):
        raw_str = _get_field(entry, date_field)
        if not isinstance(raw_str, str) or not raw_str.strip():
            continue
        texto = raw_str.strip()
        try:
            dt = datetime.fromisoformat(texto.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc).isoformat()
        except Exception:
            pass
        try:
            dt = email.utils.parsedate_to_datetime(texto)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc).isoformat()
        except Exception:
            pass

    return ""


def _entry_sort_timestamp(entry: Any) -> float:
    """Converte a data da entrada para timestamp numérico UTC (0.0 se ausente)."""
    iso_pub = parse_entry_date(entry)
    if not iso_pub:
        return 0.0
    try:
        dt = datetime.fromisoformat(iso_pub.replace("Z", "+00:00"))
        return dt.timestamp()
    except Exception:
        return 0.0


def collect_new_items() -> List[Dict[str, Any]]:
    """Coleta novos itens não processados das fontes configuradas."""
    sources = load_sources()
    history = load_history()
    new_items: List[Dict[str, Any]] = []

    for source in sources:
        nome = str(source.get("nome", "Fonte Desconhecida")).strip()
        tipo = str(source.get("tipo", "rss")).strip().lower()
        id_ou_url = str(source.get("id_ou_url", "")).strip()
        categoria = str(source.get("categoria", "geral")).strip()

        if tipo == "youtube":
            # Converte Channel ID para feed XML oficial do YouTube (suporta ID puro ou URL completa)
            if id_ou_url.startswith("http://") or id_ou_url.startswith("https://"):
                feed_url = id_ou_url
            else:
                feed_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={id_ou_url}"
        else:
            feed_url = id_ou_url

        try:
            feed = feedparser.parse(feed_url)
            if not feed.entries:
                continue

            # Ordena todas as entradas por data de publicação decrescente antes de fatiar [:5]
            entries_ordenadas = sorted(feed.entries, key=_entry_sort_timestamp, reverse=True)
            for entry in entries_ordenadas[:5]:
                # Identificador único (id da entrada ou link)
                item_id = _get_field(entry, "id") or _get_field(entry, "link")
                if not item_id:
                    continue

                if item_id in history:
                    continue

                link = str(_get_field(entry, "link") or "").strip()
                data_pub = parse_entry_date(entry)

                if tipo == "youtube":
                    video_id = extract_youtube_video_id(entry)
                    raw_content = get_youtube_content(entry, video_id)
                else:
                    title = str(_get_field(entry, "title") or "").strip()
                    summary = str(_get_field(entry, "summary") or _get_field(entry, "description") or "").strip()
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
