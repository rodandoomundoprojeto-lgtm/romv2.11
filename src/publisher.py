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

FEED_OUTPUT_PATH_PADRAO = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "feed_output.json")
HISTORY_PATH_PADRAO = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "history.json")
FEED_OUTPUT_PATH = FEED_OUTPUT_PATH_PADRAO
HISTORY_PATH = HISTORY_PATH_PADRAO


def _estado_db_ativo(caminho_atual: str, caminho_padrao: str) -> bool:
    """Só espelha no banco o caminho canônico de produção.

    Testes e execuções ad-hoc trocam ``FEED_OUTPUT_PATH``/``HISTORY_PATH`` por
    caminhos temporários; nesses casos o comportamento continua 100% em arquivo.
    """
    return os.path.abspath(caminho_atual) == os.path.abspath(caminho_padrao)


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


def _ler_history_arquivo() -> Dict[str, Any]:
    if not os.path.exists(HISTORY_PATH):
        return {"processed_ids": []}
    try:
        with open(HISTORY_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {"processed_ids": []}


def _unir_history(dados: Any, novos_ids: List[str]) -> Dict[str, Any]:
    """Une IDs preservando a ordem de chegada e sem descartar histórico."""
    existentes: List[str] = []
    if isinstance(dados, dict) and isinstance(dados.get("processed_ids"), list):
        existentes = [str(item) for item in dados["processed_ids"] if item]

    vistos = set(existentes)
    for item in novos_ids:
        if not item:
            continue
        item = str(item)
        if item not in vistos:
            vistos.add(item)
            existentes.append(item)

    # Mantém os últimos 2000 IDs para evitar crescimento descontrolado
    return {"processed_ids": existentes[-2000:]}


def _gravar_history_arquivo(dados: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(HISTORY_PATH), exist_ok=True)
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)


def update_history(processed_ids: List[str]) -> None:
    """Registra novos IDs no histórico (banco primeiro, arquivo como espelho).

    A união é feita dentro de uma transação com ``SELECT ... FOR UPDATE`` quando
    o banco está disponível, então dois ciclos concorrentes não perdem IDs.
    """
    if not processed_ids:
        return

    ids = [str(item) for item in processed_ids if item]
    final: Optional[Dict[str, Any]] = None

    if _estado_db_ativo(HISTORY_PATH, HISTORY_PATH_PADRAO):
        try:
            from src.estado_db import atualizar_estado

            ids_arquivo = _unir_history(_ler_history_arquivo(), []).get("processed_ids", [])

            def _transformar(atual: Any) -> Dict[str, Any]:
                base = _unir_history(atual, ids_arquivo)
                return _unir_history(base, ids)

            final = atualizar_estado(
                "history",
                _transformar,
                default={"processed_ids": []},
            )
        except Exception:
            final = None

    if not isinstance(final, dict):
        final = _unir_history(_ler_history_arquivo(), ids)

    _gravar_history_arquivo(final)


def _mesclar_lista_feed(base: List[Dict[str, Any]], adicionais: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Une dois feeds preservando a ordem e removendo duplicatas por URL/título."""
    resultado = [dict(item) for item in base if isinstance(item, dict)]
    urls = {item.get("fonte_url") for item in resultado if item.get("fonte_url")}
    titulos = {
        normalizar_fonte_key(item.get("titulo"))
        for item in resultado
        if item.get("titulo")
    }

    for item in adicionais:
        if not isinstance(item, dict):
            continue
        url = item.get("fonte_url")
        titulo = normalizar_fonte_key(item.get("titulo")) if item.get("titulo") else ""
        if (url and url in urls) or (titulo and titulo in titulos):
            continue
        resultado.append(item)
        if url:
            urls.add(url)
        if titulo:
            titulos.add(titulo)

    return resultado


def _ler_feed_existente() -> List[Dict[str, Any]]:
    itens_db: List[Dict[str, Any]] = []
    if _estado_db_ativo(FEED_OUTPUT_PATH, FEED_OUTPUT_PATH_PADRAO):
        try:
            from src.estado_db import ler_estado

            estado = ler_estado("feed_output")
            if isinstance(estado, list):
                itens_db = [item for item in estado if isinstance(item, dict)]
        except Exception:
            itens_db = []

    itens_arquivo: List[Dict[str, Any]] = []
    if os.path.exists(FEED_OUTPUT_PATH):
        try:
            with open(FEED_OUTPUT_PATH, "r", encoding="utf-8") as f:
                dados = json.load(f)
            if isinstance(dados, list):
                itens_arquivo = [item for item in dados if isinstance(item, dict)]
        except Exception:
            itens_arquivo = []

    if itens_db:
        return _mesclar_lista_feed(itens_db, itens_arquivo)
    return itens_arquivo


def _persistir_feed(feed: List[Dict[str, Any]]) -> None:
    if _estado_db_ativo(FEED_OUTPUT_PATH, FEED_OUTPUT_PATH_PADRAO):
        try:
            from src.estado_db import gravar_estado

            gravar_estado("feed_output", feed)
        except Exception:
            pass

    os.makedirs(os.path.dirname(FEED_OUTPUT_PATH), exist_ok=True)
    with open(FEED_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(feed, f, ensure_ascii=False, indent=2)


def publish_cards(cards: List[Dict[str, Any]], max_items: int = 50) -> int:
    """
    Insere novos cards no data/feed_output.json, ordena por data mais recente
    e limita a `max_items`.
    """
    if not cards:
        return 0

    existing_feed: List[Dict[str, Any]] = _ler_feed_existente()

    # Mescla evitando duplicação por fonte_url ou título normalizado
    seen_urls = {item.get("fonte_url") for item in existing_feed if item.get("fonte_url")}
    seen_titles = {normalizar_fonte_key(item.get("titulo")) for item in existing_feed if item.get("titulo")}
    novos_publicados = 0
    agora_iso = datetime.now(timezone.utc).isoformat()

    # Garante que itens pré-existentes preservem data_publicacao consistente
    for item in existing_feed:
        if not item.get("data_publicacao"):
            item["data_publicacao"] = (
                item.get("published_at")
                or item.get("created_at")
                or item.get("publicado_em")
                or agora_iso
            )

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

    _persistir_feed(trimmed_feed)

    return novos_publicados


# ============================================================================
# 8. CARDS MANUAIS DO RADAR (CONTRATO ADMIN-REBUILD-MODERNO-2026-11)
# ============================================================================

def _eh_card_manual(card: Dict[str, Any]) -> bool:
    """Identifica cards criados manualmente via painel administrativo (`origem_manual` ou slug `manual-*`)."""
    origem = card.get("origem_manual")
    if isinstance(origem, str):
        origem = origem.strip().lower() == "true"
    if bool(origem):
        return True
    return str(card.get("slug") or "").strip().lower().startswith("manual-")


def normalizar_card_manual(card: Dict[str, Any]) -> Dict[str, Any]:
    """Normaliza um card manual (origem administrativa) para o contrato do Radar.

    Campos de entrada aceitos: `slug?`, `titulo`, `resumo`, `contexto` (analise),
    `categoria?`, `urgencia_score?`, `fonte_nome?`, `fonte_url?`, `pais_regiao?`,
    `coordenadas_geojson?`, `data_publicacao?`, `origem_manual?`.
    """
    agora_iso = datetime.now(timezone.utc).isoformat()
    slug = str(card.get("slug") or "").strip().lower()
    if not slug:
        slug = f"manual-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{os.urandom(3).hex()}"

    return {
        "id": str(card.get("id") or f"manual-{slug}"),
        "slug": slug,
        "titulo": str(card.get("titulo") or "").strip(),
        "resumo": str(card.get("resumo") or "").strip(),
        "analise": str(card.get("analise") or card.get("contexto") or card.get("resumo") or "").strip(),
        "categoria": str(card.get("categoria") or "geral").strip().lower(),
        "fonte_nome": str(card.get("fonte_nome") or "Síntese Rodando o Mundo · Pulso V2").strip(),
        "fonte_url": str(card.get("fonte_url") or "/radar").strip(),
        "data_publicacao": str(card.get("data_publicacao") or card.get("publicado_em") or card.get("created_at") or agora_iso),
        "urgencia_score": int(card.get("urgencia_score") or 80),
        "paises_envolvidos": [
            str(p).strip().upper()
            for p in (card.get("paises_envolvidos") or [card.get("pais_regiao") or "BR"]) or []
            if str(p).strip()
        ],
        "palavras_chave": [
            str(k).strip().lower()
            for k in (card.get("palavras_chave") or []) or []
            if str(k).strip()
        ],
        "origem_v2": False,
        "origem_manual": True,
    }


def listar_cards_manuais() -> List[Dict[str, Any]]:
    """Lista os cards manuais do Radar (banco via `src.estado_db` preferido, arquivo fallback)."""
    feed = _ler_feed_existente()
    manuais = [c for c in feed if isinstance(c, dict) and _eh_card_manual(c)]
    manuais.sort(key=_timestamp_publicacao, reverse=True)
    return manuais


def publicar_card_manual(card: Dict[str, Any]) -> Dict[str, Any]:
    """Grava (upsert por slug) um card manual no feed com persistência no PostgreSQL + fallback arquivo.

    Dispara webhook/notifier após a persistência. Retorna o card normalizado.
    """
    card_normalizado = normalizar_card_manual(card)
    feed = _ler_feed_existente()
    slug = card_normalizado["slug"]
    feed = [
        c for c in feed
        if not (isinstance(c, dict) and str(c.get("slug") or "").strip().lower() == slug)
    ]
    feed.insert(0, card_normalizado)
    _persistir_feed(feed)

    send_to_webhook(card_normalizado)
    try:
        from src.notifier import send_discord_webhook, send_telegram_alert

        send_discord_webhook(card_normalizado)
        send_telegram_alert(card_normalizado)
    except Exception:
        pass
    return card_normalizado


def atualizar_card_manual(slug: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Atualiza campos parciais de um card manual existente (por slug) no feed (banco + arquivo)."""
    alvo = str(slug or "").strip().lower()
    feed = _ler_feed_existente()
    card_atual: Optional[Dict[str, Any]] = None
    restante: List[Dict[str, Any]] = []
    for c in feed:
        if not isinstance(c, dict):
            restante.append(c)
            continue
        if str(c.get("slug") or "").strip().lower() == alvo and _eh_card_manual(c):
            card_atual = dict(c)
        else:
            restante.append(c)

    if card_atual is None:
        return None

    mudancas: Dict[str, Any] = {}
    if updates.get("titulo") is not None:
        mudancas["titulo"] = str(updates.get("titulo"))
    if updates.get("resumo") is not None:
        mudancas["resumo"] = str(updates.get("resumo"))
    if updates.get("contexto") is not None:
        mudancas["analise"] = str(updates.get("contexto"))
    if updates.get("categoria") is not None:
        mudancas["categoria"] = str(updates.get("categoria"))
    if updates.get("urgencia_score") is not None:
        mudancas["urgencia_score"] = int(updates.get("urgencia_score"))
    if updates.get("fonte_nome") is not None:
        mudancas["fonte_nome"] = str(updates.get("fonte_nome"))
    if updates.get("fonte_url") is not None:
        mudancas["fonte_url"] = str(updates.get("fonte_url"))
    if updates.get("palavras_chave") is not None:
        mudancas["palavras_chave"] = list(updates.get("palavras_chave") or [])
    if updates.get("data_publicacao") is not None:
        mudancas["data_publicacao"] = str(updates.get("data_publicacao"))

    if not mudancas:
        return card_atual

    card_atual.update(mudancas)
    card_final = normalizar_card_manual(card_atual)
    card_final["slug"] = alvo
    restante = [
        c for c in restante
        if not (isinstance(c, dict) and str(c.get("slug") or "").strip().lower() == alvo)
    ]
    restante.insert(0, card_final)
    _persistir_feed(restante)
    return card_final


def remover_card_manual(slug: str) -> int:
    """Remove cards manuais do feed pelo slug (banco + arquivo). Retorna a quantidade removida."""
    alvo = str(slug or "").strip().lower()
    feed = _ler_feed_existente()
    restante: List[Dict[str, Any]] = []
    removidos = 0
    for c in feed:
        if (
            isinstance(c, dict)
            and str(c.get("slug") or "").strip().lower() == alvo
            and _eh_card_manual(c)
        ):
            removidos += 1
            continue
        restante.append(c)
    if removidos:
        _persistir_feed(restante)
    return removidos
