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


def _eh_video_card(item: Dict[str, Any]) -> bool:
    """Identifica se o card é de formato vídeo (YouTube, canais analíticos ou atributo formato)."""
    if not isinstance(item, dict):
        return False
    if str(item.get("formato") or "").lower() == "video":
        return True
    url = str(item.get("fonte_url") or "").lower()
    if any(k in url for k in ("youtube.com", "youtu.be", "vimeo.com", "dailymotion.com", "twitch.tv", "rumble.com", "odysee.com")):
        return True
    fonte = str(item.get("fonte_nome") or "").lower()
    return "youtube" in fonte


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


def sortir_cards_rodizio_amplo(
    cards: List[Dict[str, Any]],
    max_v2_topo: int = 2,
    max_age_delta_sec: float = 3600.0,
    max_lookahead: int = 5,
    max_v2_age_delta_sec: float = 7200.0,
) -> List[Dict[str, Any]]:
    """
    Aplica sortimento com rodízio amplo de veículos/mídias (contrato RADAR-SORT) com janela limitada de recência:
    - Preserva até `max_v2_topo` destaques Pulso V2 no topo apenas quando dentro de `max_v2_age_delta_sec` do item mais novo.
    - Máximo de 2 cards consecutivos da mesma `fonteKey`.
    - Janela de rodízio amplo `min(3, fontes_distintas_restantes - 1)` limitada a `max_lookahead` e `max_age_delta_sec`.
    """
    if not cards:
        return []

    ordenados = sorted(cards, key=_timestamp_publicacao, reverse=True)
    newest_ts = _timestamp_publicacao(ordenados[0]) if ordenados else 0.0

    top_v2: List[Dict[str, Any]] = []
    pool: List[Dict[str, Any]] = []
    for item in ordenados:
        ts_item = _timestamp_publicacao(item)
        v2_recente = (
            newest_ts == 0.0
            or (ts_item > 0.0 and (newest_ts - ts_item) <= max_v2_age_delta_sec)
        )
        if _eh_destaque_pulso_v2(item) and len(top_v2) < max_v2_topo and v2_recente:
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

        head_ts = _timestamp_publicacao(pool[0])

        def _candidato_elegivel(idx: int, cand: Dict[str, Any]) -> bool:
            if idx == 0:
                return True
            if idx >= max_lookahead:
                return False
            if head_ts == 0.0:
                return True
            cand_ts = _timestamp_publicacao(cand)
            return cand_ts > 0.0 and (head_ts - cand_ts) <= max_age_delta_sec

        window_size = min(3, fontes_distintas - 1)
        janela_recente = set(recentes[-window_size:]) if window_size > 0 else set()

        escolhido_idx: Optional[int] = None

        # 1ª passada: respeita teto consecutivo (<= 2), janela de rodízio amplo e limite de recência
        for idx, cand in enumerate(pool):
            if not _candidato_elegivel(idx, cand):
                break
            fk = normalizar_fonte_key(cand.get("fonte_nome"))
            if consec_count >= 2 and fk == consec_fonte:
                continue
            if fk in janela_recente:
                continue
            escolhido_idx = idx
            break

        # 2ª passada: relaxa janela de rodízio, mantendo teto consecutivo e limite de recência
        if escolhido_idx is None:
            for idx, cand in enumerate(pool):
                if not _candidato_elegivel(idx, cand):
                    break
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


def _ler_feed_arquivo() -> List[Dict[str, Any]]:
    if os.path.exists(FEED_OUTPUT_PATH):
        try:
            with open(FEED_OUTPUT_PATH, "r", encoding="utf-8") as f:
                dados = json.load(f)
            if isinstance(dados, list):
                return [item for item in dados if isinstance(item, dict)]
        except Exception:
            return []
    return []


def _ler_feed_existente() -> List[Dict[str, Any]]:
    if _estado_db_ativo(FEED_OUTPUT_PATH, FEED_OUTPUT_PATH_PADRAO):
        try:
            from src.estado_db import ler_estado

            estado = ler_estado("feed_output")
            if isinstance(estado, list) and len(estado) > 0:
                return [item for item in estado if isinstance(item, dict)]
        except Exception:
            pass

    return _ler_feed_arquivo()


def _gravar_feed_arquivo(feed: List[Dict[str, Any]]) -> None:
    os.makedirs(os.path.dirname(FEED_OUTPUT_PATH), exist_ok=True)
    with open(FEED_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(feed, f, ensure_ascii=False, indent=2)


def _persistir_feed(feed: List[Dict[str, Any]]) -> None:
    if _estado_db_ativo(FEED_OUTPUT_PATH, FEED_OUTPUT_PATH_PADRAO):
        try:
            from src.estado_db import gravar_estado

            gravar_estado("feed_output", feed)
        except Exception:
            pass

    _gravar_feed_arquivo(feed)


def _selecionar_feed_diversificado(
    itens_ordenados: List[Dict[str, Any]],
    max_items: int = 60,
    max_por_fonte: int = 4,
    min_videos_cota: int = 12,
) -> List[Dict[str, Any]]:
    """Mantém até `max_items` cards com teto por veículo, evitando que portais de alto volume expulsem análises/YouTube."""
    if not itens_ordenados or max_items <= 0:
        return []
    selecionados: List[Dict[str, Any]] = []
    indices_usados: set[int] = set()
    contagem_fonte: Dict[str, int] = {}

    # 1. Cota reservada de vídeos: garante até min_videos_cota vídeos de canais analíticos
    videos_adicionados = 0
    for idx, item in enumerate(itens_ordenados):
        if videos_adicionados >= min_videos_cota:
            break
        if _eh_video_card(item):
            fk = normalizar_fonte_key(item.get("fonte_nome"))
            if contagem_fonte.get(fk, 0) < max_por_fonte:
                contagem_fonte[fk] = contagem_fonte.get(fk, 0) + 1
                selecionados.append(item)
                indices_usados.add(idx)
                videos_adicionados += 1

    # 2. Preenchimento regular cronológico respeitando o teto por fonte
    for idx, item in enumerate(itens_ordenados):
        if len(selecionados) >= max_items:
            break
        if idx in indices_usados:
            continue
        fk = normalizar_fonte_key(item.get("fonte_nome"))
        if contagem_fonte.get(fk, 0) >= max_por_fonte:
            continue
        contagem_fonte[fk] = contagem_fonte.get(fk, 0) + 1
        selecionados.append(item)
        indices_usados.add(idx)

    if len(selecionados) < max_items:
        for idx, item in enumerate(itens_ordenados):
            if len(selecionados) >= max_items:
                break
            if idx in indices_usados:
                continue
            selecionados.append(item)

    selecionados.sort(key=_timestamp_publicacao, reverse=True)
    return selecionados


def _mesclar_e_ordenar_feed(
    existing_raw: Any,
    cards: List[Dict[str, Any]],
    max_items: int = 50,
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Mescla novos cards preservando timestamps originais, sem carimbar itens sem data com `now()`."""
    existing_feed: List[Dict[str, Any]] = [
        dict(item) for item in (existing_raw or []) if isinstance(item, dict)
    ]

    for item in existing_feed:
        if not item.get("data_publicacao"):
            item["data_publicacao"] = (
                item.get("published_at")
                or item.get("created_at")
                or item.get("publicado_em")
                or ""
            )

    seen_urls = {item.get("fonte_url") for item in existing_feed if item.get("fonte_url")}
    seen_titles = {normalizar_fonte_key(item.get("titulo")) for item in existing_feed if item.get("titulo")}
    novos_itens: List[Dict[str, Any]] = []

    for card in cards:
        titulo_norm = normalizar_fonte_key(card.get("titulo"))
        fonte_url = card.get("fonte_url")

        if (fonte_url and fonte_url in seen_urls) or (titulo_norm and titulo_norm in seen_titles):
            continue

        data_pub = (
            card.get("data_publicacao")
            or card.get("published_at")
            or card.get("created_at")
            or card.get("publicado_em")
            or ""
        )

        clean_card = {
            "titulo": card.get("titulo"),
            "resumo": card.get("resumo"),
            "analise": card.get("analise"),
            "categoria": card.get("categoria"),
            "fonte_nome": card.get("fonte_nome"),
            "fonte_url": card.get("fonte_url"),
            "data_publicacao": data_pub,
        }

        existing_feed.insert(0, clean_card)
        if clean_card["fonte_url"]:
            seen_urls.add(clean_card["fonte_url"])
        if titulo_norm:
            seen_titles.add(titulo_norm)
        novos_itens.append(clean_card)

    existing_feed.sort(key=_timestamp_publicacao, reverse=True)
    diversificados = _selecionar_feed_diversificado(existing_feed, max_items=max_items, max_por_fonte=4)
    trimmed_feed = sortir_cards_rodizio_amplo(diversificados)
    return trimmed_feed, novos_itens


def _notificar_novos_cards(novos_itens: List[Dict[str, Any]]) -> None:
    for clean_card in novos_itens:
        send_to_webhook(clean_card)
        try:
            from src.notifier import send_discord_webhook, send_telegram_alert
            send_discord_webhook(clean_card)
            send_telegram_alert(clean_card)
        except Exception:
            pass


def publish_cards(cards: List[Dict[str, Any]], max_items: int = 50) -> int:
    """
    Insere novos cards no estado `feed_output` (DB atômico + espelho em arquivo),
    ordena por data mais recente, limita a `max_items` e aplica rodízio amplo.
    """
    if not cards:
        return 0

    novos_capturados: List[Dict[str, Any]] = []
    final_feed: Optional[List[Dict[str, Any]]] = None

    if _estado_db_ativo(FEED_OUTPUT_PATH, FEED_OUTPUT_PATH_PADRAO):
        try:
            from src.estado_db import atualizar_estado, banco_disponivel

            if banco_disponivel():
                def _transformar(atual: Any) -> List[Dict[str, Any]]:
                    novos_capturados.clear()
                    trimmed, novos = _mesclar_e_ordenar_feed(atual, cards, max_items=max_items)
                    novos_capturados.extend(novos)
                    return trimmed

                resultado_db = atualizar_estado(
                    "feed_output",
                    _transformar,
                    default=_ler_feed_arquivo(),
                )
                if isinstance(resultado_db, list):
                    final_feed = resultado_db
                    _gravar_feed_arquivo(final_feed)
        except Exception:
            final_feed = None

    if final_feed is None:
        existing_feed = _ler_feed_existente()
        final_feed, novos_capturados = _mesclar_e_ordenar_feed(existing_feed, cards, max_items=max_items)
        _persistir_feed(final_feed)

    _notificar_novos_cards(novos_capturados)
    return len(novos_capturados)


# ============================================================================
# 8. CARDS DO RADAR & CURADORIA (CONTRATO ADMIN-REBUILD-MODERNO-2026-11)
# ============================================================================

def _eh_card_manual(card: Dict[str, Any]) -> bool:
    """Identifica cards criados manualmente via painel administrativo (`origem_manual` ou slug `manual-*`)."""
    origem = card.get("origem_manual")
    if isinstance(origem, str):
        origem = origem.strip().lower() == "true"
    if bool(origem):
        return True
    return str(card.get("slug") or "").strip().lower().startswith("manual-")


def gerar_slug_card(card: Dict[str, Any]) -> str:
    """Retorna ou gera um slug determinístico e estável para qualquer card do Radar."""
    slug = str(card.get("slug") or "").strip().lower()
    if slug:
        return slug
    tit = str(card.get("titulo") or "").strip()
    if tit:
        texto = unicodedata.normalize("NFD", tit)
        sem_acentos = "".join(ch for ch in texto if unicodedata.category(ch) != "Mn")
        s = re.sub(r"[^a-z0-9]+", "-", sem_acentos.lower()).strip("-")
        if s:
            return s[:80]
    raw_id = str(card.get("id") or card.get("fonte_url") or "")
    if raw_id:
        import hashlib
        return f"card-{hashlib.md5(raw_id.encode('utf-8')).hexdigest()[:10]}"
    return f"card-{os.urandom(4).hex()}"


def _nivel_relevancia_do_card(card: Dict[str, Any]) -> int:
    """Nível de relevância do Radar (1–5). Cards sem nível definido usam o padrão 3 (neutro)."""
    try:
        nivel = int(card.get("nivel_relevancia") or 3)
    except (TypeError, ValueError):
        nivel = 3
    return max(1, min(5, nivel))


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
        "nivel_relevancia": _nivel_relevancia_do_card(card),
        "fixado": bool(card.get("fixado") or int(card.get("urgencia_score") or 0) >= 95),
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


def listar_todos_cards_radar(max_items: int = 100) -> List[Dict[str, Any]]:
    """Lista todos os cards do feed_output (manuais e RSS automáticos), com slugs e metadados normalizados."""
    feed = _ler_feed_existente()
    cards_norm: List[Dict[str, Any]] = []
    for c in feed:
        if not isinstance(c, dict):
            continue
        slug = gerar_slug_card(c)
        data_pub = (
            c.get("data_publicacao")
            or c.get("published_at")
            or c.get("created_at")
            or c.get("publicado_em")
            or ""
        )
        eh_manual = _eh_card_manual(c)
        eh_video = _eh_video_card(c)
        urgencia = int(c.get("urgencia_score") or (80 if eh_manual else 70))
        origem_nome = "manual" if eh_manual else ("video" if eh_video else "rss")
        formato_val = "video" if eh_video else str(c.get("formato") or "materia").lower()
        cards_norm.append({
            "id": str(c.get("id") or f"feed-{slug}"),
            "slug": slug,
            "titulo": str(c.get("titulo") or "").strip(),
            "resumo": str(c.get("resumo") or "").strip(),
            "analise": str(c.get("analise") or c.get("contexto") or c.get("resumo") or "").strip(),
            "categoria": str(c.get("categoria") or "geral").strip().lower(),
            "fonte_nome": str(c.get("fonte_nome") or ("Síntese Manual" if eh_manual else "Radar Editorial")).strip(),
            "fonte_url": str(c.get("fonte_url") or "/radar").strip(),
            "formato": formato_val,
            "data_publicacao": data_pub,
            "urgencia_score": urgencia,
            "nivel_relevancia": _nivel_relevancia_do_card(c),
            "fixado": bool(c.get("fixado") or urgencia >= 95),
            "paises_envolvidos": list(c.get("paises_envolvidos") or ([c.get("pais_regiao")] if c.get("pais_regiao") else [])),
            "palavras_chave": list(c.get("palavras_chave") or []),
            "origem": origem_nome,
            "origem_manual": eh_manual,
            "origem_video": eh_video,
            "origem_v2": False,
        })
    cards_norm.sort(key=_timestamp_publicacao, reverse=True)
    return cards_norm[:max_items]


def publicar_card_manual(card: Dict[str, Any], max_items: int = 50) -> Dict[str, Any]:
    """Grava (upsert por slug) um card manual no feed com persistência no PostgreSQL + fallback arquivo.

    Dispara webhook/notifier após a persistência. Retorna o card normalizado.
    """
    card_normalizado = normalizar_card_manual(card)
    slug = card_normalizado["slug"]

    def _aplicar_upsert(feed_atual: Any) -> List[Dict[str, Any]]:
        lista = [
            dict(c) for c in (feed_atual or [])
            if isinstance(c, dict) and str(c.get("slug") or "").strip().lower() != slug
        ]
        lista.insert(0, card_normalizado)
        lista.sort(key=_timestamp_publicacao, reverse=True)
        return lista[:max_items]

    final_feed: Optional[List[Dict[str, Any]]] = None
    if _estado_db_ativo(FEED_OUTPUT_PATH, FEED_OUTPUT_PATH_PADRAO):
        try:
            from src.estado_db import atualizar_estado, banco_disponivel

            if banco_disponivel():
                res = atualizar_estado("feed_output", _aplicar_upsert, default=_ler_feed_arquivo())
                if isinstance(res, list):
                    final_feed = res
                    _gravar_feed_arquivo(final_feed)
        except Exception:
            final_feed = None

    if final_feed is None:
        final_feed = _aplicar_upsert(_ler_feed_existente())
        _persistir_feed(final_feed)

    send_to_webhook(card_normalizado)
    try:
        from src.notifier import send_discord_webhook, send_telegram_alert

        send_discord_webhook(card_normalizado)
        send_telegram_alert(card_normalizado)
    except Exception:
        pass
    return card_normalizado


def atualizar_card_radar(slug_or_id: str, updates: Dict[str, Any], max_items: int = 100) -> Optional[Dict[str, Any]]:
    """Atualiza campos parciais de qualquer card (manual ou RSS) no feed do Radar por slug ou identificador."""
    alvo = str(slug_or_id or "").strip().lower()

    def _aplicar_update(feed_atual: Any) -> tuple[List[Dict[str, Any]], Optional[Dict[str, Any]], bool]:
        lista = [c for c in (feed_atual or []) if isinstance(c, dict)]
        card_atual: Optional[Dict[str, Any]] = None
        restante: List[Dict[str, Any]] = []
        for c in lista:
            c_slug = gerar_slug_card(c)
            c_id = str(c.get("id") or "").strip().lower()
            if (c_slug == alvo or c_id == alvo or str(c.get("slug") or "").strip().lower() == alvo) and card_atual is None:
                card_atual = dict(c)
            else:
                restante.append(dict(c))
        if card_atual is None:
            return lista, None, False

        mudancas: Dict[str, Any] = {}
        if updates.get("titulo") is not None:
            mudancas["titulo"] = str(updates.get("titulo")).strip()
        if updates.get("resumo") is not None:
            mudancas["resumo"] = str(updates.get("resumo")).strip()
        if updates.get("contexto") is not None:
            mudancas["analise"] = str(updates.get("contexto")).strip()
        elif updates.get("analise") is not None:
            mudancas["analise"] = str(updates.get("analise")).strip()
        if updates.get("categoria") is not None:
            mudancas["categoria"] = str(updates.get("categoria")).strip().lower()
        if updates.get("urgencia_score") is not None:
            mudancas["urgencia_score"] = int(updates.get("urgencia_score"))
        if updates.get("nivel_relevancia") is not None:
            try:
                nivel_relevancia = int(updates.get("nivel_relevancia"))
            except (TypeError, ValueError):
                nivel_relevancia = None
            if nivel_relevancia is not None:
                mudancas["nivel_relevancia"] = max(1, min(5, nivel_relevancia))
        if updates.get("fonte_nome") is not None:
            mudancas["fonte_nome"] = str(updates.get("fonte_nome")).strip()
        if updates.get("fonte_url") is not None:
            mudancas["fonte_url"] = str(updates.get("fonte_url")).strip()
        if updates.get("palavras_chave") is not None:
            mudancas["palavras_chave"] = list(updates.get("palavras_chave") or [])
        if updates.get("paises_envolvidos") is not None:
            mudancas["paises_envolvidos"] = list(updates.get("paises_envolvidos") or [])
        elif updates.get("pais_regiao") is not None:
            p = str(updates.get("pais_regiao")).strip().upper()
            if p:
                mudancas["paises_envolvidos"] = [p]
        if updates.get("data_publicacao") is not None:
            mudancas["data_publicacao"] = str(updates.get("data_publicacao"))
        if "fixado" in updates:
            mudancas["fixado"] = bool(updates.get("fixado"))
            if mudancas["fixado"] and mudancas.get("urgencia_score", 0) < 95:
                mudancas["urgencia_score"] = 99

        card_atual.update(mudancas)
        card_atual["slug"] = alvo
        if "id" not in card_atual:
            card_atual["id"] = f"feed-{alvo}"

        # Se fixado ou urgência alta, vai pro topo absoluto
        if card_atual.get("fixado") or int(card_atual.get("urgencia_score") or 0) >= 95:
            restante.insert(0, card_atual)
        else:
            restante.insert(0, card_atual)
            restante.sort(key=_timestamp_publicacao, reverse=True)

        return restante[:max_items], card_atual, True

    resultado_card: List[Optional[Dict[str, Any]]] = [None]
    persistido = False

    if _estado_db_ativo(FEED_OUTPUT_PATH, FEED_OUTPUT_PATH_PADRAO):
        try:
            from src.estado_db import atualizar_estado, banco_disponivel

            if banco_disponivel():
                def _transformar(atual: Any) -> List[Dict[str, Any]]:
                    novo_feed, card_final, _ = _aplicar_update(atual)
                    resultado_card[0] = card_final
                    return novo_feed

                res = atualizar_estado("feed_output", _transformar, default=_ler_feed_arquivo())
                if isinstance(res, list):
                    persistido = True
                    _gravar_feed_arquivo(res)
        except Exception:
            persistido = False

    if not persistido:
        novo_feed, card_final, mudou = _aplicar_update(_ler_feed_existente())
        resultado_card[0] = card_final
        if mudou:
            _persistir_feed(novo_feed)

    return resultado_card[0]


def atualizar_card_manual(slug: str, updates: Dict[str, Any], max_items: int = 50) -> Optional[Dict[str, Any]]:
    """Atualiza campos parciais de um card manual existente (por slug) no feed (banco + arquivo)."""
    return atualizar_card_radar(slug, updates, max_items=max_items)


def remover_card_radar(slug_or_id: str) -> int:
    """Remove qualquer card (manual ou RSS) do feed pelo slug ou identificador. Retorna a quantidade removida."""
    alvo = str(slug_or_id or "").strip().lower()

    def _aplicar_remocao(feed_atual: Any) -> tuple[List[Dict[str, Any]], int]:
        restante: List[Dict[str, Any]] = []
        removidos = 0
        for c in (feed_atual or []):
            if not isinstance(c, dict):
                continue
            c_slug = gerar_slug_card(c)
            c_id = str(c.get("id") or "").strip().lower()
            if c_slug == alvo or c_id == alvo or str(c.get("slug") or "").strip().lower() == alvo:
                removidos += 1
                continue
            restante.append(dict(c))
        return restante, removidos

    removidos_total = [0]
    persistido = False

    if _estado_db_ativo(FEED_OUTPUT_PATH, FEED_OUTPUT_PATH_PADRAO):
        try:
            from src.estado_db import atualizar_estado, banco_disponivel

            if banco_disponivel():
                def _transformar(atual: Any) -> List[Dict[str, Any]]:
                    restante, rem = _aplicar_remocao(atual)
                    removidos_total[0] = rem
                    return restante

                res = atualizar_estado("feed_output", _transformar, default=_ler_feed_arquivo())
                if isinstance(res, list):
                    persistido = True
                    if removidos_total[0]:
                        _gravar_feed_arquivo(res)
        except Exception:
            persistido = False

    if not persistido:
        restante, rem = _aplicar_remocao(_ler_feed_existente())
        removidos_total[0] = rem
        if rem:
            _persistir_feed(restante)

    return removidos_total[0]


def remover_card_manual(slug: str) -> int:
    """Remove cards manuais do feed pelo slug (banco + arquivo). Retorna a quantidade removida."""
    return remover_card_radar(slug)


def fixar_card_radar(slug_or_id: str, fixar: bool = True) -> Optional[Dict[str, Any]]:
    """Fixa ou desafixa um card no topo do Radar."""
    updates = {
        "fixado": fixar,
        "urgencia_score": 99 if fixar else 70,
    }
    return atualizar_card_radar(slug_or_id, updates)
