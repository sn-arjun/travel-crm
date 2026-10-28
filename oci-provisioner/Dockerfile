FROM node:22-slim

# The provisioner drives Docker (wp-cli runs inside the WordPress container), so it needs the docker CLI.
RUN apt-get update && apt-get install -y --no-install-recommends docker.io && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# No dependencies: node:http only. Node 22 strips the TypeScript types itself, so there is no build step.
COPY package.json ./
COPY src/ ./src/

ENV PORT=9090
EXPOSE 9090

CMD ["node", "src/server.ts"]
