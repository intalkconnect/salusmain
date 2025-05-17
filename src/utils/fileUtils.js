// src/utils/fileUtils.js
const vision = require("@google-cloud/vision");
const path = require("path");

const client = new vision.ImageAnnotatorClient({
  keyFilename: path.resolve(__dirname, "../../credentials/vision-key.json"),
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
