FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# --- Production stage ---
FROM node:20-alpine

WORKDIR /app

# Security: run as non-root
RUN addgroup -g 1001 -S console && adduser -S console -u 1001

# Copy standalone output
COPY --from=builder --chown=console:console /app/.next/standalone ./
COPY --from=builder --chown=console:console /app/.next/static ./.next/static
COPY --from=builder --chown=console:console /app/public ./public

USER console

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
