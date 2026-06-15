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

for i in $(seq 1 30); do
  ss -tlnp | grep -q :5901 && break
  sleep 0.1
done

mkdir -p /home/sift/evidence
chown sift:sift /home/sift/evidence

echo "Installing sshpass for MCP SSH connectivity..."
apt-get update -qq && apt-get install -y -qq sshpass && echo "  -> done"

echo "Installing workflow dependencies..."
for workflow_dir in /home/sift/workflows/*/; do
  workflow_name=$(basename "$workflow_dir")
  if [ -f "${workflow_dir}package.json" ]; then
    echo "  -> ${workflow_name}"
    cd "$workflow_dir" && bun install 2>&1 | sed 's/^/     /' || echo "     Warning: failed to install deps for ${workflow_name}"
  fi
done

python3 -c "import pyscca; print('ok')" 2>/dev/null || pip install libscca-python

echo "Services started. Container is running."
echo ""

tail -f /dev/null
