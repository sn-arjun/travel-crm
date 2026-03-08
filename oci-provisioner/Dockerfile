FROM node:22-slim

RUN apt-get update && apt-get install -y docker.io && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production

COPY dist/ ./dist/

ENV PORT=9090
EXPOSE 9090

CMD ["node", "dist/server.js"]
