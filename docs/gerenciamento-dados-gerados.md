# Dados gerados e conflitos de git

Os arquivos JSON em `data/` não são conteúdo editorial escrito à mão: são
**estado de execução** e **assets servidos pelo edge**. Como o bot os reescreve
a cada ciclo, commits humanos nesses arquivos disputam a mesma linha com o bot
e geram conflito de rebase com frequência.

## Arquivos e seus papéis

| Arquivo | Conteúdo | Quem gera | Quem consome |
|---|---|---|---|
| `data/vitrine_ia.json` | Snapshot da vitrine: `temas_ativos` + `noticias_quentes` | `curadoria/pipeline.py`, `redacao_v2/pulso_noticias_quentes.py` | `_worker.js` (asset), `api/routes_v2.py` |
| `data/feed_output.json` | Feed acumulado de cards do radar | `main.py` / `src/publisher.py` | `_worker.js` (asset), `api/routes_v2.py` |
| `data/history.json` | IDs já processados (dedupe do coletor) | `src/publisher.py` | `src/collector.py` |

Regras de ouro:

- Nunca editar esses arquivos à mão para "resolver" conteúdo. A fonte é o
  pipeline (ou o banco, quando houver).
- Nunca perder IDs de `data/history.json`: perder dedupe significa reprocessar
  notícias antigas e potencialmente duplicar cards.
- `data/feed_output.json` e `data/vitrine_ia.json` são "última escrita ganha".
  Merge textual linha a linha nesses arquivos não produz nada útil.

## Regra automatizada (CI)

Os workflows `.github/workflows/radar.yml` e
`.github/workflows/pipeline_v2.yml` usam
[`scripts/sync_generated_data.sh`](../scripts/sync_generated_data.sh) em vez de
`git commit && git push`. O script:

1. commita somente os artefatos informados;
2. faz `fetch` + `rebase origin/<branch>`;
3. em caso de conflito, aplica a regra fixa:

| Arquivo em conflito | Resolução automática |
|---|---|
| `data/vitrine_ia.json` | versão recém-gerada (`--theirs` no rebase) |
| `data/feed_output.json` | versão recém-gerada (`--theirs` no rebase) |
| `data/history.json` | união de `processed_ids` dos dois lados |
| qualquer outro | aborta o rebase e falha o job |

4. tenta o push até 3 vezes, com espera entre as tentativas.

Os crons também foram escalonados para reduzir a corrida:

| Workflow | Cron | Minutos |
|---|---|---|
| `radar.yml` | `5,35 * * * *` | 5 e 35 |
| `pipeline_v2.yml` (pulso) | `*/30 * * * *` | 0 e 30 |
| `pipeline_v2.yml` (curadoria/coluna) | `10 */3 * * *` | 10 a cada 3h |

Os commits dos bots usam `[skip ci]` para não dispararem os próprios workflows.

## Regra manual (quando você cai em um conflito)

Primeiro, nunca abra os JSONs para remover marcadores `<<<<<<<`. Use o git.

Cenário: `git pull --rebase` (ou `git rebase origin/main`) parou em conflito.

1. Confira o que conflitou:

   ```bash
   git status --short
   ```

2. Para `data/vitrine_ia.json` e `data/feed_output.json`, o padrão é aceitar a
   versão do pipeline remoto:

   ```bash
   git checkout origin/main -- data/vitrine_ia.json data/feed_output.json
   git add data/vitrine_ia.json data/feed_output.json
   ```

   Exceção: se você acabou de rodar o pipeline localmente e a sua versão é a
   mais nova/correta, mantenha o seu commit (durante o rebase, `--theirs` é o
   commit que está sendo reaplicado):

   ```bash
   git checkout --theirs -- data/vitrine_ia.json
   git add data/vitrine_ia.json
   ```

3. Para `data/history.json`, faça a união dos IDs (nunca descarte):

   ```bash
   git show :2:data/history.json > /tmp/history_a.json
   git show :3:data/history.json > /tmp/history_b.json
   python - <<'PY'
   import json

   ids = []
   for caminho in ("/tmp/history_a.json", "/tmp/history_b.json"):
       dados = json.load(open(caminho, encoding="utf-8"))
       for item in dados.get("processed_ids", []):
           if item not in ids:
               ids.append(item)

   with open("data/history.json", "w", encoding="utf-8") as fh:
       json.dump({"processed_ids": ids}, fh, ensure_ascii=False, indent=2)
       fh.write("\n")
   PY
   git add data/history.json
   ```

4. Se `git status` não mostrar mais nenhum `UU`, continue:

   ```bash
   GIT_EDITOR=true git rebase --continue
   git push
   ```

Se o conflito for em um arquivo que **não** seja de `data/`, não automatize:
revise o diff, resolva normalmente e só então continue.

## Por que não usar `.gitattributes` com merge driver

Seria possível declarar `data/*.json merge=ours` no `.gitattributes`, mas o
driver precisa de `git config merge.ours.driver true` em cada clone e nos
runners do CI. Como o GitHub Actions sobe um runner limpo, isso não resolve o
problema de forma confiável e ainda esconde conflitos reais. Por isso a regra
fica explícita no script.

## Próximo passo (correção de raiz)

Enquanto esses arquivos forem versionados no mesmo `main` em que humanos
commitam, a corrida pode voltar. A correção definitiva é tirar o estado do git:

- **KV (Cloudflare)** — pipeline grava/lê o estado no KV e o `_worker.js` lê do
  KV com fallback para o asset durante a migração; depois remover os arquivos do
  versionamento.
- **Backend/Postgres** — persistir feed, snapshot e dedupe no banco já usado
  pela curadoria e expor um `/v1/radar`; o edge passa a consultar o backend e o
  asset vira apenas fallback.

Em ambos os casos, a ordem é sempre: **mover a persistência primeiro, remover
do git depois**.
