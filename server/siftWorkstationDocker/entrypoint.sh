#!/bin/bash
echo "============================================"
echo "  SANS SIFT Workstation"
echo "  VNC  -> ws://host:6901 (websockify -> TigerVNC :5901)"
echo "  SSH  -> host:22  (user: sift / forensics)"
echo "============================================"

service ssh start

rm -f /tmp/.X1-lock
rm -f /tmp/.X11-unix/X1

mkdir -p /home/sift/.vnc
chown -R sift:sift /home/sift/.vnc

su - sift -c "vncserver :1 \
    -geometry ${VNC_RESOLUTION:-1280x800} \
    -depth ${VNC_COL_DEPTH:-24} \
    -localhost no \
    -SecurityTypes VncAuth \
    > /home/sift/.vnc/vnc-startup.log 2>&1"

nohup websockify 6901 localhost:5901 > /home/sift/.vnc/websockify.log 2>&1 &

sleep 3

echo "Services started. Container is running."
echo ""

if ! command -v bun &>/dev/null; then
    echo "Installing bun (first run)..."
    curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash || true
fi

if ! command -v opencode &>/dev/null; then
    echo "Installing opencode (first run)..."
    curl -fsSL https://opencode.ai/install | bash || true
    cp /root/.opencode/bin/opencode /usr/local/bin/opencode
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> /home/sift/.bashrc
fi

tail -f /dev/null
