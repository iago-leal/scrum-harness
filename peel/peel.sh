#!/usr/bin/env bash
# Descasca o harness do perfil scrum em graus, aproximando-o da LLM nua.
# Ver peel/README.md; o gêmeo deste experimento vive em
# ../deepseek-harness/peel/ sobre o perfil headless.
#
# Uso:   bash peel/peel.sh <grau 0..5>              valida com --dump-config (sem chave)
#        PEEL_SERVE=1 bash peel/peel.sh <grau> [porta]   sobe a GUI descascada (padrão 3090)
#
#   grau 0  perfil scrum completo (base + web + SCRUM)
#   grau 1  sem ferramentas (inclui as 23 tools SCRUM)   (~ --tools "")
#   grau 2  + persona vazia                              (~ --system-prompt)
#   grau 3  + sem memória/skills/comandos (e /scrum)     (~ parte do --bare)
#   grau 4  + quase nu: agente mínimo, SCRUM todo fora   (~ --safe-mode/--bare)
#   grau 5  LLM realmente pura: API direta (imprime o curl, NÃO executa)
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/.." && pwd)"
HARNESS="${DSH_CHECKOUT:-$REPO/../deepseek-harness}"
export DSH_HOME="$REPO/.dsh-home"

GRAU="${1:?uso: bash peel/peel.sh <grau 0..5> [porta]}"
PORTA="${2:-3090}"

GRAUS=(
  "grau-1-sem-ferramentas.yml"
  "grau-2-sem-persona.yml"
  "grau-3-sem-memoria-skills-comandos.yml"
  "grau-4-quase-nu.yml"
)

if [ "$GRAU" = 5 ]; then
  cat <<'EOF'
Grau 5 — LLM realmente pura: nenhum harness, só o que você mandar.
NÃO executado (sem chave / a pedido). O caminho é a API direta:

  # DeepSeek (chat completions):
  curl https://api.deepseek.com/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
    -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"SUA MENSAGEM"}]}'

  # Anthropic (/v1/messages), como no texto original:
  curl https://api.anthropic.com/v1/messages \
    -H "content-type: application/json" \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -d '{"model":"<modelo>","max_tokens":256,"messages":[{"role":"user","content":"SUA MENSAGEM"}]}'
EOF
  exit 0
fi

BIN="$HARNESS/apps/cli/lib/bin.js"
if [ ! -f "$BIN" ]; then
  echo "peel: $BIN não existe — builde o harness (pnpm run build) ou aponte DSH_CHECKOUT" >&2
  exit 1
fi

PATCHES=()
for ((indice = 1; indice <= GRAU; indice++)); do
  PATCHES+=(--patch "$DIR/${GRAUS[indice - 1]}")
done

if [ -n "${PEEL_SERVE:-}" ]; then
  exec node "$BIN" --profile scrum ${PATCHES[@]+"${PATCHES[@]}"} --port "$PORTA"
fi

DUMP="$(node "$BIN" --profile scrum ${PATCHES[@]+"${PATCHES[@]}"} --dump-config)"
printf '%s\n' "$DUMP"
ATIVAS="$(printf '%s\n' "$DUMP" | grep -c '^- id: ' || true)"
DESLIGADAS="$(printf '%s\n' "$DUMP" | grep -c '^  disabled: true' || true)"
echo "── grau $GRAU: $ATIVAS rows na árvore, $DESLIGADAS desligadas ──" >&2
