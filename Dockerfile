FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl python3 make g++

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY apps/web/package.json ./apps/web/
COPY apps/bot/package.json ./apps/bot/
RUN npm ci
RUN npx prisma generate

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .
WORKDIR /app/apps/web
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next ./apps/web/.next
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/node_modules ./apps/web/node_modules

USER nextjs
EXPOSE 3000

CMD ["sh", "-c", "cd /app && npx prisma migrate deploy && cd apps/web && npx next start"]
