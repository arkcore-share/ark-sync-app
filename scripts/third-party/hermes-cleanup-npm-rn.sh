#!/usr/bin/env bash
# 仅卸载误装的 React Native Hermes（npm）；不删除 Nous Hermes Agent（~/.hermes）。
set +e
echo "[hermes-cleanup] npm uninstall -g hermes-engine-cli hermes-engine"
if command -v npm >/dev/null 2>&1; then
  npm uninstall -g hermes-engine-cli 2>/dev/null || true
  npm uninstall -g hermes-engine 2>/dev/null || true
  ROOT="$(npm root -g 2>/dev/null || true)"
  BIN="$(npm bin -g 2>/dev/null || true)"
  if [[ -n "${ROOT:-}" && -d "$ROOT/hermes-engine-cli" && -n "${BIN:-}" ]]; then
    for name in hermes hermesc hdb hbcdump; do
      [[ -e "$BIN/$name" ]] && rm -f "$BIN/$name" 2>/dev/null || true
    done
  fi
fi
echo "[hermes-cleanup] Done (Nous ~/.hermes is untouched)."
