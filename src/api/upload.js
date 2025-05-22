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
const { v4: uuidv4 } = require("uuid");
const { processJobQueue } = require("../jobs/processJob");
const { authMiddleware } = require("./auth");
const { supabase } = require("../utils/supabaseClient");

const router = express.Router();
const upload = multer({ dest: "uploads_tmp/" }); // Pasta temporária

router.post("/", authMiddleware, upload.single("file"), async (req, res) => {
  const client = req.client;

  if (client.is_global) {
    return res.status(403).json({ detail: "Global API key não autorizada para upload" });
  }

  const jobId = uuidv4();
  const fileFromUrl = req.body.file_url;
  const fileFromForm = req.file;

  if (!fileFromUrl && !fileFromForm) {
    return res.status(400).json({ detail: "Nenhum arquivo enviado (file ou file_url)." });
  }

  try {
    // Salva no banco job inicial
    const { error } = await supabase.from("job_metrics").insert({
      job_id: jobId,
      client_id: client.id,
      status: "pending_upload",
      file_type: null,
      uploaded: false,
      created_at: new Date().toISOString(),
    });

    if (error) throw error;

    const payload = {
      jobId,
      clientId: client.id,
      fileFromForm: fileFromForm
        ? {
            path: fileFromForm.path,
            originalname: fileFromForm.originalname,
          }
        : null,
      fileFromUrl: fileFromUrl || null,
    };

    // Enfileira job para Upload Local
    await processJobQueue.add("upload_local", payload);

    return res.status(200).json({
      job_id: jobId,
      status: "em processamento",
    });

  } catch (err) {
    console.error("❌ Erro no upload:", err);
    return res.status(500).json({ detail: "Erro ao criar job de upload." });
  }
});

module.exports = router;

