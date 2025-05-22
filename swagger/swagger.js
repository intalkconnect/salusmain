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
    "./src/api/*.js"
  ],
};

const specs = swaggerJsdoc(publicOptions);

module.exports = {
  swaggerUi,
  specs
};
