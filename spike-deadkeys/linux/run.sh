#!/usr/bin/env bash
# Arranca X virtual con layout espanol y lanza el spike.
set -u
export DISPLAY=:99
pkill -f "Xvfb :99" 2>/dev/null; sleep 0.5
Xvfb :99 -screen 0 1280x800x24 >/dev/null 2>&1 &
sleep 1.5
setxkbmap -display :99 es 2>/dev/null || setxkbmap es
sleep 0.3
# WebKitGTK en contenedor: sin GPU ni DMABuf.
export WEBKIT_DISABLE_DMABUF_RENDERER=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export LIBGL_ALWAYS_SOFTWARE=1
export GDK_BACKEND=x11
python3 -u "$(dirname "$0")/driver_linux.py" 
rc=$?
pkill -f "Xvfb :99" 2>/dev/null
exit $rc
