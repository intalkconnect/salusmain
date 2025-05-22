require("dotenv").config();
const { Worker } = require("bullmq");
const { supabase } = require("../src/utils/supabaseClient");
const { normalizeText, limparTituloMedico } = require("../src/utils/textParser");
const { processImageWithOpenAI, processPdfWithOpenAI, isPdfScanned, convertPdfToImages } = require("../src/utils/fileUtils");
const { log, error } = require("../src/utils/logger");
const path = require("path");

const connection = {
  connection: {
    url: process.env.REDIS_URL,
  },
};

const worker = new Worker(
  "process_job",
  async (job) => {
    const { filepath, ext, filename, jobId, clientId } = job.data;
    const startedAt = new Date();

    try {
      log(`📥 Processando job ${jobId}`);

      await logJobMetric(clientId, jobId, ext, "processing", null, startedAt, null);

      const extClean = path.extname(filepath).toLowerCase();
      let results = [];

      if (extClean === ".pdf") {
        const isScanned = await isPdfScanned(filepath);

        if (isScanned) {
          log("📄 PDF identificado como escaneado. Convertendo para imagens...");
          const images = await convertPdfToImages(filepath);

          for (const imagePath of images) {
            log(`🧠 Processando imagem ${imagePath} via OpenAI Vision...`);
            const result = await processImageWithOpenAI(imagePath);
            results.push(result);
          }
        } else {
          log("📄 PDF identificado como texto. Processando via OpenAI texto...");
          const result = await processPdfWithOpenAI(filepath);
          results.push(result);
        }
      } else if ([".jpg", ".jpeg", ".png"].includes(extClean)) {
        log("🧠 Processando imagem via OpenAI Vision...");
        const result = await processImageWithOpenAI(filepath);
        results.push(result);
      } else {
        throw new Error("Formato de arquivo não suportado.");
      }

      for (const result of results) {
        if (result.classificacao === "manuscrito") {
          await logJobMetric(
            clientId,
            jobId,
            ext,
            "human",
            "manuscrito identificado",
            startedAt,
            new Date()
          );
          log(`👤 Job ${jobId} marcado como HUMAN — manuscrito identificado`);
          return;
        }

        log("✅ Resultado da IA recebido. Salvando dados...");

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
      }

      await logJobMetric(
        clientId,
        jobId,
        ext,
        "sucesso",
        null,
        startedAt,
        new Date()
      );
      log(`✅ Job ${jobId} concluído com sucesso`);
    } catch (err) {
      error(`❌ Erro no job ${jobId}:`, err);
      await logJobMetric(
        clientId,
        jobId,
        ext,
        "falha",
        err.message?.slice(0, 200),
        startedAt,
        new Date()
      );
    }
  },
  connection
);

async function logJobMetric(
  clientId,
  jobId,
  fileType,
  status,
  errorType = null,
  startedAt = null,
  endedAt = null
) {
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
