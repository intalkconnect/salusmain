FROM node:20

# 🏗️ Instala dependências de sistema para PDF e libs nativas
RUN apt-get update && apt-get install -y \
    poppler-utils \
    python3 \
    make \
    g++ \
    curl \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Instala o PM2 globalmente
RUN npm install -g pm2

# Diretório de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de dependência
COPY package*.json ./

# Instala dependências
RUN npm install --production

# Copia o restante da aplicação
COPY . .

# Cria as pastas uploads e temporárias
RUN mkdir -p uploads_tmp

# Expondo a porta da API
EXPOSE 3000

# Comando padrão com PM2
CMD ["pm2-runtime", "ecosystem.config.js"]
