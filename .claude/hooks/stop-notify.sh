#!/bin/bash
# Stop — async
PROJECT_NAME=$(basename "${CLAUDE_PROJECT_DIR:-$(pwd)}")
osascript -e "display notification \"Aufgabe abgeschlossen\" with title \"Claude Code\" subtitle \"$PROJECT_NAME\"" 2>/dev/null || true
exit 0
