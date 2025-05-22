FROM node:18-slim

# 🏗️ Instala dependências do sistema para pdf-poppler e outras libs nativas
RUN apt-get update && apt-get install -y \
    poppler-utils \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Instala o PM2 globalmente
RUN npm install -g pm2

# Diretório de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de dependência
COPY package*.json ./

# Instala dependências em modo produção
RUN npm install --production

# Copia o restante dos arquivos da aplicação
COPY . .

# Cria as pastas uploads e temporárias
RUN mkdir -p uploads uploads_tmp

# Expondo a porta da API
EXPOSE 3000

# Comando padrão, rodando PM2 com o arquivo de configuração
CMD ["pm2-runtime", "ecosystem.config.js"]
