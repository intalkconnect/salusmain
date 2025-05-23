/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Gera um token JWT baseado em uma API key
 *     tags:
 *       - Autenticação
 *     description: |
 *       Realiza a autenticação de um cliente a partir da sua API key.
 *       Se a API key for válida e o cliente estiver ativo, retorna um token JWT que deve ser usado para autenticar futuras requisições nos endpoints protegidos.
 *       
 *       O token gerado é válido por 7 dias, exceto para clientes globais, que possuem token sem expiração.
 *       
 *       ⚠️ Atenção: Apenas clientes ativos podem gerar tokens.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - api_key
 *             properties:
 *               api_key:
 *                 type: string
 *                 description: A API key do cliente
 *     responses:
 *       200:
 *         description: JWT gerado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: O token JWT que deve ser usado para autenticação nas próximas requisições
 *                 expires_in:
 *                   type: integer
 *                   nullable: true
 *                   description: Tempo em segundos até o token expirar (null se não expira)
 *                 expires_at:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                   description: Data e hora em que o token expira no formato ISO8601 (null se não expira)
 *       400:
 *         description: API key não fornecida
 *       403:
 *         description: API key inválida ou cliente inativo
 */

const express = require("express");
const jwt = require("jsonwebtoken");
const { supabase } = require("../utils/supabaseClient");

const router = express.Router();
const SECRET = process.env.JWT_SECRET;

// POST /auth/login
router.post("/", async (req, res) => {
  const { api_key } = req.body;

  if (!api_key) {
    return res.status(400).json({ detail: "api_key é obrigatória" });
  }

  const { data: client, error } = await supabase
    .from("clientes")
    .select("*")
    .eq("api_key", api_key)
    .single();

  if (error || !client || !client.ativo) {
    return res
      .status(403)
      .json({ detail: "API key inválida ou cliente inativo" });
  }

  const payload = {
    client_id: client.id,
    is_global: client.is_global,
  };

  const expiresInSeconds = client.is_global ? null : 7 * 24 * 60 * 60; // 7 dias em segundos
  const token = client.is_global
    ? jwt.sign(payload, SECRET) // 🔥 Global -> Sem expiração
    : jwt.sign(payload, SECRET, { expiresIn: expiresInSeconds });

  res.json({
    token,
    expires_in: expiresInSeconds, // segundos (null se for global)
  });
});

module.exports = router;
