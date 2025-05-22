require("dotenv").config();
const { Worker } = require("bullmq");
const fs = require("fs");
const path = require("path");
const { supabase } = require("../src/utils/supabaseClient");
const { normalizeText, limparTituloMedico } = require("../src/utils/textParser");
const { callOpenAIWithVision, callOpenAIWithText } = require("../src/utils/openaiHelper");
const { extractTextFromPDF, isManuscriptImage } = require("../src/utils/fileUtils");
const { log, error } = require("../src/utils/logger");

// 🔗 Configuração da conexão Redis
const connection = {
  connection: {
    url: process.env.REDIS_URL,
  },
};

console.log("🚀 Worker process_job iniciado e aguardando jobs...");

// 🚀 Worker process_job
const worker = new Worker(
  "process_job",
  async (job) => {
    const { filepath, ext, filename, jobId, clientId, openaiKey } = job.data;
    const startedAt = new Date();

    try {
      log(`📥 Processando job ${jobId}`);
      log(`🗂️ Dados do job: ${JSON.stringify(job.data, null, 2)}`);

      // 🛑 Verificação de filepath
      if (!filepath) {
        throw new Error(`❌ Filepath ausente no job ${jobId}`);
      }

      if (!fs.existsSync(filepath)) {
        throw new Error(`❌ Arquivo não encontrado em ${filepath} para job ${jobId}`);
      }

      // 🔄 Atualiza status para processing
      await logJobMetric(clientId, jobId, ext, "processing", null, startedAt, null);

      const extClean = path.extname(filepath).toLowerCase();
      let result;

      if ([".jpg", ".jpeg", ".png"].includes(extClean)) {
        const isManuscript = await isManuscriptImage(filepath);
        if (isManuscript) {
          await logJobMetric(clientId, jobId, ext, "human", "manuscrito identificado", startedAt, new Date());
          log(`👤 Job ${jobId} marcado como HUMAN — manuscrito identificado`);
          return;
        }

        log("🧠 Enviando imagem para OpenAI Vision...");
        result = await callOpenAIWithVision(filepath, openaiKey, jobId);
      } else if (extClean === ".pdf") {
        log("📄 Extraindo texto de PDF...");
        const { text } = await extractTextFromPDF(filepath);

        if (!text || text.trim().length < 30) {
          await logJobMetric(clientId, jobId, ext, "human", "PDF com pouco texto ou ilegível", startedAt, new Date());
          log(`👤 Job ${jobId} marcado como HUMAN — PDF ilegível`);
          return;
        }

        log("🧠 Enviando texto de PDF para OpenAI...");
        result = await callOpenAIWithText(text, openaiKey, jobId);
      } else {
        throw new Error(`❌ Formato de arquivo não suportado: ${extClean}`);
      }

      if (result.status === "human") {
        await logJobMetric(clientId, jobId, ext, "human", "manuscrito ou ilegível", startedAt, new Date());
        log(`👤 Job ${jobId} marcado como HUMAN — revisão manual necessária`);
        return;
      }

      log("✅ Resultado da IA recebido com sucesso!");

      const patient = normalizeText(result.patient || "");
      const doctor = limparTituloMedico(result.doctor || "");
      const medications = result.medications || {};

      for (const [formulaName, details] of Object.entries(medications)) {
        const { raw_materials = [], form = "", type = "", posology = "", quantity } = details;

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
      log(`🎉 Job ${jobId} concluído com sucesso!`);

    } catch (err) {
      error(`❌ Erro no job ${jobId}: ${err.message}`);
      await logJobMetric(clientId, jobId, ext, "falha", err.message?.slice(0, 200), startedAt, new Date());
    }
  },
  connection
);

// 🔥 Eventos do worker
worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} finalizado com sucesso`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} falhou: ${err.message}`);
});

worker.on('error', (err) => {
  console.error('❌ Erro geral no worker:', err);
});

// 📝 Função de log de job
async function logJobMetric(clientId, jobId, fileType, status, errorType = null, startedAt = null, endedAt = null) {
  const { data: existing, error: fetchError } = await supabase
    .from("job_metrics")
    .select("id")
    .eq("job_id", jobId)
    .maybeSingle();

  if (fetchError) {
    error("❌ Erro ao buscar job_metrics:", fetchError);
    return;
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from("job_metrics")
      .update({
        status,
        error_type: errorType,
        ended_at: endedAt,
      })
      .eq("job_id", jobId);

    if (updateError) {
      error("❌ Erro ao atualizar job_metrics:", updateError);
    }
  } else {
    const { error: insertError } = await supabase.from("job_metrics").insert({
      client_id: clientId,
      job_id: jobId,
      file_type: fileType,
      status,
      error_type: errorType,
      started_at: startedAt,
      ended_at: endedAt,
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      error("❌ Erro ao inserir em job_metrics:", insertError);
    }
  }
}
