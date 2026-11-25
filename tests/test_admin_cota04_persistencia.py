import os
from dotenv import load_dotenv
load_dotenv()
import pytest
from fastapi.testclient import TestClient
from main import app
from api.routes_v2 import _validar_link_url, CotaPatrocinioItem

client = TestClient(app)

def test_validar_link_url_auto_correcao():
    # URL normal
    assert _validar_link_url("https://instagram.com/empresa") == "https://instagram.com/empresa"
    assert _validar_link_url("http://site.com") == "http://site.com"
    assert _validar_link_url("/parcerias") == "/parcerias"
    assert _validar_link_url("") == ""
    # Sem protocolo (auto-correção)
    assert _validar_link_url("instagram.com/empresa") == "https://instagram.com/empresa"
    assert _validar_link_url("www.empresa.com.br") == "https://www.empresa.com.br"
    # Inválido
    with pytest.raises(ValueError):
        _validar_link_url("invalido_sem_ponto")

def test_cota04_put_and_get_persistencia():
    token = os.getenv("ADMIN_SECRET_TOKEN") or os.getenv("CURADORIA_SECRET_TOKEN") or os.getenv("ADMIN_PASSWORD") or os.getenv("ADMIN_SENHA") or "teste"
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Obter estado atual
    r_get = client.get("/v2/patrocinadores")
    assert r_get.status_code == 200
    dados_iniciais = r_get.json()
    assert "cotas" in dados_iniciais

    cotas = dados_iniciais["cotas"]
    gaveta = cotas.get("gaveta_contextual", [])
    assert len(gaveta) >= 1

    item_original = gaveta[0]
    id_item = item_original["id"]

    # 2. Alterar dados na Cota 04 (continente, nome, frase e link sem https)
    novo_nome = "Patrocinador Teste Cota 04"
    nova_frase = "Conexões globais e exclusivas com {pais}."
    novo_link = "instagram.com/teste_cota04"
    novos_continentes = "europa,asia"

    item_modificado = dict(item_original)
    item_modificado["nome"] = novo_nome
    item_modificado["frase"] = nova_frase
    item_modificado["link_url"] = novo_link
    item_modificado["continentes_alvo"] = novos_continentes

    cotas_alteradas = dict(cotas)
    cotas_alteradas["gaveta_contextual"] = [item_modificado]

    r_put = client.put("/v2/admin/patrocinadores", json={"cotas": cotas_alteradas}, headers=headers)
    assert r_put.status_code == 200, f"Falha no PUT: {r_put.text}"
    resp_put = r_put.json()
    assert resp_put["ok"] is True

    # 3. Consultar novamente e verificar que persistiu
    r_get2 = client.get("/v2/patrocinadores")
    assert r_get2.status_code == 200
    dados_finais = r_get2.json()
    gaveta_final = dados_finais["cotas"]["gaveta_contextual"]
    assert len(gaveta_final) >= 1
    item_salvo = gaveta_final[0]

    assert item_salvo["nome"] == novo_nome
    assert item_salvo["frase"] == nova_frase
    assert item_salvo["link_url"] == "https://instagram.com/teste_cota04"
    assert "europa" in item_salvo["continentes_alvo"]
    assert "asia" in item_salvo["continentes_alvo"]

    # 4. Restaurar estado original do patrocinador
    cotas_restauradas = dict(cotas)
    cotas_restauradas["gaveta_contextual"] = [item_original]
    r_restaurar = client.put("/v2/admin/patrocinadores", json={"cotas": cotas_restauradas}, headers=headers)
    assert r_restaurar.status_code == 200
