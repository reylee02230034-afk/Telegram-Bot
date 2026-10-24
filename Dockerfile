FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY . .
RUN mkdir -p /app/apps/web/public && mkdir -p /app/storage/uploads
RUN npm ci --ignore-scripts
RUN npx prisma generate

FROM base AS builder
COPY --from=deps /app ./
WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=1024
ENV JWT_SECRET=docker_build_time_secret_please_ignore
ENV NODE_ENV=production
ARG NEXT_PUBLIC_AMAP_KEY=""
ARG NEXT_PUBLIC_AMAP_SECURITY_CODE=""
ARG NEXT_PUBLIC_APP_URL=""
ENV NEXT_PUBLIC_AMAP_KEY=$NEXT_PUBLIC_AMAP_KEY
ENV NEXT_PUBLIC_AMAP_SECURITY_CODE=$NEXT_PUBLIC_AMAP_SECURITY_CODE
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json

EXPOSE 3000

CMD ["sh", "-c", "cd /app && npx prisma migrate deploy && cd apps/web && npx next start"]
