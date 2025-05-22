// src/utils/openaiHelper.js
const fs = require("fs").promises;
const OpenAI = require("openai");   // ➡️  import correto em CJS

/**
 * Cria um client OpenAI com a sua API key
 */
function makeOpenAI(apiKey) {
  return new OpenAI({ apiKey });
}

/**
 * Envia imagem para OCR + classificação manuscrito vs impresso
 */
async function callOpenAIWithVision(filePath, openaiKey, jobId) {
  const client = makeOpenAI(openaiKey);
  const buffer = await fs.readFile(filePath);
  const b64 = buffer.toString("base64");

  // observe a nova forma de chamar o chat-completion
  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",      // ou outro GPT com visão
    messages: [
      {
        role: "system",
        content:
          "Você é um assistente que faz OCR de imagens e classifica se o texto é manuscrito.",
      },
      {
        role: "user",
        content:
          `data:image/png;base64,${b64}\n\n` +
          "1) Retorne JSON { text: string, isHandwritten: boolean }",
      },
    ],
  });

  return JSON.parse(resp.choices[0].message.content);
}

/**
 * Envia texto para extração de paciente, médico e medicamentos
 */
async function callOpenAIWithText(text, openaiKey, jobId) {
  const client = makeOpenAI(openaiKey);
  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Você é um assistente que extrai paciente, médico e lista de medicamentos de um texto médico.",
      },
      { role: "user", content: text },
    ],
  });

  return JSON.parse(resp.choices[0].message.content);
}

module.exports = {
  callOpenAIWithVision,
  callOpenAIWithText,
};
