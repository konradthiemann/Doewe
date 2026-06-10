#!/bin/bash
# PostToolUse (Edit|Write) — async
FILE=$(python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except: print('')
" 2>/dev/null)

[[ "$FILE" != *.ts && "$FILE" != *.tsx ]] && exit 0
[[ "$FILE" == *node_modules* || "$FILE" == */.next/* || "$FILE" == */dist/* || "$FILE" == */build/* ]] && exit 0

PROJECT="${CLAUDE_PROJECT_DIR}"

# Determine workspace and typecheck command
if [[ "$FILE" == "$PROJECT/apps/web/"* ]]; then
  WORKSPACE="$PROJECT/apps/web"
  CMD="npx tsc -p tsconfig.json --noEmit --skipLibCheck 2>&1 | grep -v '^\$' | head -50"
elif [[ "$FILE" == "$PROJECT/packages/shared/"* ]]; then
  WORKSPACE="$PROJECT/packages/shared"
  CMD="npx tsc --noEmit --skipLibCheck 2>&1 | grep -v '^\$' | head -30"
else
  exit 0
fi

cd "$WORKSPACE" || exit 0

RESULT=$(eval "$CMD" 2>&1)
if [[ $? -ne 0 && -n "$RESULT" ]]; then
  echo "TypeScript-Fehler (async check) — $WORKSPACE:"
  echo "$RESULT"
  exit 1
fi
exit 0
