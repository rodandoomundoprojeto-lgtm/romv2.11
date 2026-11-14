# Agente de Curadoria IA — Rodando o Mundo

Implementação do plano em [`arquitetura_agente_ia_rodando_o_mundo.md`](../arquitetura_agente_ia_rodando_o_mundo.md).
Pacote **isolado** do radar existente (`main.py` + `src/`) — não altera nenhum fluxo atual.

## Estrutura

```
curadoria/
├── agente/
│   ├── schemas.py      # Contrato Pydantic ÚNICO (agente + API)
│   ├── prompt.py       # System prompt calibrado
│   ├── fontes.py       # Feeds RSS + Google Trends BR
│   ├── coletor.py      # Ingestion: coleta, limpeza HTML, janela temporal
│   └── analisador.py   # Gemini + Structured Outputs + envio ao backend
├── api/main.py         # FastAPI: /v1/curadoria, /historico, /vitrine/em-alta, /busca/expansao
├── db/
│   ├── migrations/001_init.sql
│   └── queries/{busca_hibrida,content_gaps}.sql
├── tests/test_schemas.py
├── output/             # último payload gerado (ignorado pelo git)
├── pipeline.py         # Orquestrador (python -m curadoria.pipeline)
├── requirements.txt
└── .env.example
```

## Uso rápido (Windows / PowerShell, a partir da raiz do projeto)

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r curadoria\requirements.txt
python -m pytest curadoria\tests -q              # valida o contrato
python -m curadoria.pipeline --dry-run           # coleta + IA, só imprime JSON
uvicorn curadoria.api.main:app --reload          # API local em :8000
```

Variáveis de ambiente: ver [`.env.example`](.env.example).

