#!/bin/bash
# PreToolUse (Bash) — blocking
CMD=$(python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', ''))
except: print('')
" 2>/dev/null)

echo "$CMD" | grep -qE "^\s*git\b" || exit 0

if echo "$CMD" | grep -qE "git push.*(--force|-f)\b"; then
  echo "BLOCKED: Force-Push ist nicht erlaubt." >&2; exit 2
fi
if echo "$CMD" | grep -qE "git push\b.*(origin\s+)?(main|master)\b"; then
  echo "BLOCKED: Direkter Push auf main/master ist nicht erlaubt." >&2; exit 2
fi
if echo "$CMD" | grep -qE "git reset --hard"; then
  echo "BLOCKED: git reset --hard blockiert — nutze git stash." >&2; exit 2
fi
if echo "$CMD" | grep -qE "git clean.*-[a-z]*f"; then
  echo "BLOCKED: git clean -f blockiert." >&2; exit 2
fi
exit 0
