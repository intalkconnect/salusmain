// src/utils/openaiHelper.js
const fs = require("fs").promises;
const path = require("path");
const OpenAI = require("openai");   // ➡️ import correto em CJS

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

  const messages = [
    {
      role: "system",
      content: 
        "Você é um assistente que extrai texto de imagens e detecta se é manuscrito (handwritten) ou impresso (printed)."
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: 
            "Por favor, extraia todo o texto desta imagem e retorne apenas um JSON com chaves 'text' e 'isHandwritten'."
        },
        {
          type: "image_url",
          image_url: { url: dataUrl }
        }
      ]
    }
  ];

  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",      // ou outro GPT com visão
    messages
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
          "Você é um assistente que extrai paciente, médico e lista de medicamentos de um texto médico."
      },
      { role: "user", content: text }
    ]
  });

  return JSON.parse(resp.choices[0].message.content);
}

module.exports = {
  callOpenAIWithVision,
  callOpenAIWithText,
};
