/**
 * @swagger
 * /status/{job_id}:
 *   get:
 *     summary: Consulta o status e resultado de um job
 *     description: Retorna o status (in processing, success, not found ou human) e, se concluído, os dados extraídos (paciente, médico, medicamentos).
 *     tags:
 *       - Status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: job_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do job para consulta
 *     responses:
 *       200:
 *         description: Resposta com status e, se disponível, os dados processados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 job_id:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [in processing, success, not found, human]
 *                 patient:
 *                   type: string
 *                   nullable: true
 *                 doctor:
 *                   type: string
 *                   nullable: true
 *                 medications:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       raw_materials:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             active:
 *                               type: string
 *                             dose:
 *                               type: number
 *                               nullable: true
 *                             unity:
 *                               type: string
 *                       form:
 *                         type: string
 *                       type:
 *                         type: string
 *                       posology:
 *                         type: string
 *                       quantity:
 *                         type: integer
 *                         nullable: true
 *       403:
 *         description: Acesso negado (API key global não permitida)
 *       500:
 *         description: Erro interno ao buscar dados
 */

const express = require("express");
const { supabase } = require("../utils/supabaseClient");
const { authMiddleware } = require("./auth");

const router = express.Router();

// Função para limpar caracteres especiais problemáticos
function sanitizeString(str) {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^a-zA-Z0-9\s.,/()-]/g, "") // Permite letras, números, espaços e alguns símbolos seguros
    .trim();
}

router.get("/:job_id", authMiddleware, async (req, res) => {
  const jobId = req.params.job_id;
  const client = req.client;

  const { data: rows, error } = await supabase
    .from("recipe_lines")
    .select("*")
    .eq("job_id", jobId)
    .eq("client_id", client.id)
    .order("created_at", { ascending: true });

  if (error) {
    return res
      .status(500)
      .json({ detail: "Erro ao buscar dados do bd", error });
  }

  if (!rows || rows.length === 0) {
    const { data: jobMetric } = await supabase
      .from("job_metrics")
      .select("status")
      .eq("job_id", jobId)
      .maybeSingle();

    if (jobMetric?.status) {
      return res.json({ job_id: jobId, status: jobMetric.status });
    }

    return res.json({ job_id: jobId, status: "not found" });
  }

  const anyPending = rows.some((r) => !r.processed);
  if (anyPending) {
    return res.json({ job_id: jobId, status: "in processing" });
  }

  const patient = rows[0]?.patient || null;
  const doctor = rows[0]?.doctor || null;
  const medications = {};

  for (const r of rows) {
    const medName = r.text_block.split(" - ")[0].trim();

    if (!medications[medName]) {
      medications[medName] = {
        raw_materials: [],
        form: r.form,
        type: r.type,
        posology: r.posology,
        quantity: r.quantity,
      };
    }

    medications[medName].raw_materials.push({
      active: sanitizeString(r.active), // ✅ Limpeza aplicada aqui
      dose: r.dose,
      unity: r.unity,
    });
  }

  res.json({
    job_id: jobId,
    status: "success",
    patient,
    doctor,
    medications,
  });
});

module.exports = router;

