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
const { supabase } = require("../utils/supabaseClient");
const { processJobQueue } = require("../jobs/processJob");
const { authMiddleware } = require("./auth");

const router = express.Router();
const upload = multer({ dest: "uploads_tmp/" }); // TEMPORÁRIO

router.post("/", authMiddleware, upload.single("file"), async (req, res) => {
  const client = req.client;

  if (client.is_global) {
    return res.status(403).json({ detail: "Global API key não autorizada para upload" });
  }

  let filePath, ext, newFilename;
  const jobId = uuidv4();

  try {
    const uploadsDir = path.join(__dirname, "..", "uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

    if (req.file) {
      ext = path.extname(req.file.originalname).slice(1).toLowerCase();
      if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) {
        return res.status(400).json({ detail: "Formato de arquivo inválido." });
      }

      newFilename = `${jobId}.${ext}`;
      filePath = path.join(uploadsDir, newFilename);
      fs.renameSync(req.file.path, filePath);
      console.log(`📁 Arquivo recebido via Form e movido para: ${filePath}`);
    } else if (req.body.file_url) {
      const url = req.body.file_url;
      const response = await axios.get(url, { responseType: "stream" });

      const contentType = response.headers["content-type"];
      if (!contentType) throw new Error("Content-Type não encontrado.");

      ext = contentType.split("/")[1].toLowerCase();
      if (ext === "jpeg") ext = "jpg";
      if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) {
        return res.status(400).json({ detail: "Formato de arquivo inválido." });
      }

      newFilename = `${jobId}.${ext}`;
      filePath = path.join(uploadsDir, newFilename);

      const writer = fs.createWriteStream(filePath);
      await new Promise((resolve, reject) => {
        response.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
      console.log(`🌐 Arquivo baixado da URL e salvo em: ${filePath}`);
    } else {
      return res.status(400).json({ detail: "Nenhum arquivo enviado." });
    }

    // 💾 Log inicial no Supabase
    await supabase.from("job_metrics").insert({
      job_id: jobId,
      client_id: client.id,
      status: "pending",
      file_type: ext,
      uploaded: false,
      created_at: new Date().toISOString(),
    });

    await processJobQueue.add("process_job", {
      filepath: filePath,
      ext,
      filename: newFilename,
      jobId,
      clientId: client.id,
      openaiKey: client.openai_key
    });

    return res.status(200).json({
      job_id: jobId,
      status: "em processamento"
    });

  } catch (err) {
    console.error("❌ Erro no upload:", err);
    return res.status(500).json({ detail: "Erro ao processar o upload." });
  }
});

module.exports = router;
