"""
Orquestrador Principal: Radar de Notícias & Briefing Editorial
Fluxo: Coleta -> Filtro -> Análise IA -> Publicação -> Histórico
"""
import sys
import time
from dotenv import load_dotenv

# Carrega variáveis do arquivo .env local se existir
load_dotenv()

from src.collector import collect_new_items
from src.analyst import analyze_item
from src.publisher import publish_cards, update_history


def run_pipeline():
    print("=" * 65)
    print("🚀 INICIANDO RADAR DE NOTÍCIAS & BRIEFING EDITORIAL")
    print("=" * 65)

    start_time = time.time()

    # 1. Coleta
    print("\n[1/4] Coletando feeds RSS e canais do YouTube...")
    new_items = collect_new_items()
    print(f"      -> {len(new_items)} novo(s) item(ns) encontrado(s) para análise.")

    if not new_items:
        print("\n✅ Nenhum item inédito para processar. Pipeline finalizado com economia de API.")
        return

    # 2. Análise com Gemini
    print("\n[2/4] Enviando conteúdos para inteligência editorial (Gemini)...")
    valid_cards = []
    processed_ids = []

    for idx, item in enumerate(new_items, start=1):
        fonte = item.get("fonte_nome")
        cat = item.get("categoria")
        print(f"      [{idx}/{len(new_items)}] Analisando: {fonte} [{cat}]...")

        result = analyze_item(item)
        processed_ids.append(item.get("item_id"))

        if not result:
            print("          ⚠️ Falha ou erro na resposta da IA. Pulando.")
            time.sleep(4)
            continue

        if result.get("duplicado") is True:
            print("          🔁 Descartado por duplicação semântica recente.")
            time.sleep(4)
            continue

        valid_cards.append(result)
        print(f"          ✨ Aprovado: \"{result.get('titulo')}\"")
        time.sleep(4)  # Respeita o limite do Free Tier (15 req/min = 1 a cada 4s)

    # 3. Publicação e Webhook
    print(f"\n[3/4] Publicando {len(valid_cards)} card(s) aprovado(s)...")
    novos_publicados = publish_cards(valid_cards, max_items=50)
    print(f"      -> {novos_publicados} card(s) gravado(s) em data/feed_output.json.")

    # 4. Atualização de Histórico
    print("\n[4/4] Atualizando histórico de IDs processados...")
    update_history(processed_ids)
    print(f"      -> {len(processed_ids)} ID(s) marcado(s) como visto(s).")

    elapsed = round(time.time() - start_time, 2)
    print("\n" + "=" * 65)
    print(f"🎉 CICLO CONCLUÍDO EM {elapsed}s | Publicados: {novos_publicados} | Ignorados: {len(processed_ids) - len(valid_cards)}")
    print("=" * 65)


if __name__ == "__main__":
    run_pipeline()
