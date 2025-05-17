/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Gera um token JWT baseado em uma API key
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               api_key:
 *                 type: string
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
 *       403:
 *         description: API key inválida ou inativa
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
    return res.status(403).json({ detail: "API key inválida ou cliente inativo" });
  }

  const token = jwt.sign(
    { client_id: client.id },
    SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token });
});

module.exports = router;
