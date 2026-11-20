"""Cliente leve para envio de alertas dos seus pipelines/agentes ao Arduino Uno.

Uso em qualquer script Python seu:
    from notificador import alerta_nova_materia, alerta_erro, alerta_ok

    # Quando publicar ou encontrar matéria nova:
    alerta_nova_materia()

    # Se seu pipeline der erro:
    alerta_erro("Falha ao consultar API")

    # Quando o pipeline rodar com sucesso sem novidades:
    alerta_ok()
"""

import sys
from typing import Optional
import urllib.error
import urllib.request

URL_PONTE = "http://127.0.0.1:5050"
TIMEOUT_SEGUNDOS = 2.0


def enviar_alerta(cmd: str, url_ponte: str = URL_PONTE) -> bool:
    """Envia um comando ('N', 'E' ou 'O') para a ponte Arduino local.

    Retorna True se enviado com sucesso, False se a ponte estiver fechada ou indisponível.
    Nunca lança exceção para não interromper a execução do pipeline principal.
    """
    cmd_clean = str(cmd).strip().upper()
    url = f"{url_ponte.rstrip('/')}/alerta/{cmd_clean}"

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "PipelineRoM/1.0"})
        with urllib.request.urlopen(req, timeout=TIMEOUT_SEGUNDOS) as resp:
            return resp.status == 200
    except (urllib.error.URLError, OSError, TimeoutError):
        # Falha silenciosa proposital para nunca derrubar o pipeline caso o Arduino não esteja plugado
        return False


def alerta_nova_materia(url_ponte: str = URL_PONTE) -> bool:
    """Aciona LED amarelo + buzzer no Arduino."""
    return enviar_alerta("N", url_ponte=url_ponte)


def alerta_erro(msg: Optional[str] = None, url_ponte: str = URL_PONTE) -> bool:
    """Aciona LED vermelho + apito grave no Arduino."""
    if msg:
        print(f"[Alerta Arduino] Erro registrado: {msg}", file=sys.stderr)
    return enviar_alerta("E", url_ponte=url_ponte)


def alerta_ok(url_ponte: str = URL_PONTE) -> bool:
    """Apaga o LED vermelho de erro (pipeline saudável)."""
    return enviar_alerta("O", url_ponte=url_ponte)


if __name__ == "__main__":
    comando = (sys.argv[1] if len(sys.argv) > 1 else "N").upper()
    print(f"Enviando alerta '{comando}' para {URL_PONTE}...")
    sucesso = enviar_alerta(comando)
    if sucesso:
        print(f"Alerta '{comando}' entregue com sucesso ao Arduino!")
    else:
        print(f"Aviso: Não foi possível contatar a ponte em {URL_PONTE}. Verifique se 'iniciar.bat' está rodando.")
