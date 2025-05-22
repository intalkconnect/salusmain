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
};

// 📘 Swagger Público
const publicOptions = {
  definition: {
    ...baseDefinition,
    info: {
      title: "Salus API",
      version: "1.0.0",
    },
  },
  apis: [
    "./src/api/login.js",
    "./src/api/estimate.js",
    "./src/api/upload.js",
  ], // ✅ Só as públicas
};

const specs = swaggerJsdoc(publicOptions);

// 🛠️ Swagger para Desenvolvimento
const devOptions = {
  definition: {
    ...baseDefinition,
    info: {
      title: "Salus API - DEV",
      version: "1.0.0",
      description: "Documentação extendida para desenvolvimento e manutenção",
    },
  },
  apis: [
    "./src/api/login.js",
    "./src/api/estimate.js",
    "./src/api/upload.js",
    "./src/api/clientes.js",  // 🔒 Privada
    "./src/api/health.js",    // 🔒 Privada
  ],
};

const devSpecs = swaggerJsdoc(devOptions);

module.exports = {
  swaggerUi,
  specs,     // /docs
  devSpecs,  // /dev/docs
};
