FROM node:22-alpine

WORKDIR /app

# ติดตั้ง dependencies ก่อน (cache layer)
COPY package*.json ./
RUN npm ci --omit=dev

# คัดลอก source code
COPY src/ ./src/

# Cloud Run inject PORT มาให้เอง
ENV PORT=8080
EXPOSE 8080

CMD ["node", "src/index.js"]
