require('dotenv').config();
const vision = require("@google-cloud/vision");
const fs = require("fs").promises;
const mime = require("mime-types");
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

    let totalBlocks = 0;
    let lowConfidenceBlocks = 0;

    for (const page of pages) {
      for (const block of page.blocks || []) {
        totalBlocks++;
        const blockConfidence = block.confidence || 1;
        if (blockConfidence < 0.7) {
          lowConfidenceBlocks++;
        }
      }
    }

    const ratioLowConfidence = totalBlocks > 0 ? lowConfidenceBlocks / totalBlocks : 0;

    const isLikelyHandwritten = ratioLowConfidence > 0.5; // Ajuste conforme teste

    return {
      isHandwritten: isLikelyHandwritten,
      ratioLowConfidence,
      totalBlocks,
    };
  } catch (err) {
    console.error("Erro ao detectar manuscrito:", err.message);
    return { isHandwritten: false, ratioLowConfidence: 0, totalBlocks: 0 };
  }
}


async function extractTextFromPDF(filePath) {
  try {
    const inputConfig = {
      mimeType: mime.lookup(filePath) || "application/pdf",
      content: (await fs.readFile(filePath)).toString("base64"),
    };

    const request = {
      requests: [{
        inputConfig,
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        // ❌ NÃO definimos `pages` para processar TODAS as páginas
      }],
    };

    const [response] = await client.batchAnnotateFiles(request);
    const responses = response.responses?.[0]?.responses || [];

    const text = responses.map(r => r.fullTextAnnotation?.text || "").join("\n");

    return { text };
  } catch (err) {
    console.error("Erro ao extrair texto do PDF via Vision:", err.message);
    return { text: "" };
  }
}

module.exports = {
  isManuscriptImage,
  extractTextFromPDF,
};
