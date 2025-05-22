// src/utils/openaiHelper.js
const fs = require("fs").promises;
const path = require("path");
const OpenAI = require("openai");

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
  const ext = path.extname(filePath).substring(1) || "png";
  const dataUrl = `data:image/${ext};base64,${buffer.toString("base64")}`;

  // Mensagens com content blocks: texto e imagem
  const messages = [
    {
      role: "system",
      content: 
        "Você é um assistente que extrai texto de imagens e detecta se é manuscrito (handwritten) ou impresso (printed). " +
        "Responda apenas com um JSON válido sem formatação extra, sem backticks."
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: 
            "Extraia todo o texto desta imagem e retorne um JSON com chaves 'text' e 'isHandwritten'."
        },
        {
          type: "image_url",
          image_url: { url: dataUrl }
        }
      ]
    }
  ];

  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages
  });

  let raw = resp.choices[0].message.content.trim();
  // Remove code fences caso existam
  raw = raw.replace(/^```(?:json)?\s*/, "").replace(/```$/, "");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Não foi possível parsear JSON da resposta do OpenAI Vision: ${err.message}\nResposta: ${raw}`
    );
  }
}

/**
 * Envia texto para extração de paciente, médico e medicamentos
 */
async function callOpenAIWithText(text, openaiKey, jobId) {
  const client = makeOpenAI(openaiKey);
  const systemPrompt =
    "Você é um assistente que extrai paciente, médico e lista de medicamentos de um texto médico. " +
    "Responda apenas com um JSON válido sem formatação extra, sem backticks.";

  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text }
    ]
  });

  let raw = resp.choices[0].message.content.trim();
  raw = raw.replace(/^```(?:json)?\s*/, "").replace(/```$/, "");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Não foi possível parsear JSON da resposta do OpenAI Text: ${err.message}\nResposta: ${raw}`
    );
  }
}

module.exports = {
  callOpenAIWithVision,
  callOpenAIWithText,
};
