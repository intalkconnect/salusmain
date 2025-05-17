require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { swaggerUi, specs } = require("./swagger/swagger");
const { createBullBoard } = require("@bull-board/api");
const { ExpressAdapter } = require("@bull-board/express");
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");

const loginRoutes = require("./src/api/login");

const { processJobQueue } = require("./src/jobs/processJob");

const uploadRoutes = require("./src/api/upload");
const estimateRoutes = require("./src/api/estimate");
const clientesRoutes = require("./src/api/clientes");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/auth/login", loginRoutes);
app.use("/upload", uploadRoutes);
app.use("/estimate", estimateRoutes);
app.use("/clientes", clientesRoutes);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(specs));

// Bull Board moderno
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [new BullMQAdapter(processJobQueue)],
  serverAdapter,
});

app.use("/admin/queues", serverAdapter.getRouter());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
