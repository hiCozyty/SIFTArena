## Getting Started

### Hardware Requirements

#### Lean Mode
- **1 x86/64 machine** (lead node) — runs the server, Docker instances, and local web app
- Download evidence files (each 6+ GB) from the [releases page](https://github.com/hiCozyty/siftarena/releases) to work with existing data
- **Limitations:** Highly restricted attack chain and playbook configuration
- **Available:** Workflow selection, custom workflows, model selection, agentic analysis on existing data

#### Comprehensive Mode
- **Everything from Lean Mode, plus:**
- **1 additional x86/64 machine** to host the Ludus range / Proxmox server (optional)
- Full attack chain and playbook configuration, live range orchestration

### Prerequisites
- [Bun](https://bun.sh) (JavaScript runtime)
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [Docker](https://www.docker.com/)
- [OpenCode Go subscription](https://opencode.ai) — API key required (set `OPENCODE_API_KEY` in `.env`)

### Setup
```bash
# 1. Install Python dependencies
uv init --python 3.12
uv add ansible evil-winrm-py
uv sync

# 2. Install JS dependencies
cd server && bun install && cd ../web && bun install && cd ..

# 3. Configure environment
cp .env.example .env        # fill in your values
cp web/.env.example web/.env
```

### Run
```bash
cd server && bun run start
```
This starts the backend API server, OpenCode Docker instances, SIFT workstation, and the web dev server — all in one command.

## Environment Setup

Copy the example env files and fill in your values:

### Root `.env`
```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `LUDUS_SERVER_URL` | Ludus server URL |
| `LUDUS_API_KEY` | Ludus API key |
| `LUDUS_RANGE_ID` | Ludus range ID |
| `BUN_SERVER_PORT` | Backend server port (default `8011`) |
| `OPENCODE_API_KEY` | OpenCode API key |
| `PROXMOX_HOST` | Proxmox host URL |
| `PROXMOX_USER` | Proxmox username |
| `PROXMOX_PASSWORD` | Proxmox password |
| `PROXMOX_NODE` | Proxmox node name |

### `web/.env`
```bash
cp web/.env.example web/.env
```

| Variable | Description |
|----------|-------------|
| `SHADCNIO_TOKEN` | shadcn.io token |
| `VITE_API_URL` | Backend API URL (default `http://localhost:8011`) |
| `VITE_BACKEND_WS_URL` | Backend WebSocket URL (default `ws://localhost:8011`) |
| `VITE_OPENCODE_URL` | OpenCode proxy path (default `/api/opencode`) |
| `VITE_PLAYBOOK_OPENCODE_URL` | Playbook OpenCode proxy path (default `/api/playbook-opencode`) |

## VM Management

| VM | Credentials |
|----|-------------|
| Kali | `kali:kali` |


## OpenCode Docker Instances
Ensure ports **3111** (abilityGeneration) and **3112** (noiseGeneration) are free before starting:
```
lsof -i :3111 -i :3112
```
If any process is using these ports, stop it before proceeding.

build: 
```bash
cd server/caldera/opencodeDocker
docker compose up --build
```

start:
```bash
docker compose up -d
```

## SIFT Workstation Docker

Ensure ports **5901** (VNC), **6901** (noVNC), **2222** (SSH), and **3113** (OpenCode) are free before starting:
```
lsof -i :5901 -i :6901 -i :2222 -i :3113
```
If any process is using these ports, stop it before proceeding.

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
| OpenCode | 3113 | — |

First build takes ~15 minutes (installs XFCE + Cast + SIFT SaltStack + Protocol SIFT).
