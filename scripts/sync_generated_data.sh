#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Publica os artefatos gerados pelos pipelines (data/*.json) com segurança.
#
# Os arquivos em data/ são estado de execução reescrito pelo bot a cada ciclo.
# Commitar isso em main gera conflitos recorrentes com o próprio bot. Este
# script centraliza a regra de resolução automática:
#
#   - data/vitrine_ia.json e data/feed_output.json -> versão recém-gerada
#     (lado "theirs" do rebase, isto é, o commit que está sendo reaplicado)
#   - data/history.json -> união dos processed_ids (dedupe nunca perde IDs)
#
# Qualquer outro arquivo em conflito aborta o processo, porque exige revisão
# humana.
#
# Uso:
#   bash scripts/sync_generated_data.sh "<mensagem do commit>" [arquivo...]
#
# Variáveis opcionais:
#   SYNC_BRANCH       branch de destino (default: $GITHUB_REF_NAME ou main)
#   SYNC_TENTATIVAS   tentativas de push/rebase (default: 3)
#   SYNC_ESPERA       segundos entre tentativas (default: 10)
# ---------------------------------------------------------------------------
set -uo pipefail

MENSAGEM="${1:-chore(pipeline): atualiza dados gerados}"
shift || true
ARQUIVOS=("$@")
if [ ${#ARQUIVOS[@]} -eq 0 ]; then
  ARQUIVOS=(data/vitrine_ia.json data/feed_output.json data/history.json data/entenda_v2.json)
fi

BRANCH="${SYNC_BRANCH:-${GITHUB_REF_NAME:-main}}"
TENTATIVAS="${SYNC_TENTATIVAS:-3}"
ESPERA="${SYNC_ESPERA:-10}"

log() { echo "[sync-dados] $*"; }

# GitHub Actions tem python3; alguns ambientes locais só têm python.
PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  PYTHON_BIN="python"
fi

# Garante identidade para o commit mesmo quando o workflow não configurou.
if ! git config user.email >/dev/null 2>&1; then
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
fi
if ! git config user.name >/dev/null 2>&1; then
  git config user.name "github-actions[bot]"
fi

# Considera apenas arquivos existentes (um pipeline pode não gerar todos).
EXISTENTES=()
for arq in "${ARQUIVOS[@]}"; do
  [ -e "$arq" ] && EXISTENTES+=("$arq")
done

if [ ${#EXISTENTES[@]} -eq 0 ]; then
  log "Nenhum dos arquivos informados existe; nada a publicar."
  exit 0
fi

git add -- "${EXISTENTES[@]}" || {
  log "ERRO: falha no git add dos artefatos gerados."
  exit 1
}
if git diff --cached --quiet; then
  log "Sem alterações em: ${EXISTENTES[*]}"
  exit 0
fi

if ! git commit -m "$MENSAGEM" -- "${EXISTENTES[@]}"; then
  log "ERRO: falha ao criar o commit dos artefatos gerados."
  exit 1
fi
log "Commit criado: $(git rev-parse --short HEAD)"

# Depois do commit, o restante da árvore deve estar limpo. Caso contrário o
# rebase falharia por motivos não relacionados aos dados gerados.
if ! git diff --quiet || ! git diff --cached --quiet; then
  log "ERRO: há alterações não commitadas além dos artefatos gerados."
  git status --short
  exit 1
fi

rebase_em_andamento() {
  [ -d "$(git rev-parse --git-path rebase-merge)" ] || \
    [ -d "$(git rev-parse --git-path rebase-apply)" ]
}

resolver_history() {
  local tmp
  tmp="$(mktemp -d)"
  git show ":2:data/history.json" > "$tmp/base.json" 2>/dev/null || true
  git show ":3:data/history.json" > "$tmp/novo.json" 2>/dev/null || true

  "$PYTHON_BIN" - "$tmp/base.json" "$tmp/novo.json" "data/history.json" <<'PY'
import json
import sys


def ler_ids(caminho):
    try:
        with open(caminho, encoding="utf-8") as fh:
            dados = json.load(fh)
    except Exception:
        return []
    if isinstance(dados, dict):
        return list(dados.get("processed_ids") or [])
    if isinstance(dados, list):
        return dados
    return []


atual, novo, destino = sys.argv[1:4]
vistos = []
for item in ler_ids(atual) + ler_ids(novo):
    if item not in vistos:
        vistos.append(item)

with open(destino, "w", encoding="utf-8") as fh:
    json.dump({"processed_ids": vistos}, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
PY

  if [ $? -ne 0 ]; then
    rm -rf "$tmp"
    log "ERRO: falha ao unir processed_ids de history.json."
    return 1
  fi

  rm -rf "$tmp"
  git add -- data/history.json || return 1
  log "history.json: união de processed_ids aplicada."
}

# Resolve os conflitos do rebase. Retorna 1 se sobrar conflito não automático.
resolver_conflitos() {
  local conflitos arq
  local restantes=()

  conflitos="$(git diff --name-only --diff-filter=U)"
  [ -z "$conflitos" ] && return 0

  while IFS= read -r arq; do
    [ -z "$arq" ] && continue
    case "$arq" in
      data/vitrine_ia.json|data/feed_output.json|data/entenda_v2.json)
        # Durante o rebase, "theirs" é o commit recém-gerado sendo reaplicado.
        if git checkout --theirs -- "$arq"; then
          git add -- "$arq" || { restantes+=("$arq"); continue; }
          log "$arq: mantida a versão recém-gerada."
        else
          restantes+=("$arq")
        fi
        ;;
      data/history.json)
        resolver_history || restantes+=("$arq")
        ;;
      *)
        restantes+=("$arq")
        ;;
    esac
  done <<< "$conflitos"

  if [ ${#restantes[@]} -gt 0 ]; then
    log "ERRO: conflito exige revisão humana em: ${restantes[*]}"
    return 1
  fi
  return 0
}

continuar_rebase() {
  local saida status
  saida="$(GIT_EDITOR=true git rebase --continue 2>&1)"
  status=$?
  printf '%s\n' "$saida"
  if [ $status -ne 0 ]; then
    if printf '%s' "$saida" | grep -qiE "no changes|now empty|nothing to commit"; then
      git rebase --skip
      return $?
    fi
    return $status
  fi
  return 0
}

# Resolve todos os conflitos e continua o rebase até o fim.
concluir_rebase() {
  local guarda=0
  while rebase_em_andamento; do
    guarda=$((guarda + 1))
    if [ "$guarda" -gt 20 ]; then
      log "ERRO: rebase não convergiu após $guarda etapas."
      return 1
    fi
    resolver_conflitos || return 1
    continuar_rebase || return 1
  done
  return 0
}

# Histórico completo é necessário para rebase. Os workflows já usam
# fetch-depth: 0; o fallback abaixo cobre execuções locais em clone raso.
if [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = "true" ]; then
  log "Repositório raso detectado; buscando histórico completo."
  git fetch --quiet --unshallow origin \
    "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" 2>/dev/null || \
    git fetch --quiet --deepen=50 origin \
      "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" 2>/dev/null || true
fi

for tentativa in $(seq 1 "$TENTATIVAS"); do
  log "Tentativa $tentativa/$TENTATIVAS (origin/$BRANCH)"

  if ! git fetch --quiet origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"; then
    log "Falha no fetch; nova tentativa em ${ESPERA}s."
    sleep "$ESPERA"
    continue
  fi

  git rebase "origin/$BRANCH" || true

  if rebase_em_andamento; then
    if ! concluir_rebase; then
      git rebase --abort >/dev/null 2>&1 || true
      log "Conflito não automatizável; rebase abortado."
      sleep "$ESPERA"
      continue
    fi
  fi

  if git push origin "HEAD:$BRANCH"; then
    log "Publicado com sucesso em origin/$BRANCH."
    exit 0
  fi

  log "Push rejeitado (provável corrida com outro bot); nova tentativa em ${ESPERA}s."
  sleep "$ESPERA"
done

log "ERRO: não foi possível publicar os artefatos após $TENTATIVAS tentativas."
exit 1
