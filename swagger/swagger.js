const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

// 🔗 Base de definição Swagger
const baseDefinition = {
  openapi: "3.0.0",
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
      },
    },
  },
  security: [{ bearerAuth: [] }],
  servers: [
    {
      url: "https://salus-api.dkdevs.com.br",
      description: "Produção",
    },
  ],
};

// 📘 Swagger Público
const publicOptions = {
  definition: {
    ...baseDefinition,
    info: {
      title: "SalusAPI",
      version: "1.0.0",
      description: "Documentação da SalusAPI",
    },
  },
  apis: [
    "./src/api/*.js" // Caminho para os arquivos com os comentários Swagger
  ],
};

const specs = swaggerJsdoc(publicOptions);

module.exports = {
  swaggerUi,
  specs
};
