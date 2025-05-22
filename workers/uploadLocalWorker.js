require("dotenv").config();
const { Worker } = require("bullmq");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { supabase } = require("../src/utils/supabaseClient");
const { log, error } = require("../src/utils/logger");
const { processJobQueue } = require("../src/jobs/processJob"); // 🔥 Importa a fila do processJob

const connection = {
  connection: {
    url: process.env.REDIS_URL,
  },
};

const worker = new Worker(
  "processJobQueue",
  async (job) => {
    if (job.name !== "upload_local") return;

    const { jobId, clientId, fileFromForm, fileFromUrl } = job.data;
    const startedAt = new Date();

    try {
      let filename, filePath, ext;

      if (fileFromForm) {
        ext = path.extname(fileFromForm.originalname).slice(1).toLowerCase();
        filename = `${jobId}.${ext}`;
        filePath = path.join("uploads", filename);

        fs.renameSync(fileFromForm.path, filePath);
        log(`📁 Arquivo movido para uploads/: ${filename}`);
      }

      if (fileFromUrl) {
        const response = await axios.get(fileFromUrl, { responseType: "stream" });
        const contentType = response.headers["content-type"];

        ext = contentType.split("/")[1].toLowerCase();
        if (ext === "jpeg") ext = "jpg";
        filename = `${jobId}.${ext}`;
        filePath = path.join("uploads", filename);

        const writer = fs.createWriteStream(filePath);
        await new Promise((resolve, reject) => {
          response.data.pipe(writer);
          writer.on("finish", resolve);
          writer.on("error", reject);
        });

        log(`🌐 Arquivo baixado para uploads/: ${filename}`);
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

      log(`✅ Upload local concluído e job ${jobId} enfileirado para processamento`);

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
