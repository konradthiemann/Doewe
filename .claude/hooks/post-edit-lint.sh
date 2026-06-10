#!/bin/bash
# PostToolUse (Edit|Write) — blocking
FILE=$(python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except: print('')
" 2>/dev/null)

[[ "$FILE" != *.ts && "$FILE" != *.tsx && "$FILE" != *.js && "$FILE" != *.jsx && "$FILE" != *.mjs && "$FILE" != *.cjs ]] && exit 0
[[ "$FILE" == *node_modules* || "$FILE" == */.next/* || "$FILE" == */dist/* || "$FILE" == */build/* ]] && exit 0

PROJECT="${CLAUDE_PROJECT_DIR}"

# Determine workspace directory based on file path
if [[ "$FILE" == "$PROJECT/apps/web/"* ]]; then
  WORKSPACE="$PROJECT/apps/web"
elif [[ "$FILE" == "$PROJECT/packages/shared/"* ]]; then
  WORKSPACE="$PROJECT/packages/shared"
else
  WORKSPACE="$PROJECT"
fi

ESLINT="$PROJECT/node_modules/.bin/eslint"
[[ ! -x "$ESLINT" ]] && ESLINT="$WORKSPACE/node_modules/.bin/eslint"
[[ ! -x "$ESLINT" ]] && exit 0

RESULT=$(cd "$WORKSPACE" && "$ESLINT" "$FILE" --max-warnings 0 2>&1 | head -60)
EXIT_CODE=$?

if [[ $EXIT_CODE -ne 0 && -n "$RESULT" ]]; then
  echo "ESLint-Fehler in: $FILE"
  echo "$RESULT"
  exit 1
fi
exit 0
