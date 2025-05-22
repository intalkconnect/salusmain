require("dotenv").config();
const { Worker } = require("bullmq");
const { supabase } = require("../utils/supabaseClient");
const { normalizeText, limparTituloMedico } = require("../utils/textParser");
const { callOpenAIWithVision, callOpenAIWithText } = require("../utils/openaiHelper");
const { extractTextFromPDF, isManuscriptImage } = require("../utils/fileUtils");
const { log, error } = require("../utils/logger");
const fs = require("fs");
const path = require("path");

const connection = {
  connection: {
    url: process.env.REDIS_URL,
  },
};

const worker = new Worker(
  "process_job",
  async (job) => {
    const { filepath, ext, filename, jobId, clientId, openaiKey } = job.data;
    const startedAt = new Date();

    try {
      log(`📥 Processando job ${jobId}`);

      if (!fs.existsSync(filepath)) {
        throw new Error(`Arquivo não encontrado: ${filepath}`);
      }

      await logJobMetric(clientId, jobId, ext, "processing", null, startedAt, null);

      const extClean = path.extname(filepath).toLowerCase();
      let result;

      if ([".jpg", ".jpeg", ".png"].includes(extClean)) {
        const isManuscript = await isManuscriptImage(filepath);
        if (isManuscript) {
          await logJobMetric(clientId, jobId, ext, "human", "manuscrito", startedAt, new Date());
          return;
        }
        result = await callOpenAIWithVision(filepath, openaiKey, jobId);
      } else if (extClean === ".pdf") {
        const { text } = await extractTextFromPDF(filepath);
        if (!text || text.trim().length < 30) {
          await logJobMetric(clientId, jobId, ext, "human", "PDF ilegível", startedAt, new Date());
          return;
        }
        result = await callOpenAIWithText(text, openaiKey, jobId);
      } else {
        throw new Error("Formato de arquivo não suportado.");
      }

      if (result.status === "human") {
        await logJobMetric(clientId, jobId, ext, "human", "ilegível", startedAt, new Date());
        return;
      }

      const patient = normalizeText(result.patient || "");
      const doctor = limparTituloMedico(result.doctor || "");
      const medications = result.medications || {};

      for (const [formulaName, details] of Object.entries(medications)) {
        const {
          raw_materials = [],
          form = "",
          type = "",
          posology = "",
          quantity,
        } = details;

        for (const mp of raw_materials) {
          const activeRaw = normalizeText(mp.active || "");
          const dose = parseFloat(mp.dose) || null;
          const unity = mp.unity;

          await supabase.from("recipe_lines").insert({
            filename,
            job_id: jobId,
            text_block: `${formulaName} - ${activeRaw} ${dose}${unity} ${form}`,
            classification: "formula",
            active: activeRaw,
            dose,
            unity,
            form: normalizeText(form),
            type: normalizeText(type),
            posology: normalizeText(posology),
            quantity,
            patient,
            doctor,
            client_id: clientId,
            processed: true,
            reviewed: false,
            created_at: new Date().toISOString(),
          });
        }
      }

      await logJobMetric(clientId, jobId, ext, "sucesso", null, startedAt, new Date());

      await uploadToBucketAndDeleteTemp(filepath, filename);
      log(`✅ Job ${jobId} concluído e arquivo salvo no bucket.`);

    } catch (err) {
      error(`❌ Erro no job ${jobId}:`, err);
      await logJobMetric(clientId, jobId, ext, "falha", err.message, startedAt, new Date());
    }
  },
  connection
);

async function uploadToBucketAndDeleteTemp(filepath, filename) {
  const bucket = process.env.SUPABASE_BUCKET;
  const bucketPath = `uploads/${filename}`;

  const fileBuffer = fs.readFileSync(filepath);

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(bucketPath, fileBuffer, {
      cacheControl: "3600",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Erro no upload para o bucket: ${uploadError.message}`);
  }

  try {
    fs.unlinkSync(filepath);
    log(`🗑️ Arquivo temporário ${filename} removido após upload.`);
  } catch (err) {
    error(`❌ Erro ao remover arquivo temporário: ${err.message}`);
  }
}

async function logJobMetric(clientId, jobId, fileType, status, errorType = null, startedAt = null, endedAt = null) {
  const { data: existing } = await supabase
    .from("job_metrics")
    .select("id")
    .eq("job_id", jobId)
    .maybeSingle();

  if (existing) {
    await supabase.from("job_metrics").update({
      status,
      error_type: errorType,
      ended_at: endedAt,
    }).eq("job_id", jobId);
  } else {
    await supabase.from("job_metrics").insert({
      client_id: clientId,
      job_id: jobId,
      file_type: fileType,
      status,
      error_type: errorType,
      started_at: startedAt,
      ended_at: endedAt,
      created_at: new Date().toISOString(),
    });
  }
}
