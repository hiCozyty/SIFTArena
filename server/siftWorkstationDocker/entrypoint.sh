#!/bin/bash
echo "============================================"
echo "  SANS SIFT Workstation"
echo "  VNC  -> ws://host:5901"
echo "  SSH  -> host:22  (user: sift / forensics)"
echo "============================================"

service ssh start

rm -f /tmp/.X1-lock
rm -f /tmp/.X11-unix/X1

mkdir -p /home/sift/.vnc
cat > /home/sift/.vnc/kasmvnc.yaml << 'EOF'
network:
  protocol: http
  websocket_port: 5901
  use_ipv4: true
  use_ipv6: false
  interface: 0.0.0.0
command_line:
  prompt: false
logging:
  log_writer_name: all
  log_dest: logfile
  level: 30
keyboard:
  ignore_numlock: false
  raw_keyboard: false
pointer:
  enabled: true
EOF
chown -R sift:sift /home/sift/.vnc

su - sift -c "nohup kasmvncserver :1 \
    -select-de manual \
    -sslOnly 0 \
    -SecurityTypes None \
    -geometry ${VNC_RESOLUTION:-1280x800} \
    -depth ${VNC_COL_DEPTH:-24} \
    -websocketPort 5901 \
    > /home/sift/.vnc/kasmvnc-startup.log 2>&1 &"

sleep 3

echo "Services started. Container is running."
echo ""

if ! command -v claude &>/dev/null; then
    echo "Installing Protocol SIFT + Claude Code (first run)..."
    export PATH="$HOME/.local/bin:$PATH"
    curl -fsSL https://raw.githubusercontent.com/teamdfir/protocol-sift/main/install.sh | bash || true
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> /home/sift/.bashrc
fi

tail -f /dev/null
