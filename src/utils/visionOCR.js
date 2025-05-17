// src/utils/visionOCR.js
const vision = require("@google-cloud/vision").v1;
const fs = require("fs").promises;
const mime = require("mime-types");

const client = new vision.ImageAnnotatorClient({
  keyFilename: "./credentials/vision-key.json",
});


async function ocrFromImage(filePath) {
  const [result] = await client.textDetection(filePath);
  const detections = result.textAnnotations;
  return detections?.[0]?.description || "";
}

async function ocrFromPDF(filePath) {
  const inputConfig = {
    mimeType: mime.lookup(filePath) || "application/pdf",
    content: (await fs.readFile(filePath)).toString("base64"),
  };

  const request = {
    requests: [{
      inputConfig,
      features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
      pages: [1, 2, 3] // ajuste conforme necessário
    }]
  };

  const [result] = await client.batchAnnotateFiles(request);
  const responses = result.responses?.[0]?.responses || [];
  return responses.map(r => r.fullTextAnnotation?.text || "").join("\n");
}

module.exports = { ocrFromImage, ocrFromPDF };
