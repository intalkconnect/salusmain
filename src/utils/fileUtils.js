// src/utils/fileUtils.js
const fs = require("fs").promises;
const pdfParse = require("pdf-parse");
const { callOpenAIWithVision } = require("./openaiHelper");
const path = require("path");

/**
 * Detecta se uma imagem de prescrição é manuscrita,
 * usando OpenAI Vision.
 */
async function isManuscriptImage(filePath, openaiKey, jobId) {
  const { isHandwritten } = await callOpenAIWithVision(filePath, openaiKey, jobId);
  return isHandwritten;
}

/**
 * Extrai texto de PDF. Primeiro tenta camada de texto nativa via pdf-parse.
 * Se o resultado for muito curto, converte cada página em PNG (via pdf-parse buffer)
 * e manda para OpenAI Vision.
 */
async function extractTextFromPDF(filePath, openaiKey, jobId) {
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);

  if (data.text && data.text.trim().length >= 30) {
    return { text: data.text };
  }

  // Fallback por imagem: extrair páginas como imagens (requer pdf2pic ou similar)
  // (exemplo simplificado: cada buffer é tratado como imagem única)
  const { text } = await callOpenAIWithVision(filePath, openaiKey, jobId);
  return { text };
}

module.exports = {
  isManuscriptImage,
  extractTextFromPDF,
};
