require('dotenv').config();
// src/utils/fileUtils.js
const vision = require("@google-cloud/vision");
const path = require("path");

const credentials = JSON.parse(process.env.GOOGLE_VISION_JSON); // variável com o conteúdo inteiro do JSON

const client = new vision.ImageAnnotatorClient({
  credentials: {
    client_email: credentials.client_email,
    private_key: credentials.private_key,
  },
  projectId: credentials.project_id,
});

async function isManuscriptImage(filePath) {
  try {
    const [result] = await client.documentTextDetection(filePath);

    const annotation = result.fullTextAnnotation;
    const pages = annotation?.pages || [];

    // Detecta manuscrito se o layout indicar baixa confiança geral ou muitos blocos soltos
    const isLikelyHandwritten = pages.some(page =>
      page.blocks?.some(block =>
        block.paragraphs?.some(p =>
          p.confidence !== undefined && p.confidence < 0.6
        )
      )
    );

    return isLikelyHandwritten;
  } catch (err) {
    console.error("Erro ao detectar manuscrito:", err.message);
    return false;
  }
}

module.exports = {
  isManuscriptImage,
  extractTextFromPDF: async (filePath) => {
    const [result] = await client.documentTextDetection(filePath);
    const fullText = result.fullTextAnnotation?.text || "";
    return { text: fullText };
  }
};
