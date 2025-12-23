# ---- Runtime image
FROM node:18-bullseye-slim

WORKDIR /app

# ⬇️ ДОБАВЛЕНО: curl для healthcheck
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# Install deps first (better cache)
COPY package*.json ./
RUN npm install --omit=dev

# Copy app
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
