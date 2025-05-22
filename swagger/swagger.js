const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

// 🔗 Configuração padrão (pública)
const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Salus API",
      version: "1.0.0",
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ["./src/api/login.js", "./src/api/estimate.js", "./src/api/upload.js"], // Apenas as rotas públicas
};

const specs = swaggerJsdoc(options);

// 🔗 Configuração para desenvolvimento
const devOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Salus API - DEV",
      version: "1.0.0",
      description: "Documentação extendida para desenvolvimento",
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ["./src/api/login.js", "./src/api/estimate.js", "./src/api/clientes.js", "./src/api/upload.js"], // Inclui também as rotas de dev
};

const devSpecs = swaggerJsdoc(devOptions);

module.exports = {
  swaggerUi,
  specs,
  devSpecs,
};
