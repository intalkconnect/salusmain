// src/utils/fileUtils.js
const fs = require("fs");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");

async function extractText(filePath, ext) {
  if (["jpg", "jpeg", "png"].includes(ext)) {
    return await extractTextFromImage(filePath);
  } else if (ext === "pdf") {
    return await extractTextFromPDF(filePath);
  } else {
    throw new Error("Formato de arquivo não suportado.");
  }
}

async function extractTextFromPDF(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractTextFromImage(filePath) {
  const { data: { text } } = await Tesseract.recognize(filePath, "por", {
    logger: m => console.log(m) // debug opcional
  });
  return text;
}

module.exports = { extractText };


// src/utils/textParser.js
function normalizeText(text) {
  if (!text) return "";

  text = text.trim().replace(/\s+/g, " ");
  if (text === text.toUpperCase()) {
    text = text.toLowerCase();
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  return text
    .split(" ")
    .map(w => ["mg", "mcg", "ml", "g", "%"].includes(w.toLowerCase()) ? w.toLowerCase() : capitalize(w))
    .join(" ");
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function limparTituloMedico(nome) {
  if (!nome) return null;

  return nome
    .replace(/\b(doutora?|dra?\.?)\b/gi, "")
    .replace(/\bcrm\s*[\d\-]+/gi, "")
    .replace(/\bcrn\s*[\d\-]+/gi, "")
    .replace(/\bcro\s*[\d\-]+/gi, "")
    .replace(/\bcremesp\s*[\d\-]+/gi, "")
    .replace(/[\(\)\[\]#]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function tentarExtrairNomeMedico(texto) {
  if (!texto) return null;

  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const padroes = [
    /(?:Dra\.?|Doutora|Dr\.?|Doutor)[\s\-:]*([A-ZÀ-Úa-zà-ú.\s]+)(?=\s*[\-|–]?\s*(CRM|CRN|CRO|COREN|CREFITO)?\s*\d*)/i,
    /(Nutricionista|Médico|Fisioterapeuta|Farmacêutico|Psicólogo)[\s\-:]*([A-ZÀ-Úa-zà-ú.\s]+)/i,
    /([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3})\s*(CRM|CRN|CRO|COREN|CREFITO)[-/]?\s*\d+/i
  ];

  for (const linha of linhas) {
    for (const padrao of padroes) {
      const match = linha.match(padrao);
      if (match) {
        const nome = match[1] || match[2];
        return limparTituloMedico(nome);
      }
    }
  }

  return null;
}

module.exports = {
  normalizeText,
  limparTituloMedico,
  tentarExtrairNomeMedico
};
