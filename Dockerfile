FROM node:18-slim

RUN npm install -g pm2

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

EXPOSE 3000

# Usa arquivo de configuração do PM2
CMD ["pm2-runtime", "ecosystem.config.js"]
