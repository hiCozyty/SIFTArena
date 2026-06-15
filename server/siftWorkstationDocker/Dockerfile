FROM ubuntu:22.04

LABEL maintainer="shadow-protocol"
LABEL description="SANS SIFT Workstation with XFCE desktop, TigerVNC + websockify, and SSH"

ENV DEBIAN_FRONTEND=noninteractive
ENV CAST_VERSION=1.0.8
ENV VNC_RESOLUTION=1280x800
ENV VNC_COL_DEPTH=24

RUN apt-get update && apt-get install -y \
    wget \
    curl \
    git \
    sudo \
    gnupg \
    software-properties-common \
    ca-certificates \
    apt-utils \
    locales \
    unzip \
    && locale-gen en_US.UTF-8 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

RUN apt-get update && apt-get install -y \
    xfce4 \
    xfce4-goodies \
    xfce4-terminal \
    xterm \
    dbus-x11 \
    x11-xserver-utils \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y \
    tigervnc-standalone-server \
    websockify \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y \
    openssh-server \
    ssl-cert \
    && mkdir -p /var/run/sshd \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config \
    && sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config

RUN useradd -m -s /bin/bash sift \
    && echo "sift:forensics" | chpasswd \
    && echo "root:forensics" | chpasswd \
    && usermod -aG sudo sift \
    && usermod -aG ssl-cert sift \
    && echo "sift ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

RUN mkdir -p /home/sift/.vnc \
    && printf "forensics\nforensics\n" | vncpasswd /home/sift/.vnc/passwd \
    && chown -R sift:sift /home/sift/.vnc

USER sift
WORKDIR /home/sift

RUN echo '#!/bin/bash\n\
unset SESSION_MANAGER\n\
unset DBUS_SESSION_BUS_ADDRESS\n\
export XKL_XMODMAP_DISABLE=1\n\
exec startxfce4' > /home/sift/.vnc/xstartup \
    && chmod +x /home/sift/.vnc/xstartup

USER root

RUN wget -q "https://github.com/ekristen/cast/releases/download/v${CAST_VERSION}/cast-v${CAST_VERSION}-linux-amd64.deb" \
        -O /tmp/cast.deb \
    && dpkg -i /tmp/cast.deb \
    && rm /tmp/cast.deb

RUN sudo cast install --mode=server teamdfir/sift-saltstack

ENV PATH="/root/.local/bin:${PATH}"

RUN curl -fsSL https://opencode.ai/install | bash && \
    cp /root/.opencode/bin/opencode /usr/local/bin/opencode

RUN curl -fsSL https://bun.sh/install | bash && \
    cp /root/.bun/bin/bun /usr/local/bin/bun

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/home/sift/workflows", "/home/sift/results"]

WORKDIR /home/sift

EXPOSE 5901 6901 22 3113

ENTRYPOINT ["/entrypoint.sh"]
