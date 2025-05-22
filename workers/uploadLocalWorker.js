require("dotenv").config();
const { Worker } = require("bullmq");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { supabase } = require("../src/utils/supabaseClient");
const { log, error } = require("../src/utils/logger");
const { processJobQueue } = require("../src/jobs/processJob");

const connection = {
  connection: {
    url: process.env.REDIS_URL,
  },
};

const worker = new Worker(
  "upload_job",
  async (job) => {
    if (job.name !== "upload_local") return;

    const { jobId, clientId, fileFromForm, fileFromUrl } = job.data;
    const startedAt = new Date();

    log(`🚀 [Job ${jobId}] Iniciando Upload Local`);
    log(`📦 Payload recebido: ${JSON.stringify(job.data, null, 2)}`);

    try {
      let filename, filePath, ext;

      // 🔥 Validação obrigatória
      if (!fileFromForm && !fileFromUrl) {
        throw new Error(`❌ Nenhum arquivo ou URL enviado no job ${jobId}`);
      }

      // 🔍 Verifica se a pasta uploads existe
      const uploadsDir = path.join(__dirname, "..", "uploads");
      if (!fs.existsSync(uploadsDir)) {
        log(`📂 Pasta uploads não encontrada, criando em ${uploadsDir}`);
        fs.mkdirSync(uploadsDir, { recursive: true });
      } else {
        log(`📂 Pasta uploads encontrada em ${uploadsDir}`);
      }

      if (fileFromForm) {
        log(`📥 Arquivo recebido via Form: ${fileFromForm.originalname}`);
        log(`📥 Path temporário recebido: ${fileFromForm.path}`);

        ext = path.extname(fileFromForm.originalname).slice(1).toLowerCase();
        if (!ext) throw new Error(`❌ Extensão inválida no arquivo no job ${jobId}`);

        filename = `${jobId}.${ext}`;
        filePath = path.join(uploadsDir, filename);

        log(`🔧 Movendo arquivo de ${fileFromForm.path} para ${filePath}`);
        fs.renameSync(fileFromForm.path, filePath);
        log(`📁 Arquivo movido para uploads/: ${filename}`);
      }

      if (fileFromUrl) {
        log(`🌐 Fazendo download da URL: ${fileFromUrl}`);
        const response = await axios.get(fileFromUrl, { responseType: "stream" });
        const contentType = response.headers["content-type"];

        if (!contentType) {
          throw new Error(`❌ Content-Type não encontrado na URL do job ${jobId}`);
        }

        ext = contentType.split("/")[1].toLowerCase();
        if (ext === "jpeg") ext = "jpg";
        if (!ext) throw new Error(`❌ Extensão não reconhecida na URL no job ${jobId}`);

        filename = `${jobId}.${ext}`;
        filePath = path.join(uploadsDir, filename);

        log(`🔧 Salvando arquivo baixado em ${filePath}`);
        const writer = fs.createWriteStream(filePath);
        await new Promise((resolve, reject) => {
          response.data.pipe(writer);
          writer.on("finish", resolve);
          writer.on("error", reject);
        });

        log(`🌐 Arquivo baixado e salvo em uploads/: ${filename}`);
      }

      if (!filePath) {
        throw new Error(`❌ Filepath não gerado no job ${jobId}`);
      }

      // ✅ Confirmação final
      if (fs.existsSync(filePath)) {
        log(`✅ Arquivo confirmado no local: ${filePath}`);
      } else {
        throw new Error(`❌ Arquivo NÃO encontrado no local após mover/baixar: ${filePath}`);
      }

      await supabase.from("job_metrics")
        .update({
          status: "processing",
          file_type: ext,
          started_at: startedAt,
        })
        .eq("job_id", jobId);

      // 🔥 Enfileira para processamento
      await processJobQueue.add('process_job', {
        filepath: filePath,
        ext,
        filename,
        jobId,
        clientId,
      });

      log(`🚀 Upload local concluído e job ${jobId} enfileirado para processamento`);

    } catch (err) {
      error(`❌ Erro no upload local do job ${jobId}:`, err);
      await supabase.from("job_metrics")
        .update({
          status: "upload_fail",
          error_type: err.message,
        })
        .eq("job_id", jobId);
    }
  },
  connection
);
