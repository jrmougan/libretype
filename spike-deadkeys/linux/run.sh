#!/usr/bin/env bash
# Arranca X virtual con layout espanol y lanza el spike.
set -euo pipefail

export DISPLAY=:99

cleanup() {
    pkill -f "Xvfb :99" 2>/dev/null || true
}
trap cleanup EXIT

cleanup
sleep 0.5

# -noreset evita que Xvfb reinicie el layout a 'us' tras desconectarse clientes efímeros
Xvfb :99 -screen 0 1280x800x24 -noreset >/dev/null 2>&1 &
sleep 1.5

LAYOUT="${1:-${SPIKE_LAYOUT:-es}}"
setxkbmap -display :99 "$LAYOUT" 2>/dev/null || setxkbmap "$LAYOUT" 2>/dev/null || true
sleep 0.3

ACTUAL_LAYOUT=$(setxkbmap -query 2>/dev/null | awk '/layout:/ {print $2}')
if [ "$ACTUAL_LAYOUT" != "es" ]; then
    echo "ERROR: el layout de X es '${ACTUAL_LAYOUT:-desconocido}' (esperado 'es'): el entorno no compone, prueba no ejecutada." >&2
    exit 3
fi

# WebKitGTK en contenedor: sin GPU ni DMABuf.
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export LIBGL_ALWAYS_SOFTWARE=1
export GDK_BACKEND=x11

set +e
python3 -u "$(dirname "$0")/driver_linux.py"
rc=$?
exit $rc
