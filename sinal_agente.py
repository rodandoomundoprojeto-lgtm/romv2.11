"""Sinaliza a ponte Arduino que um agente esta em execucao (LED branco pulsando).

Uso programatico:

    from sinal_agente import agente_ativo

    with agente_ativo("curadoria"):
        ...  # busca, resumo ou atualizacao das noticias quentes

Uso por linha de comando (sem alterar o codigo do agente):

    python sinal_agente.py run "pesquisa" -- python meu_agente.py

Tambem e possivel controlar manualmente:

    python sinal_agente.py iniciar curadoria
    python sinal_agente.py parar curadoria
    python sinal_agente.py status
"""

import json
import subprocess
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager

URL_PONTE = "http://127.0.0.1:5050"
HEARTBEAT_SEGUNDOS = 10.0
TIMEOUT_SEGUNDOS = 2.0


def _chamar(acao: str, nome: str, url_ponte: str = URL_PONTE) -> bool:
    qs = urllib.parse.urlencode({"nome": nome})
    url = f"{url_ponte.rstrip('/')}/agente/{acao}?{qs}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SinalAgente/1.0"})
        with urllib.request.urlopen(req, timeout=TIMEOUT_SEGUNDOS) as resp:
            return resp.status == 200
    except (urllib.error.URLError, OSError, TimeoutError):
        return False


def iniciar(nome: str = "padrao", url_ponte: str = URL_PONTE) -> bool:
    return _chamar("iniciar", nome, url_ponte)


def parar(nome: str = "padrao", url_ponte: str = URL_PONTE) -> bool:
    return _chamar("parar", nome, url_ponte)


def status(url_ponte: str = URL_PONTE) -> dict:
    url = f"{url_ponte.rstrip('/')}/agente/status"
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT_SEGUNDOS) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, TimeoutError, ValueError):
        return {"ok": False, "erro": "ponte indisponivel"}


@contextmanager
def agente_ativo(
    nome: str = "padrao",
    url_ponte: str = URL_PONTE,
    intervalo: float = HEARTBEAT_SEGUNDOS,
):
    """Mantem o LED branco pulsando enquanto o bloco estiver em execucao."""
    iniciar(nome, url_ponte)
    stop = threading.Event()

    def _hb() -> None:
        while not stop.wait(intervalo):
            _chamar("heartbeat", nome, url_ponte)

    threading.Thread(target=_hb, daemon=True).start()
    try:
        yield
    finally:
        stop.set()
        parar(nome, url_ponte)


def main(argv: list[str]) -> int:
    if not argv:
        print("uso: python sinal_agente.py {iniciar|parar|status} [nome]")
        print("     python sinal_agente.py run <nome> -- <comando...>")
        return 1

    if argv[0] == "run":
        if len(argv) < 4 or argv[2] != "--":
            print("uso: python sinal_agente.py run <nome> -- <comando...>")
            return 1
        with agente_ativo(argv[1]):
            return subprocess.call(argv[3:])

    acao = argv[0]
    nome = argv[1] if len(argv) > 1 else "padrao"
    if acao == "status":
        print(json.dumps(status(), indent=2, ensure_ascii=False))
        return 0
    if acao in ("iniciar", "parar"):
        ok = iniciar(nome) if acao == "iniciar" else parar(nome)
        print(f"{acao} '{nome}': {'ok' if ok else 'falhou (ponte offline?)'}")
        return 0 if ok else 1
    print(f"acao desconhecida: {acao}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
