"""Cliente leve do Radar de Plantão Geopolítico para envio de status ao Arduino Uno.

Estados suportados:
  - 'V' (Verde): Tudo normal — feeds rodando e site atualizado
  - 'A' (Amarelo): Notícia na fila de triagem ou novo veículo em /cadastrar-veiculo
  - 'R' (Vermelho + Buzzer): Plantão Geopolítico / Notícia urgente de alto impacto
"""

import sys
from typing import Optional
import urllib.error
import urllib.request

URL_PONTE = "http://127.0.0.1:5050"
TIMEOUT_SEGUNDOS = 2.0


def enviar_alerta(cmd: str, url_ponte: str = URL_PONTE) -> bool:
    """Envia um comando ('V', 'A', 'R') para a ponte Arduino local.

    Retorna True se enviado com sucesso, False se a ponte estiver fechada.
    Nunca levanta exceção para não interromper pipelines em execução.
    """
    cmd_clean = str(cmd).strip().upper()
    url = f"{url_ponte.rstrip('/')}/alerta/{cmd_clean}"

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "RadarGeopolitico/1.0"})
        with urllib.request.urlopen(req, timeout=TIMEOUT_SEGUNDOS) as resp:
            return resp.status == 200
    except (urllib.error.URLError, OSError, TimeoutError):
        return False


def alerta_verde(url_ponte: str = URL_PONTE) -> bool:
    """🟢 Verde: Feeds rodando normalmente e site atualizado."""
    return enviar_alerta("V", url_ponte=url_ponte)


def alerta_amarelo(motivo: Optional[str] = None, url_ponte: str = URL_PONTE) -> bool:
    """🟡 Amarelo: Nova notícia na fila de triagem ou novo veículo cadastrado."""
    if motivo:
        print(f"[Radar Amarelo] {motivo}", file=sys.stderr)
    return enviar_alerta("A", url_ponte=url_ponte)


def alerta_plantao(motivo: Optional[str] = None, url_ponte: str = URL_PONTE) -> bool:
    """🔴 Vermelho + Buzzer: Notícia urgente / Plantão Geopolítico de alto impacto."""
    if motivo:
        print(f"[PLANTÃO GEOPOLÍTICO] {motivo}", file=sys.stderr)
    return enviar_alerta("R", url_ponte=url_ponte)


def alerta_silenciar(url_ponte: str = URL_PONTE) -> bool:
    """🔕 Silencia o alarme e retorna para Verde."""
    return enviar_alerta("V", url_ponte=url_ponte)


# Aliases para compatibilidade retroativa
alerta_normal = alerta_verde
alerta_ok = alerta_verde
alerta_triagem = alerta_amarelo
alerta_veiculo = alerta_amarelo
alerta_nova_materia = alerta_amarelo
alerta_vermelho = alerta_plantao
alerta_erro = alerta_plantao


if __name__ == "__main__":
    comando = (sys.argv[1] if len(sys.argv) > 1 else "V").upper()
    print(f"Enviando status '{comando}' para {URL_PONTE}...")
    sucesso = enviar_alerta(comando)
    if sucesso:
        print(f"Status '{comando}' aplicado com sucesso ao Arduino!")
    else:
        print(f"Aviso: Ponte em {URL_PONTE} indisponível. Certifique-se de que o 'iniciar.bat' está rodando.")
