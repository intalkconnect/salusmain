// src/workers/uploadWorker.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { supabase } = require("../src/utils/supabaseClient");
const { log, error } = require("../src/utils/logger");
const cron = require("node-cron");

async function processUploads() {
  log("🚀 Buscando arquivos para upload...");

  const { data: jobs, error: fetchError } = await supabase
    .from("job_metrics")
    .select("job_id, file_type, client_id")
    .eq("status", "sucesso")
    .eq("uploaded", false);

  if (fetchError) {
    error("❌ Erro ao buscar jobs para upload:", fetchError);
    return;
  }

  if (!jobs || jobs.length === 0) {
    log("📭 Nenhum arquivo pendente de upload.");
    return;
  }

  for (const job of jobs) {
    const { job_id, file_type } = job;
    const filename = `${job_id}.${file_type}`;
    const filePath = path.join("uploads", filename);

    if (!fs.existsSync(filePath)) {
      error(`❌ Arquivo não encontrado: ${filePath}`);
      continue;
    }

    try {
      const fileBuffer = fs.readFileSync(filePath);

      const { data, error: uploadError } = await supabase.storage
        .from(process.env.SUPABASE_BUCKET)
        .upload(`uploads/${filename}`, fileBuffer, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        error(`❌ Erro ao fazer upload de ${filename}:`, uploadError);
        continue;
      }

      log(`✅ Arquivo ${filename} enviado para o bucket.`);

      // Atualiza flag uploaded no banco
      const { error: updateError } = await supabase
        .from("job_metrics")
        .update({ uploaded: true })
        .eq("job_id", job_id);

      if (updateError) {
        error("❌ Erro ao atualizar flag uploaded:", updateError);
      } else {
        // Deleta o arquivo local após upload bem-sucedido
        fs.unlinkSync(filePath);
        log(`🗑️ Arquivo local ${filename} deletado.`);
      }
    } catch (err) {
      error(`❌ Erro ao processar upload do arquivo ${filename}:`, err);
    }
  }
}

// Executa a cada 5 minutos
cron.schedule("*/5 * * * *", () => {
  processUploads();
});
