// src/utils/openaiHelper.js
const fs = require("fs").promises;
const { Configuration, OpenAIApi } = require("openai");

function makeOpenAI(apiKey) {
  const cfg = new Configuration({ apiKey });
  return new OpenAIApi(cfg);
}

/**
 * Envia uma imagem para OpenAI Vision para OCR e classificação de manuscrito.
 * @param {string} filePath 
 * @param {string} openaiKey 
 * @param {string} jobId 
 */
async function callOpenAIWithVision(filePath, openaiKey, jobId) {
  const client = makeOpenAI(openaiKey);
  const img = await fs.readFile(filePath);
  const b64 = img.toString("base64");
  // Construímos uma prompt que pede OCR + detecção de manuscrito
  const messages = [
    { role: "system", content: "Você é um assistente que extrai texto e identifica se é manuscrito (handwritten) ou impresso (printed)." },
    { role: "user", content: 
      `ImageBase64:${b64}\n\n` +
      "1) Retorne JSON com chave `text`: todo texto extraído.\n" +
      "2) chave `isHandwritten`: true se o texto for manuscrito, false caso contrário."
    }
  ];
  const resp = await client.createChatCompletion({
    model: "gpt-4o-mini", // ou outro modelo vision-enabled
    messages
  });
  const content = resp.data.choices[0].message.content;
  return JSON.parse(content);
}

/**
 * Envia texto bruto para o modelo de chat da OpenAI para extrair paciente, médico e medicamentos.
 */
async function callOpenAIWithText(text, openaiKey, jobId) {
  const client = makeOpenAI(openaiKey);
  const messages = [
    { role: "system", content: "Você é um assistente que extrai paciente, médico e lista de medicamentos de um texto de prescrição médica." },
    { role: "user", content: text }
  ];
  const resp = await client.createChatCompletion({
    model: "gpt-4o-mini",
    messages
  });
  return JSON.parse(resp.data.choices[0].message.content);
}

module.exports = {
  callOpenAIWithVision,
  callOpenAIWithText,
};
