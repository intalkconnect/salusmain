const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { supabase } = require("../utils/supabaseClient");
const { authMiddleware } = require("./auth");

const router = express.Router();

/**
 * @swagger
 * /clientes/{id}:
 *   delete:
 *     summary: Exclui um cliente
 *     description: Exclui permanentemente um cliente do sistema. Restrito a API Keys globais.
 *     tags:
 *       - Clientes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do cliente
 *     responses:
 *       204:
 *         description: Cliente excluído com sucesso
 *       403:
 *         description: Acesso negado
 *       500:
 *         description: Erro interno
 */

// DELETE /clientes/:id
router.delete("/:id", authMiddleware, async (req, res) => {
  const client = req.client;
  if (!client.is_global) {
    return res.status(403).json({ detail: "Apenas global API key pode excluir clientes" });
  }

  const clienteId = req.params.id;

  const { error } = await supabase
    .from("clientes")
    .delete()
    .eq("id", clienteId);

  if (error) {
    return res.status(500).json({ detail: "Erro ao excluir cliente", error });
  }

  res.status(204).send();
});

/**
 * @swagger
 * /clientes:
 *   get:
 *     summary: Lista todos os clientes
 *     tags:
 *       - Clientes
 *     security:
 *       - bearerAuth: []
 *     description: Retorna todos os clientes e estatísticas de uso (últimos 30 dias, mês atual e mês anterior). Restrito a API Keys globais.
 *     responses:
 *       200:
 *         description: Lista de clientes
 *       403:
 *         description: Acesso negado
 *       500:
 *         description: Erro ao buscar clientes
 */

// GET /clientes
router.get("/", authMiddleware, async (req, res) => {
  const client = req.client;
  if (!client.is_global) {
    return res.status(403).json({ detail: "Apenas global API key pode listar clientes" });
  }

  const { data: clientes, error } = await supabase.from("clientes").select("*");

  if (error) {
    return res.status(500).json({ detail: "Erro ao buscar clientes", error });
  }

  const now = new Date();
  const start30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

  for (const c of clientes) {
    c.uso = await countJobs(c.id, start30d);
    c.uso_atual = await countJobs(c.id, startMonth);
    c.uso_anterior = await countJobs(c.id, startLastMonth, endLastMonth);
  }

  res.json(clientes);
});

// Função auxiliar para contar jobs
async function countJobs(clientId, start, end = null) {
  let query = supabase
    .from("recipe_lines")
    .select("job_id")
    .eq("client_id", clientId)
    .gte("created_at", start);

  if (end) {
    query = query.lte("created_at", end);
  }

  const { data, error } = await query;
  if (error) return 0;

  return new Set(data?.map((r) => r.job_id)).size;
}

/**
 * @swagger
 * /clientes:
 *   post:
 *     summary: Cria um novo cliente
 *     description: Cria um novo cliente com as chaves de API necessárias. Restrito a API Keys globais.
 *     tags:
 *       - Clientes
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - openai_key
 *               - api_key
 *             properties:
 *               nome:
 *                 type: string
 *               api_key:
 *                 type: string
 *     responses:
 *       201:
 *         description: Cliente criado
 *       400:
 *         description: Dados inválidos ou API key já cadastrada
 *       403:
 *         description: Acesso negado
 *       500:
 *         description: Erro interno
 */

// POST /clientes
router.post("/", authMiddleware, async (req, res) => {
  const client = req.client;
  if (!client.is_global) {
    return res.status(403).json({ detail: "Apenas global API key pode criar clientes" });
  }

  const { nome, api_key } = req.body;

  // Validação de campos obrigatórios
  if (!api_key) {
    return res.status(400).json({ detail: "Campos obrigatórios: api_key" });
  }

  // Verificar duplicidade de api_key
  const { data: existing, error: existingError } = await supabase
    .from("clientes")
    .select("id")
    .eq("api_key", api_key)
    .maybeSingle();

  if (existingError) {
    return res.status(500).json({ detail: "Erro ao verificar API key", error: existingError });
  }

  if (existing) {
    return res.status(400).json({ detail: "API key já cadastrada" });
  }

  // Inserir novo cliente
  const { data, error } = await supabase.from("clientes").insert([
    {
      id: uuidv4(),
      nome,
      api_key,
      ativo: true,
    },
  ])
  .select();

  if (error) {
    return res.status(500).json({ detail: "Erro ao criar cliente no banco", error });
  }

  if (!data || !data.length) {
    return res.status(500).json({ detail: "Cliente não foi criado corretamente", data });
  }

  res.status(201).json({ ...data[0], uso: 0, uso_atual: 0, uso_anterior: 0 });
});

/**
 * @swagger
 * /clientes/{id}:
 *   patch:
 *     summary: Atualiza um cliente
 *     description: Atualiza as informações de um cliente existente, como nome, status (ativo/inativo) e suas chaves API. Restrito a API Keys globais.
 *     tags:
 *       - Clientes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do cliente
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *               api_key:
 *                 type: string
 *               ativo:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Cliente atualizado
 *       403:
 *         description: Acesso negado
 *       500:
 *         description: Erro interno
 */

// PATCH /clientes/:id
router.patch("/:id", authMiddleware, async (req, res) => {
  const client = req.client;
  if (!client.is_global) {
    return res.status(403).json({ detail: "Apenas global API key pode atualizar clientes" });
  }

  const clienteId = req.params.id;
  const update = req.body;

  const { error: updateError } = await supabase
    .from("clientes")
    .update(update)
    .eq("id", clienteId);

  if (updateError) {
    return res.status(500).json({ detail: "Erro ao atualizar cliente", error: updateError });
  }

  const { data: cliente, error } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", clienteId)
    .single();

  if (error) {
    return res.status(500).json({ detail: "Erro ao buscar cliente atualizado", error });
  }

  cliente.uso = await countJobs(
    clienteId,
    new Date(Date.now() - 30 * 86400 * 1000).toISOString()
  );
  cliente.uso_atual = await countJobs(
    clienteId,
    new Date(cliente.created_at).toISOString()
  );
  cliente.uso_anterior = 0;

  res.json(cliente);
});

/**
 * @swagger
 * /clientes/metrics:
 *   get:
 *     summary: Retorna métricas dos jobs processados
 *     description: Permite visualizar quantidade de jobs, sucesso, falha, tempo médio e agrupamento por tipo de arquivo e tipo de erro. Restrito a API Keys globais.
 *     security:
 *       - bearerAuth: []
 *     tags:
 *       - Métricas
 *     responses:
 *       200:
 *         description: Métricas retornadas com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_jobs:
 *                   type: integer
 *                   example: 100
 *                 sucessos:
 *                   type: integer
 *                   example: 80
 *                 falhas:
 *                   type: integer
 *                   example: 20
 *                 por_tipo_arquivo:
 *                   type: object
 *                   additionalProperties:
 *                     type: integer
 *                   example: { pdf: 50, jpg: 30, png: 20 }
 *                 por_tipo_erro:
 *                   type: object
 *                   additionalProperties:
 *                     type: integer
 *                   example: { "arquivo_invalido": 5, "timeout_openai": 10 }
 *                 tempo_medio_processamento_segundos:
 *                   type: number
 *                   example: 12.5
 *       403:
 *         description: Apenas API keys globais podem acessar este endpoint.
 *       500:
 *         description: Erro interno ao buscar métricas.
 */

// GET /clientes/metrics
router.get("/metrics", authMiddleware, async (req, res) => {
  const client = req.client;
  if (!client.is_global) {
    return res.status(403).json({ detail: "Apenas global API key pode acessar métricas" });
  }

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data: rows, error } = await supabase
    .from("job_metrics")
    .select("*")
    .gte("created_at", currentMonthStart) // 🔥 Filtro para o mês atual
    .order("created_at", { ascending: false });

  if (error) {
    return res.status(500).json({ detail: "Erro ao buscar métricas", error });
  }

  const total = rows.length;
  const success = rows.filter((r) => r.status === "sucesso").length;
  const fail = total - success;

  const byType = {};
  const byError = {};

  let totalDuration = 0;
  let countWithTime = 0;

  for (const r of rows) {
    const type = r.file_type || "desconhecido";
    byType[type] = (byType[type] || 0) + 1;

    if (r.status === "falha") {
      const err = r.error_type || "erro_desconhecido";
      byError[err] = (byError[err] || 0) + 1;
    }

    if (r.started_at && r.ended_at) {
      const start = new Date(r.started_at).getTime();
      const end = new Date(r.ended_at).getTime();
      const diff = (end - start) / 1000;
      if (!isNaN(diff)) {
        totalDuration += diff;
        countWithTime++;
      }
    }
  }

  const avgProcessingTimeSec = countWithTime > 0 ? totalDuration / countWithTime : null;

  res.json({
    total_jobs: total,
    success: success,
    failures: fail,
    by_file_type: byType,
    by_error_type: byError,
    avg_processing_time_seconds: avgProcessingTimeSec,
  });
});

/**
 * @swagger
 * /clientes/{id}/metrics:
 *   get:
 *     summary: Retorna métricas dos jobs processados para um cliente
 *     description: Permite visualizar quantidade de jobs, sucesso, falha, tempo médio e agrupamento por tipo de arquivo e tipo de erro no mês atual, além do total de jobs no mês anterior. Restrito a API Keys globais.
 *     security:
 *       - bearerAuth: []
 *     tags:
 *       - Métricas
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID do cliente
 *     responses:
 *       200:
 *         description: Métricas retornadas com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_jobs:
 *                   type: integer
 *                 success:
 *                   type: integer
 *                 failures:
 *                   type: integer
 *                 by_file_type:
 *                   type: object
 *                   additionalProperties:
 *                     type: integer
 *                 by_error_type:
 *                   type: object
 *                   additionalProperties:
 *                     type: integer
 *                 avg_processing_time_seconds:
 *                   type: number
 *                 total_jobs_prev_month:
 *                   type: integer
 *       403:
 *         description: Acesso negado
 *       500:
 *         description: Erro interno
 */

// GET /clientes/:id/metrics
router.get("/:id/metrics", authMiddleware, async (req, res) => {
  const client = req.client;
  if (!client.is_global) {
    return res.status(403).json({ detail: "Only global API key can access metrics." });
  }

  const client_id = req.params.id;

  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  // Buscar job_metrics do mês atual
  const { data: currentJobs, error: errorCurrent } = await supabase
    .from("job_metrics")
    .select("*")
    .eq("client_id", client_id)
    .gte("created_at", currentMonthStart.toISOString())
    .lte("created_at", now.toISOString());

  if (errorCurrent) {
    return res.status(500).json({ detail: "Error fetching current month job metrics.", error: errorCurrent });
  }

  // Buscar job_metrics do mês anterior
  const { count: previousCount, error: errorPrevious } = await supabase
    .from("job_metrics")
    .select("*", { count: "exact", head: true })
    .eq("client_id", client_id)
    .gte("created_at", previousMonthStart.toISOString())
    .lte("created_at", previousMonthEnd.toISOString());

  if (errorPrevious) {
    return res.status(500).json({ detail: "Error fetching previous month metrics.", error: errorPrevious });
  }

  // Buscar recipe_lines do cliente
  const { data: recipeLines, error: errorRecipe } = await supabase
    .from("recipe_lines")
    .select("id, created_at, form, posology")
    .eq("client_id", client_id)
    .gte("created_at", currentMonthStart.toISOString())
    .lte("created_at", now.toISOString());

  if (errorRecipe) {
    return res.status(500).json({ detail: "Error fetching recipe lines.", error: errorRecipe });
  }

  // Processamento das métricas
  const total = currentJobs.length;
  const success = currentJobs.filter((r) => r.status === "sucesso").length;
  const failures = total - success;

  const byFileType = {};
  const byErrorType = {};
  const jobsByWeekday = {
    Sunday: 0,
    Monday: 0,
    Tuesday: 0,
    Wednesday: 0,
    Thursday: 0,
    Friday: 0,
    Saturday: 0,
  };

  let totalDuration = 0;
  let countWithTime = 0;
  let maxDuration = null;
  let minDuration = null;

  for (const r of currentJobs) {
    const type = r.file_type || "unknown";
    byFileType[type] = (byFileType[type] || 0) + 1;

    if (r.status === "falha") {
      const err = r.error_type || "unknown_error";
      byErrorType[err] = (byErrorType[err] || 0) + 1;
    }

    if (r.started_at && r.ended_at) {
      const start = new Date(r.started_at).getTime();
      const end = new Date(r.ended_at).getTime();
      const diff = (end - start) / 1000;

      if (!isNaN(diff)) {
        totalDuration += diff;
        countWithTime++;

        if (maxDuration === null || diff > maxDuration) maxDuration = diff;
        if (minDuration === null || diff < minDuration) minDuration = diff;
      }

      const day = new Date(r.created_at).toLocaleDateString('en-US', { weekday: 'long' });
      jobsByWeekday[day] = (jobsByWeekday[day] || 0) + 1;
    }
  }

  const avgProcessingTimeSec = countWithTime > 0 ? totalDuration / countWithTime : null;

  // Top 10 Formas Farmacêuticas
  const formCount = {};
  for (const r of recipeLines) {
    const form = r.form?.toLowerCase() || "unknown";
    formCount[form] = (formCount[form] || 0) + 1;
  }
  const topForms = Object.entries(formCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([form, count]) => ({ form, count }));

  // Principais Posologias
  const posologyCount = {};
  for (const r of recipeLines) {
    const pos = r.posology?.toLowerCase() || "unknown";
    posologyCount[pos] = (posologyCount[pos] || 0) + 1;
  }
  const topPosologies = Object.entries(posologyCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([posology, count]) => ({ posology, count }));

  // Resultado final
  res.json({
    total_jobs: total,
    success: success,
    failures: failures,
    by_file_type: byFileType,
    by_error_type: byErrorType,
    avg_processing_time_seconds: avgProcessingTimeSec,
    max_processing_time_seconds: maxDuration,
    min_processing_time_seconds: minDuration,
    total_jobs_prev_month: previousCount || 0,
    jobs_by_weekday: jobsByWeekday,
    top_forms: topForms,
    top_posologies: topPosologies,
  });
});



module.exports = router;
