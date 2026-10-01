#!/bin/sh
set -eu

export DISPLAY=:99
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
Xvfb "$DISPLAY" -screen 0 1440x900x24 -ac &
fluxbox -display "$DISPLAY" &

until xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; do
  sleep 0.2
done

x11vnc -display "$DISPLAY" -forever -shared -viewonly -nopw -localhost -rfbport 5900 -quiet &
sleep 1
websockify --web=/usr/share/novnc 0.0.0.0:6080 127.0.0.1:5900 &

# Forward the same browser-visible origins used by the normal UI test.
socat TCP-LISTEN:3000,bind=127.0.0.1,fork,reuseaddr TCP:frontend:8080 &
socat TCP-LISTEN:8082,bind=127.0.0.1,fork,reuseaddr TCP:keycloak:8080 &

echo "Demo-scherm klaar op http://localhost:6080/vnc.html?autoconnect=true&resize=scale&view_only=true"
echo "Playwright begint over 15 seconden. Open het demo-scherm nu in uw browser."
sleep 15
exec npx playwright test --headed
