## Getting started
```
uv init --python 3.12
uv add ansible pywinrm
uv sync 
```

## OpenCode Docker Instances
Ensure ports **3111** (abilityGeneration) and **3112** (noiseGeneration) are free before starting:
```
lsof -i :3111 -i :3112
```
If any process is using these ports, stop it before proceeding.

build: 
docker compose up --build

start:
docker compose up -d

## SIFT Workstation Docker

Build and start the SIFT VNC + SSH container:

```bash
cd server/siftWorkstationDocker
docker compose up -d --build
```

| Service | Port | Credentials |
|---------|------|-------------|
| noVNC via websockify | 6901 | `forensics` |
| TigerVNC (TCP) | 5901 | `forensics` |
| SSH | 2222 | `sift:forensics` |

First build takes ~15 minutes (installs XFCE + Cast + SIFT SaltStack + Protocol SIFT).

See [notes/siftDocker.md](notes/siftDocker.md) for routes and integration details.