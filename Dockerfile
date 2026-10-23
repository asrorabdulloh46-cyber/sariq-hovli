# Fly.io / Railway / VPS uchun
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server ./server
COPY client ./client
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/server.js"]
