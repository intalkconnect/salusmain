require('dotenv').config();
const vision = require("@google-cloud/vision");
const fs = require("fs").promises;
const mime = require("mime-types");

const credentials = JSON.parse(process.env.GOOGLE_VISION_JSON);

const client = new vision.ImageAnnotatorClient({
  credentials: {
    client_email: credentials.client_email,
    private_key: credentials.private_key,
  },
  projectId: credentials.project_id,
});

/**
 * Calcula a área de um bounding box do Google Vision.
 */
function calculateBoundingBoxArea(boundingBox) {
  if (!boundingBox || !boundingBox.vertices) return 0;

  const xValues = boundingBox.vertices.map(v => v.x || 0);
  const yValues = boundingBox.vertices.map(v => v.y || 0);

  const width = Math.max(...xValues) - Math.min(...xValues);
  const height = Math.max(...yValues) - Math.min(...yValues);

  return width * height;
}

async function isManuscriptImage(filePath) {
  try {
    console.log(`🟢 Iniciando análise de manuscrito para: ${filePath}`);

    const [result] = await client.documentTextDetection(filePath);
    const annotation = result.fullTextAnnotation;
    const pages = annotation?.pages || [];

    let totalBlocks = 0;
    let lowConfidenceBlocks = 0;
    let ignoredSmallBlocks = 0;

    for (const page of pages) {
      for (const block of page.blocks || []) {
        const area = calculateBoundingBoxArea(block.boundingBox);
        const confidence = block.confidence ?? 1;

        console.log(`📦 Block -> Area: ${area}, Confidence: ${confidence}`);

        if (area < 10000) {
          ignoredSmallBlocks++;
          console.log("🚫 Block ignorado (pequeno)");
          continue;
        }

        totalBlocks++;

        if (confidence < 0.7) {
          lowConfidenceBlocks++;
          console.log("⚠️ Block marcado como baixa confiança");
        }
      }
    }

    const ratioLowConfidence = totalBlocks > 0 ? lowConfidenceBlocks / totalBlocks : 0;
    const isLikelyHandwritten = ratioLowConfidence > 0.5;

    console.log("===== 📊 Resultado da Análise =====");
    console.log(`Total de blocos válidos: ${totalBlocks}`);
    console.log(`Blocos ignorados (pequenos): ${ignoredSmallBlocks}`);
    console.log(`Blocos baixa confiança: ${lowConfidenceBlocks}`);
    console.log(`Ratio baixa confiança: ${(ratioLowConfidence * 100).toFixed(2)}%`);
    console.log(`Classificação final: ${isLikelyHandwritten ? "🖋️ Manuscrito" : "📄 Digitado"}`);
    console.log("===================================");

    return {
      isHandwritten: isLikelyHandwritten,
      ratioLowConfidence,
      totalBlocks,
      lowConfidenceBlocks,
      ignoredSmallBlocks,
    };
  } catch (err) {
    console.error("❌ Erro ao detectar manuscrito:", err.message);
    return { isHandwritten: false, ratioLowConfidence: 0, totalBlocks: 0 };
  }
}
