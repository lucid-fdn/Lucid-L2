FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for layer caching
COPY offchain/package.json offchain/package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY offchain/ ./

# Build TypeScript
RUN npm run build

# --- Production stage ---
FROM node:20-alpine

WORKDIR /app

# Security: run as non-root
RUN addgroup -g 1001 -S lucid && adduser -S lucid -u 1001
USER lucid

COPY --from=builder --chown=lucid:lucid /app ./

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "dist/packages/gateway-lite/src/index.js"]
