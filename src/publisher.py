"""
Módulo de Publicação: Atualiza o feed de saída (data/feed_output.json),
grava o histórico (data/history.json) e dispara webhooks externos opcionais.
"""
import json
import os
import re
import unicodedata
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import requests

FEED_OUTPUT_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "feed_output.json")
HISTORY_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "history.json")


def normalizar_fonte_key(fonte_nome: Optional[str]) -> str:
    """Normaliza o nome do veículo para chave comparável (lowercase, sem acentos, espaços colapsados)."""
    texto = unicodedata.normalize("NFD", str(fonte_nome or ""))
    sem_acentos = "".join(ch for ch in texto if unicodedata.category(ch) != "Mn")
    limpo = re.sub(r"\s+", " ", sem_acentos).strip().lower()
    return limpo or "desconhecida"


def _eh_destaque_pulso_v2(item: Dict[str, Any]) -> bool:
    """Identifica cards de síntese própria Pulso V2."""
    if item.get("origem_v2") is True:
        return True
    return "pulso v2" in normalizar_fonte_key(item.get("fonte_nome"))


def _timestamp_publicacao(item: Dict[str, Any]) -> float:
    """Extrai timestamp numérico de data_publicacao ISO-8601 para ordenação decrescente."""
    raw = str(item.get("data_publicacao") or "").strip()
    if not raw:
        return 0.0
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return dt.timestamp()
    except Exception:
        return 0.0


def sortir_cards_rodizio_amplo(cards: List[Dict[str, Any]], max_v2_topo: int = 2) -> List[Dict[str, Any]]:
    """
    Aplica sortimento com rodízio amplo de veículos/mídias (contrato RADAR-SORT):
    - Preserva até `max_v2_topo` destaques Pulso V2 no topo; excedentes entram no pool geral.
    - Máximo de 2 cards consecutivos da mesma `fonteKey`.
    - Janela de rodízio amplo `min(3, fontes_distintas_restantes - 1)` com relaxamento progressivo.
    """
    if not cards:
        return []

    ordenados = sorted(cards, key=_timestamp_publicacao, reverse=True)

    top_v2: List[Dict[str, Any]] = []
    pool: List[Dict[str, Any]] = []
    for item in ordenados:
        if _eh_destaque_pulso_v2(item) and len(top_v2) < max_v2_topo:
            top_v2.append(item)
        else:
            pool.append(item)

    resultado: List[Dict[str, Any]] = list(top_v2)
    recentes: List[str] = []
    consec_fonte: Optional[str] = None
    consec_count = 0

    for item in top_v2:
        fk = normalizar_fonte_key(item.get("fonte_nome"))
        recentes.append(fk)
        if fk == consec_fonte:
            consec_count += 1
        else:
            consec_fonte = fk
            consec_count = 1

    while pool:
        fontes_distintas = len({normalizar_fonte_key(it.get("fonte_nome")) for it in pool})
        if fontes_distintas <= 1:
            resultado.extend(pool)
            break

        window_size = min(3, fontes_distintas - 1)
        janela_recente = set(recentes[-window_size:]) if window_size > 0 else set()

        escolhido_idx: Optional[int] = None

        # 1ª passada: respeita teto consecutivo (<= 2) e janela de rodízio amplo
        for idx, cand in enumerate(pool):
            fk = normalizar_fonte_key(cand.get("fonte_nome"))
            if consec_count >= 2 and fk == consec_fonte:
                continue
            if fk in janela_recente:
                continue
            escolhido_idx = idx
            break

        # 2ª passada: relaxa janela de rodízio, mantendo teto consecutivo
        if escolhido_idx is None:
            for idx, cand in enumerate(pool):
                fk = normalizar_fonte_key(cand.get("fonte_nome"))
                if consec_count >= 2 and fk == consec_fonte:
                    continue
                escolhido_idx = idx
                break

        # 3ª passada (esgotamento): pega o item mais recente disponível
        if escolhido_idx is None:
            escolhido_idx = 0

        escolhido = pool.pop(escolhido_idx)
        fk_escolhido = normalizar_fonte_key(escolhido.get("fonte_nome"))
        resultado.append(escolhido)
        recentes.append(fk_escolhido)
        if fk_escolhido == consec_fonte:
            consec_count += 1
        else:
            consec_fonte = fk_escolhido
            consec_count = 1

    return resultado


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

    # Mescla evitando duplicação por fonte_url ou título normalizado
    seen_urls = {item.get("fonte_url") for item in existing_feed if item.get("fonte_url")}
    seen_titles = {normalizar_fonte_key(item.get("titulo")) for item in existing_feed if item.get("titulo")}
    novos_publicados = 0
    agora_iso = datetime.now(timezone.utc).isoformat()

    for card in cards:
        titulo_norm = normalizar_fonte_key(card.get("titulo"))
        fonte_url = card.get("fonte_url")

        # Se já existe no feed, preserva o card original com seu timestamp inalterado
        if (fonte_url and fonte_url in seen_urls) or (titulo_norm and titulo_norm in seen_titles):
            continue

        # Garante data_publicacao consistente para quando o item ingressou na cobertura
        data_pub = (
            card.get("data_publicacao")
            or card.get("published_at")
            or card.get("created_at")
            or agora_iso
        )

        # Prepara objeto limpo sem campos de controle interno
        clean_card = {
            "titulo": card.get("titulo"),
            "resumo": card.get("resumo"),
            "analise": card.get("analise"),
            "categoria": card.get("categoria"),
            "fonte_nome": card.get("fonte_nome"),
            "fonte_url": card.get("fonte_url"),
            "data_publicacao": data_pub
        }

        existing_feed.insert(0, clean_card)
        if clean_card["fonte_url"]:
            seen_urls.add(clean_card["fonte_url"])
        if titulo_norm:
            seen_titles.add(titulo_norm)
        novos_publicados += 1

        # Disparo opcional de webhook para cada card novo
        send_to_webhook(clean_card)
        try:
            from src.notifier import send_discord_webhook, send_telegram_alert
            send_discord_webhook(clean_card)
            send_telegram_alert(clean_card)
        except Exception:
            pass

    # Ordena decrescente por data de publicação, limita aos últimos N itens e aplica rodízio amplo
    existing_feed.sort(key=_timestamp_publicacao, reverse=True)
    trimmed_feed = sortir_cards_rodizio_amplo(existing_feed[:max_items])

    with open(FEED_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(trimmed_feed, f, ensure_ascii=False, indent=2)

    return novos_publicados
