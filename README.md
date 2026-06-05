## Getting started
```
uv init --python 3.12
uv add ansible pywinrm
uv sync 
```

## OpenCode Docker Instances
Ensure ports **3111** (abilityGeneration) and **3112** (backgroundLogs) are free before starting:
```
lsof -i :3111 -i :3112
```
If any process is using these ports, stop it before proceeding.

build: 
docker compose up --build

start:
docker compose up -d