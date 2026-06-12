FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    bash \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# install opencode globally
RUN curl -fsSL https://opencode.ai/install | bash && \
    cp /root/.opencode/bin/opencode /usr/local/bin/opencode

RUN curl -fsSL https://bun.sh/install | bash && \
    cp /root/.bun/bin/bun /usr/local/bin/bun

# non-root user
RUN useradd -m -s /bin/bash sandbox && \
    mkdir -p /home/sandbox/.local && \
    chown -R sandbox:sandbox /home/sandbox/.local
USER sandbox
WORKDIR /workspace

RUN mkdir -p /workspace/abilityGeneration /workspace/noiseGeneration

EXPOSE 3111 3112
