require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { swaggerUi, specs } = require("./swagger/swagger");
const { createBullBoard } = require("@bull-board/api");
const { ExpressAdapter } = require("@bull-board/express");

const loginRoutes = require("./src/api/login");

const uploadRoutes = require("./src/api/upload");
const statuseRoutes = require("./src/api/status");
const clientesRoutes = require("./src/api/clientes");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/auth/login", loginRoutes);
app.use("/upload", uploadRoutes);
app.use("/status", statuseRoutes);
app.use("/clientes", clientesRoutes);
// Docs pública
app.use("/docs", swaggerUi.serve, swaggerUi.setup(specs));

app.get("/", (req, res) => {
  res.send("API rodando...");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
