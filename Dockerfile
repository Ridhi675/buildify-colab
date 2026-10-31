# Production image for Buildify CoLab (Railway, Render, Fly.io, any Docker host).
# One long-running Node process: SSE connections and agent jobs live in memory,
# so run a single instance. SQLite lives at /data — mount a volume there to keep
# data across deploys; without one the demo is re-seeded on every start.
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL="file:/data/buildify.db"
RUN mkdir -p /data
EXPOSE 3000

CMD ["sh", "scripts/start.sh"]
