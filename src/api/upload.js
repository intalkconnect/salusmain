/**
 * @swagger
 * /upload:
 *   post:
 *     summary: Faz upload de um arquivo para processamento
 *     tags:
 *       - Upload
 *     description: |
 *       Este endpoint permite enviar um arquivo (PDF, JPG, JPEG ou PNG) para ser processado. 
 *       O envio pode ser feito de duas formas:
 *       
 *       - **Upload de arquivo** via `multipart/form-data` (campo `file`).
 *       - **Envio por URL** via JSON (campo `file_url`).
 *       
 *       Após o envio, um job é criado e processado de forma assíncrona. Acompanhe o status usando o `job_id` retornado.
 *       
 *       ⚠️ Apenas clientes (API keys não globais) podem fazer uploads.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Arquivo para upload (PDF, JPG, JPEG, PNG)
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - file_url
 *             properties:
 *               file_url:
 *                 type: string
 *                 format: uri
 *                 description: URL pública de um arquivo para download e processamento
 *     responses:
 *       200:
 *         description: Upload realizado com sucesso, job criado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 job_id:
 *                   type: string
 *                   description: ID do job criado
 *                 status:
 *                   type: string
 *                   example: em processamento
 *       400:
 *         description: Nenhum arquivo enviado ou formato inválido
 *       403:
 *         description: Acesso negado — API Key Global não pode fazer upload
 *       500:
 *         description: Erro interno ao processar upload
 */

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const { authMiddleware } = require("./auth");
const { sendToQueue } = require('../jobs/rabbitmqClient');
const router = express.Router();
const upload = multer({ dest: "uploads_tmp/" }); // Somente pasta temporária

router.post("/", authMiddleware, upload.single("file"), async (req, res) => {
  const client = req.client;

  if (client.is_global) {
    return res.status(403).json({ detail: "Global API key não autorizada para upload" });
  }

  const jobId = uuidv4();
  let filepath, ext, filename;

  try {
    if (req.file) {
      filepath = req.file.path;
      ext = path.extname(req.file.originalname).slice(1).toLowerCase();
      filename = `${jobId}.${ext}`;
    } else if (req.body.file_url) {
      const url = req.body.file_url;
      const response = await axios.get(url, { responseType: "stream" });

      const contentType = response.headers["content-type"];
      if (!contentType) throw new Error("Content-Type não encontrado.");

      ext = contentType.split("/")[1].toLowerCase();
      if (ext === "jpeg") ext = "jpg";

      filename = `${jobId}.${ext}`;
      filepath = path.join("uploads_tmp", filename);

      const writer = fs.createWriteStream(filepath);
      await new Promise((resolve, reject) => {
        response.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
    } else {
      return res.status(400).json({ detail: "Nenhum arquivo enviado." });
    }

    await sendToQueue('process_job', {
  filepath,
  ext,
  filename,
  jobId,
  clientId: client.id,
  openaiKey: client.openai_key,
});

    res.json({ job_id: jobId, status: "em processamento" });

  } catch (err) {
    console.error("❌ Erro no upload:", err);
    return res.status(500).json({ detail: "Erro ao processar o upload." });
  }
});

module.exports = router;
