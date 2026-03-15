FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:3100/health || exit 1
CMD ["npx", "tsx", "agent.ts"]
