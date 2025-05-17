const jwt = require("jsonwebtoken");
const { supabase } = require("../utils/supabaseClient");

const SECRET = process.env.JWT_SECRET;

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("❌ Token Bearer não fornecido");
    return res.status(401).json({ detail: "Token Bearer não fornecido" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, SECRET);
    console.log("🔍 Token decodificado:", decoded);

    const { data: client, error } = await supabase
      .from("clientes")
      .select("*")
      .eq("id", decoded.client_id) // ou 'client_id', depende do que está no token
      .single();

    console.log("📦 Cliente retornado do Supabase:", client);

    if (error) console.error("⚠️ Erro Supabase:", error);

    if (error || !client || !client.ativo) {
      console.log("❌ Cliente inválido ou inativo");
      return res.status(403).json({ detail: "Cliente inválido ou inativo" });
    }

    req.client = client;
    next();
  } catch (err) {
    console.error("❌ Erro ao verificar token:", err.message);
    return res.status(401).json({ detail: "Token inválido ou expirado" });
  }
}

module.exports = { authMiddleware };
