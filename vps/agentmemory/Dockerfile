FROM node:22-bookworm-slim

ARG AGENTMEMORY_VERSION=0.9.29

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl tar \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g "@agentmemory/agentmemory@${AGENTMEMORY_VERSION}"

RUN mkdir -p /data /home/node/.agentmemory \
 && chown -R node:node /data /home/node/.agentmemory

USER node
ENV HOME=/home/node \
    CI=1 \
    AGENTMEMORY_DATA_DIR=/data \
    AGENTMEMORY_TOOLS=core \
    AGENTMEMORY_AUTO_COMPRESS=false \
    AGENTMEMORY_INJECT_CONTEXT=false \
    III_TELEMETRY_ENABLED=false

CMD ["agentmemory","--data-dir","/data"]
