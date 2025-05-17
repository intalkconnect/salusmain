const express = require("express");
const { supabase } = require("../utils/supabaseClient");
const { authMiddleware } = require("./auth");

const router = express.Router();

router.get("/:job_id", authMiddleware, async (req, res) => {
  const jobId = req.params.job_id;
  const client = req.client;

  if (client.is_global) {
    return res
      .status(403)
      .json({ detail: "Global API key não autorizada para estimate" });
  }

  const { data: rows, error } = await supabase
    .from("recipe_lines")
    .select("*")
    .eq("job_id", jobId)
    .eq("client_id", client.id)
    .order("created_at", { ascending: true });

  if (error) {
    return res
      .status(500)
      .json({ detail: "Erro ao buscar dados do Supabase", error });
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

    return res.json({ job_id: jobId, status: "não encontrado" });
  }

  const anyPending = rows.some((r) => !r.processed);
  if (anyPending) {
    return res.json({ job_id: jobId, status: "em processamento" });
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
      active: r.active,
      dose: r.dose,
      unity: r.unity,
    });
  }

  res.json({
    job_id: jobId,
    status: "concluído",
    patient,
    doctor,
    medications,
  });
});

module.exports = router;
