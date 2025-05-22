require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const { OpenAI } = require('openai');
const { PdfConverter } = require('pdf-poppler');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Verifica se um PDF tem texto embutido (digitado) ou é escaneado (imagem).
 * Se tiver pouco texto (<30 caracteres), assume que é escaneado.
 */
async function isPdfScanned(filePath) {
  const dataBuffer = await fs.promises.readFile(filePath);
  const data = await pdf(dataBuffer);

  const texto = (data.text || "").trim();
  console.log(`🔍 Texto detectado no PDF: ${texto.length} caracteres`);

  return texto.length < 30; // Ajuste se necessário
}

/**
 * Converte um PDF escaneado em uma ou mais imagens (uma por página).
 * Retorna um array de paths para as imagens geradas.
 */
async function convertPdfToImages(pdfPath) {
  const outputDir = path.dirname(pdfPath);
  const opts = {
    format: 'jpeg',
    out_dir: outputDir,
    out_prefix: path.basename(pdfPath, path.extname(pdfPath)),
    page: null, // null = todas as páginas
  };

  const converter = new PdfConverter(pdfPath);
  const result = await converter.convert(opts);

  console.log(`🖼️ PDF convertido em imagens:`, result);
  return result;
}

/**
 * Processa um PDF com texto embutido, extraindo o texto e interpretando com OpenAI (GPT).
 */
async function processPdfWithOpenAI(filePath) {
  const dataBuffer = await fs.promises.readFile(filePath);
  const data = await pdf(dataBuffer);
  const texto = (data.text || "").trim();

  if (!texto) {
    throw new Error("Nenhum texto detectado no PDF.");
  }

  const prompt = getOpenAIPrompt();

  const response = await openai.chat.completions.create({
    model: "gpt-4o", // ou gpt-4-turbo
    messages: [{ role: "user", content: `${prompt}\n\n${texto}` }],
    max_tokens: 4000,
  });

  const content = response.choices[0].message.content;
  console.log("📜 Resposta OpenAI (PDF texto):", content);

  return parseOpenAIResponse(content);
}

/**
 * Processa uma imagem (ou PDF convertido em imagem) com OpenAI Vision.
 */
async function processImageWithOpenAI(filepath) {
  const fileData = await fs.promises.readFile(filepath);
  const base64 = fileData.toString('base64');

  const prompt = getOpenAIPrompt();

  const response = await openai.chat.completions.create({
    model: "gpt-4o", // ou gpt-4-turbo
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: `data:image/jpeg;base64,${base64}` }
        ]
      }
    ],
    max_tokens: 4000,
  });

  const content = response.choices[0].message.content;
  console.log("🖼️ Resposta OpenAI (Imagem):", content);

  return parseOpenAIResponse(content);
}

/**
 * Prompt padronizado para extrair informações e classificar manuscrito/digitado.
 */
function getOpenAIPrompt() {
  return `
Você está analisando um documento médico. Execute os seguintes passos:

1. Verifique se o documento é manuscrito (escrito à mão) ou digitado (impresso ou digital).
   - Se for manuscrito ou estiver ilegível, responda:
     CLASSIFICACAO: manuscrito
   - Se for digitado, responda:
     CLASSIFICACAO: digitado

2. Se for digitado, extraia as seguintes informações:
   - Nome do paciente
   - Nome do médico
   - Fórmulas, ativos, dosagens, unidades, forma farmacêutica, posologia, quantidade

Formato da resposta:
CLASSIFICACAO: [manuscrito|digitado]

Se for digitado:
{
  "patient": "Nome do paciente",
  "doctor": "Nome do médico",
  "medications": {
    "nome_da_formula": {
      "raw_materials": [
        { "active": "nome do ativo", "dose": X, "unity": "mg" }
      ],
      "form": "",
      "type": "",
      "posology": "",
      "quantity": ""
    }
  }
}
`.trim();
}

/**
 * Faz o parser da resposta textual da OpenAI e extrai dados estruturados.
 */
function parseOpenAIResponse(content) {
  const classificacaoMatch = /CLASSIFICACAO:\s*(manuscrito|digitado)/i.exec(content);
  const classificacao = classificacaoMatch?.[1]?.toLowerCase() || "indefinido";

  let jsonData = {};
  try {
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const jsonString = content.substring(jsonStart, jsonEnd + 1);
      jsonData = JSON.parse(jsonString);
    }
  } catch (err) {
    console.warn("⚠️ Erro ao fazer parse do JSON da OpenAI:", err);
  }

  return {
    classificacao,
    ...jsonData,
    rawResponse: content,
  };
}

module.exports = {
  isPdfScanned,
  convertPdfToImages,
  processPdfWithOpenAI,
  processImageWithOpenAI,
};
