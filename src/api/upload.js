/**
 * @swagger
 * /upload:
 *   post:
 *     summary: Faz upload de arquivo (FormData ou URL)
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               file_url:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: Sucesso
 *       400:
 *         description: Erro de validação
 *       403:
 *         description: Acesso negado
 */

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const { processJobQueue } = require("../jobs/processJob");
const { authMiddleware } = require("./auth");
const { supabase } = require("../utils/supabaseClient");

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

    await processJobQueue.add("process_job", {
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
