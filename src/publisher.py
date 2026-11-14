"""
Módulo de Publicação: Atualiza o feed de saída (data/feed_output.json),
grava o histórico (data/history.json) e dispara webhooks externos opcionais.
"""
import json
import os
from typing import List, Dict, Any, Optional
import requests

FEED_OUTPUT_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "feed_output.json")
HISTORY_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "history.json")


def send_to_webhook(payload: Dict[str, Any], webhook_url: Optional[str] = None) -> bool:
    """Dispara o novo card para uma URL externa configurada (Discord, Telegram, API, etc.)."""
    url = webhook_url or os.getenv("WEBHOOK_URL")
    if not url:
        return False
    try:
        resp = requests.post(url, json=payload, timeout=10)
        return resp.status_code in [200, 201, 204]
    except Exception as e:
        print(f"[!] Falha no webhook para '{url}': {e}")
        return False


def update_history(processed_ids: List[str]) -> None:
    """Registra novos IDs no histórico para não processar novamente."""
    if not processed_ids:
        return
    existing = set()
    if os.path.exists(HISTORY_PATH):
        try:
            with open(HISTORY_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                existing = set(data.get("processed_ids", []))
        except Exception:
            existing = set()

    existing.update(processed_ids)

    # Mantém os últimos 2000 IDs para evitar crescimento descontrolado
    updated_list = list(existing)[-2000:]

    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump({"processed_ids": updated_list}, f, ensure_ascii=False, indent=2)


def publish_cards(cards: List[Dict[str, Any]], max_items: int = 50) -> int:
    """
    Insere novos cards no data/feed_output.json, ordena por data mais recente
    e limita a `max_items`.
    """
    if not cards:
        return 0

    existing_feed: List[Dict[str, Any]] = []
    if os.path.exists(FEED_OUTPUT_PATH):
        try:
            with open(FEED_OUTPUT_PATH, "r", encoding="utf-8") as f:
                existing_feed = json.load(f)
        except Exception:
            existing_feed = []

    # Mescla evitando duplicação por fonte_url ou título
    seen_urls = {item.get("fonte_url") for item in existing_feed if item.get("fonte_url")}
    novos_publicados = 0

    for card in cards:
        # Prepara objeto limpo sem campos de controle interno
        clean_card = {
            "titulo": card.get("titulo"),
            "resumo": card.get("resumo"),
            "analise": card.get("analise"),
            "categoria": card.get("categoria"),
            "fonte_nome": card.get("fonte_nome"),
            "fonte_url": card.get("fonte_url"),
            "data_publicacao": card.get("data_publicacao")
        }

        if clean_card["fonte_url"] not in seen_urls:
            existing_feed.insert(0, clean_card)
            seen_urls.add(clean_card["fonte_url"])
            novos_publicados += 1

            # Disparo opcional de webhook para cada card novo
            send_to_webhook(clean_card)
            try:
                from src.notifier import send_discord_webhook, send_telegram_alert
                send_discord_webhook(clean_card)
                send_telegram_alert(clean_card)
            except Exception:
                pass

    # Ordena decrescente por data de publicação
    def sort_key(item: Dict[str, Any]) -> str:
        return item.get("data_publicacao") or ""

    existing_feed.sort(key=sort_key, reverse=True)

    # Limita aos últimos N itens
    trimmed_feed = existing_feed[:max_items]

    with open(FEED_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(trimmed_feed, f, ensure_ascii=False, indent=2)

    return novos_publicados
