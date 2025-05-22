FROM node:20

# 🏗️ Instala dependências do sistema
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

# Copia arquivos de dependências
COPY package*.json ./

# Instala dependências apenas de produção
RUN npm install --production

# Copia o restante da aplicação
COPY . .

# Cria os diretórios necessários
RUN mkdir -p /app/uploads /app/uploads_tmp

# Define permissões (opcional, mas recomendado)
RUN chmod -R 755 /app/uploads /app/uploads_tmp

# Expõe a porta da API
EXPOSE 3000

# Comando padrão para rodar os processos com PM2
CMD ["pm2-runtime", "ecosystem.config.js"]
