"""
Orquestrador Principal: Radar de Notícias & Briefing Editorial + API FastAPI (Motor V2)
Fluxo CLI: Coleta -> Filtro -> Análise IA -> Publicação -> Histórico
Fluxo API: uvicorn main:app --reload --port 8000 (inclui rotas V1/V2 de api.routes_v2)
"""
import sys
import time
from dotenv import load_dotenv

# Carrega variáveis do arquivo .env local se existir
load_dotenv()

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

from api.routes_v2 import router as router_v2
from api.routes_dossies import router as router_dossies
from redacao_v2.pulso_noticias_quentes import registrar_auditoria_execucao
from src.collector import collect_new_items
from src.analyst import analyze_item
from src.estado_db import obter_database_url
from src.publisher import publish_cards, update_history
import psycopg

app = FastAPI(
    title="API Rodando o Mundo — Motor Editorial V2 & Pulso 30m",
    version="2.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://www.rodandoomundo.com.br",
        "https://rodandoomundo.com.br",
        "http://localhost:3000",
        "http://localhost:5500",
        "http://localhost:8000",
        "http://localhost:8080",
        "http://127.0.0.1:5500",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(router_v2)
app.include_router(router_dossies)


@app.get("/health")
def health():
    return {"ok": True, "motor": "v2.2"}


@app.get("/admin", include_in_schema=False)
@app.get("/admin/", include_in_schema=False)
def admin_lite_page():
    admin_html = Path(__file__).resolve().parent / "admin" / "index.html"
    if admin_html.is_file():
        return FileResponse(admin_html)
    return Response(status_code=404)



def _registrar_falha_auditoria_ciclo(db_url: str, erro: str) -> None:
    """Auditoria obrigatória em falhas do ciclo editorial (pipeline nunca silencioso)."""
    if not db_url:
        return
    try:
        with psycopg.connect(db_url, connect_timeout=5, prepare_threshold=None) as conn:
            registrar_auditoria_execucao(
                conn,
                job_nome="ciclo_completo_radar",
                recurso_chave="ciclo_completo_radar",
                status="falha",
                erro_detalhe=str(erro)[:500],
            )
    except Exception:
        pass


def run_pipeline():
    print("=" * 65)
    print("🚀 INICIANDO RADAR DE NOTÍCIAS & BRIEFING EDITORIAL")
    print("=" * 65)

    start_time = time.time()
    db_url = obter_database_url()

    try:
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

            if not result:
                print("          ⚠️ Falha ou erro na resposta da IA. Pulando sem marcar no histórico.")
                time.sleep(4)
                continue

            processed_ids.append(item.get("item_id"))

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
    except Exception as exc:
        _registrar_falha_auditoria_ciclo(db_url, str(exc))
        raise


if __name__ == "__main__":
    run_pipeline()
