FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    bash \
    && rm -rf /var/lib/apt/lists/*

# install opencode globally
RUN curl -fsSL https://opencode.ai/install | bash && \
    cp /root/.opencode/bin/opencode /usr/local/bin/opencode

# non-root user
RUN useradd -m -s /bin/bash sandbox && \
    mkdir -p /home/sandbox/.local && \
    chown -R sandbox:sandbox /home/sandbox/.local
USER sandbox
WORKDIR /workspace

EXPOSE 3111

CMD ["opencode", "serve", "--port", "3111", "--hostname", "0.0.0.0"]
