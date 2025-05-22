require("dotenv").config();
const fs = require("fs").promises;
const path = require("path");
const { supabase } = require("../src/utils/supabaseClient");
const { log, error } = require("../utils/logger");
const cron = require("node-cron");

// Configurações
const UPLOADS_FOLDER = path.resolve("uploads");
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET;

if (!SUPABASE_BUCKET) {
  throw new Error("❌ SUPABASE_BUCKET não definido no .env");
}

async function processUploads() {
  log("🚀 Buscando arquivos para upload no bucket...");

  const { data: jobs, error: fetchError } = await supabase
    .from("job_metrics")
    .select("job_id, file_type")
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
    const ext = file_type.toLowerCase();
    const filename = `${job_id}.${ext}`;
    const filePath = path.join(UPLOADS_FOLDER, filename);

    try {
      await fs.access(filePath);
    } catch {
      error(`❌ Arquivo não encontrado: ${filePath}`);
      continue;
    }

    try {
      const fileBuffer = await fs.readFile(filePath);

      const { error: uploadError } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(`uploads/${filename}`, fileBuffer, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        error(`❌ Erro ao fazer upload de ${filename}:`, uploadError);
        continue;
      }

      log(`✅ Arquivo ${filename} enviado para o bucket.`);

      const { error: updateError } = await supabase
        .from("job_metrics")
        .update({ uploaded: true })
        .eq("job_id", job_id);

      if (updateError) {
        error("❌ Erro ao atualizar flag uploaded:", updateError);
        continue;
      }

      await fs.unlink(filePath);
      log(`🗑️ Arquivo local ${filename} deletado.`);

    } catch (err) {
      error(`❌ Erro ao processar upload do arquivo ${filename}:`, err);
    }
  }
}

// Executa a cada 5 minutos
cron.schedule("*/5 * * * *", () => {
  processUploads();
});
