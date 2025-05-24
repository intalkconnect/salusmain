require("dotenv").config();
const amqp = require("amqplib");
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { s3 } = require("../src/utils/minioClient");
const { supabase } = require("../src/utils/supabaseClient");
const { normalizeText, limparTituloMedico } = require("../src/utils/textParser");
const { callOpenAIWithVision, callOpenAIWithText } = require("../src/utils/openaiHelper");
const { extractTextFromPDF, isManuscriptImage } = require("../src/utils/fileUtils");
const { log, error } = require("../src/utils/logger");
const path = require("path");
const fs = require("fs");

// Configurações
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const QUEUE = 'process_job';
const BUCKET_NAME = process.env.MINIO_BUCKET;
const openaiKey = process.env.OPENAI_API_KEY;

// Worker principal
async function startWorker() {
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();

  await channel.assertQueue(QUEUE, { durable: true });
  channel.prefetch(1);

  console.log(`🚀 Worker conectado e ouvindo a fila "${QUEUE}"`);

  channel.consume(QUEUE, async (msg) => {
    if (msg !== null) {
      const job = JSON.parse(msg.content.toString());
      const { filepath, ext, filename, jobId, clientId } = job;
      const startedAt = new Date();
      const tempFilePath = filepath;
      const extClean = ext || path.extname(filepath).replace(".", "").toLowerCase();

      try {
        log(`📥 Processando job ${jobId}`);

        if (!fs.existsSync(tempFilePath)) {
          throw new Error(`Arquivo não encontrado em ${tempFilePath}`);
        }

        await logJobMetric(clientId, jobId, ext, "processing", null, startedAt, null);

        let result;

        if (["jpg", "jpeg", "png"].includes(extClean)) {
          const isManuscript = await isManuscriptImage(tempFilePath);
          if (isManuscript) {
            await logJobMetric(clientId, jobId, ext, "human", "manuscrito identificado", startedAt, new Date());
            log(`👤 Job ${jobId} marcado como HUMAN — manuscrito identificado`);
            channel.ack(msg);
            return;
          }

          log("🧠 Enviando imagem para OpenAI Vision...");
          result = await callOpenAIWithVision(tempFilePath, openaiKey, jobId);

        } else if (extClean === "pdf") {
          log("📄 Extraindo texto de PDF...");
          const { text } = await extractTextFromPDF(tempFilePath);
          if (!text || text.trim().length < 30) {
            await logJobMetric(clientId, jobId, ext, "human", "PDF com pouco texto ou ilegível", startedAt, new Date());
            log(`👤 Job ${jobId} marcado como HUMAN — PDF ilegível`);
            channel.ack(msg);
            return;
          }
          log("🧠 Enviando texto de PDF para OpenAI...");
          result = await callOpenAIWithText(text, openaiKey, jobId);

        } else {
          throw new Error(`Formato de arquivo não suportado: ${extClean}`);
        }

        if (result.status === "human") {
          await logJobMetric(clientId, jobId, ext, "human", "manuscrito ou ilegível", startedAt, new Date());
          log(`👤 Job ${jobId} marcado como HUMAN — revisão manual necessária`);
          channel.ack(msg);
          return;
        }

        log("✅ Resultado da IA recebido");

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
        log(`✅ Job ${jobId} concluído com sucesso`);
        channel.ack(msg);

      } catch (err) {
        error(`❌ Erro no job ${jobId}:`, err);
        await logJobMetric(clientId, jobId, ext, "falha", err.message?.slice(0, 200), startedAt, new Date());
        channel.ack(msg);
      } finally {
        try {
          const fileData = fs.readFileSync(tempFilePath);
          const contentType = {
            pdf: "application/pdf",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
          }[extClean] || "application/octet-stream";

          const uploadParams = {
            Bucket: BUCKET_NAME,
            Key: `jobs/${jobId}/${filename}`,
            Body: fileData,
            ContentType: contentType,
          };

          await s3.send(new PutObjectCommand(uploadParams));
          log(`📤 Arquivo enviado para o bucket: ${filename}`);
        } catch (uploadErr) {
          error(`❌ Erro no upload para o bucket: ${uploadErr.message}`);
        }

        try {
          if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
            log(`🧹 Arquivo temporário removido: ${tempFilePath}`);
          }
        } catch (unlinkErr) {
          error(`❌ Falha ao remover arquivo temporário: ${unlinkErr.message}`);
        }
      }
    }
  });
}

startWorker().catch(console.error);

// 🔧 Função de log no banco permanece a mesma (não muda!)
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
    const { error: updateError } = await supabase.from("job_metrics").update({
      status,
      error_type: errorType,
      ended_at: endedAt,
    }).eq("job_id", jobId);

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
