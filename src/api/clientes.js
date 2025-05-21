const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { supabase } = require("../utils/supabaseClient");
const { authMiddleware } = require("./auth");

const router = express.Router();

// DELETE /clientes/:id
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ detail: "Erro interno no DELETE", error: err.message });
  }
});

// GET /clientes
router.get("/", authMiddleware, async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ detail: "Erro interno no GET /clientes", error: err.message });
  }
});

async function countJobs(clientId, start, end = null) {
  let query = supabase
    .from("recipe_lines")
    .select("job_id")
    .eq("client_id", clientId)
    .gte("created_at", start);

  if (end) query = query.lte("created_at", end);

  const { data, error } = await query;
  if (error) return 0;

  return new Set(data?.map((r) => r.job_id)).size;
}

// POST /clientes
router.post("/", authMiddleware, async (req, res) => {
  try {
    const client = req.client;
    if (!client.is_global) {
      return res.status(403).json({ detail: "Apenas global API key pode criar clientes" });
    }

    const { nome, openai_key, api_key } = req.body;

    if (!nome || !openai_key || !api_key) {
      return res.status(400).json({ detail: "Campos obrigatórios: nome, openai_key, api_key" });
    }

    const { data: existing } = await supabase
      .from("clientes")
      .select("id")
      .eq("api_key", api_key)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ detail: "API key já cadastrada" });
    }

    const { data, error } = await supabase.from("clientes").insert([
      {
        id: uuidv4(),
        nome,
        openai_key,
        api_key,
        ativo: true,
      },
    ]);

    if (error) {
      return res.status(500).json({ detail: "Erro ao criar cliente no banco", error });
    }

    res.status(201).json({ ...data[0], uso: 0, uso_atual: 0, uso_anterior: 0 });
  } catch (err) {
    res.status(500).json({ detail: "Erro interno no POST /clientes", error: err.message });
  }
});

// PATCH /clientes/:id
router.patch("/:id", authMiddleware, async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ detail: "Erro interno no PATCH /clientes", error: err.message });
  }
});

// GET /clientes/metrics
router.get("/metrics", authMiddleware, async (req, res) => {
  try {
    const client = req.client;

    if (!client.is_global) {
      return res.status(403).json({ detail: "Apenas global API key pode acessar métricas" });
    }

    const { data: rows, error } = await supabase
      .from("job_metrics")
      .select("*")
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
      sucessos: success,
      falhas: fail,
      por_tipo_arquivo: byType,
      por_tipo_erro: byError,
      tempo_medio_processamento_segundos: avgProcessingTimeSec,
    });
  } catch (err) {
    res.status(500).json({ detail: "Erro interno no GET /clientes/metrics", error: err.message });
  }
});

module.exports = router;
