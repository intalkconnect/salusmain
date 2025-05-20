FROM node:18

# Define diretório de trabalho
WORKDIR /app

# Copia apenas arquivos necessários
COPY package*.json ./

# Instala dependências de produção
RUN npm ci --omit=dev

# Copia o restante da aplicação
COPY . .

# Define variáveis de ambiente padrão (opcional)
ENV NODE_ENV=production

# Expõe a porta da API (ajuste se necessário)
EXPOSE 3000

# Comando para iniciar o servidor + worker
CMD ["npm", "run", "start:all"]
