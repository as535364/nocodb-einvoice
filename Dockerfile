FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM node:22-slim
ENV TZ=Asia/Taipei
WORKDIR /app
COPY --from=deps /app/node_modules /app/node_modules
COPY . .

ENV CRON_SCHEDULE="0 3 * * *"
ENV REQUEST_DELAY="1000"

CMD ["node", "index.js"]
