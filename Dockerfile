# ---- Runtime image
FROM node:18-bullseye-slim

WORKDIR /app

# Install deps first (better cache)
COPY package*.json ./
RUN npm install --omit=dev

# Copy app
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
