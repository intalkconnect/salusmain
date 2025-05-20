FROM node:18

# Cria o diretório da aplicação
WORKDIR /app

# Copia arquivos de definição de dependências
COPY package*.json ./

# Instala tudo (produção ou desenvolvimento, conforme necessário)
RUN npm install

# Copia o restante dos arquivos
COPY . .

# Expõe a porta da API
EXPOSE 3000

# Comando padrão: iniciar servidor + worker
CMD ["npm", "run", "start:all"]
