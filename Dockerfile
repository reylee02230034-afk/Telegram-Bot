FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl python3 make g++

FROM base AS deps
COPY . .
RUN npm ci --ignore-scripts || npm install
RUN npx prisma generate

FROM base AS builder
COPY --from=deps /app ./
WORKDIR /app/apps/web
ENV NEXT_TELEMETRY_DISABLED=1
ENV JWT_SECRET=docker_build_time_secret_please_ignore
ENV NODE_ENV=production
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json

EXPOSE 3000

CMD ["sh", "-c", "cd /app && npx prisma migrate deploy && cd apps/web && npx next start"]
