// src/utils/openaiHelper.js
const fs = require("fs").promises;
const path = require("path");
const OpenAI = require("openai");

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

  // Mensagens com content blocks: texto e imagem
  const messages = [
    {
      role: "system",
      content: 
        "Você é um assistente que extrai texto de imagens e detecta se é manuscrito (handwritten) ou impresso (printed). " +
        "Responda apenas com um JSON válido sem formatação extra, sem backticks."
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: 
            "Extraia todo o texto desta imagem e retorne um JSON com chaves 'text' e 'isHandwritten'."
        },
        {
          type: "image_url",
          image_url: { url: dataUrl }
        }
      ]
    }
  ];

  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages
  });

  let raw = resp.choices[0].message.content.trim();
  raw = raw.replace(/^```(?:json)?\s*/, "").replace(/```$/, "");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Não foi possível parsear JSON da resposta do OpenAI Vision: ${err.message}\nResposta: ${raw}`
    );
  }
}

/**
 * Envia texto para extração de paciente, médico e medicamentos
 */
async function callOpenAIWithText(text, openaiKey, jobId) {
  const client = makeOpenAI(openaiKey);
  const systemPrompt = `
Você receberá o texto completo de uma receita magistral. Extraia com exatidão:

- Nome do paciente
- Nome da médica ou médico. Remova títulos como "doutor", "doutora", "dr.", "dra." do resultado final.

⚠️ Para identificar o nome da médica(o), considere todas as possibilidades abaixo:
• Normalmente aparece no topo (header), no final (rodapé) ou como carimbo.
• Pode vir como título destacado, linha em negrito ou com informações como e-mail, CRM, CRN, CRO, COREN, CREFITO etc.
• Pode estar ao lado de palavras como: Nutricionista, Médico(a), Fisioterapeuta, Farmacêutico(a), Psicólogo(a), etc.
• Assinaturas, carimbos ou linhas soltas no final da receita também podem indicar o nome.
• Exemplo de padrões esperados:
  - "Dra. Juliana A. Lima – CRN 5678" → "Juliana A. Lima"
  - "Dr. Pedro Silva CRM/SP 123456" → "Pedro Silva"
  - "Nutricionista: Carla Mendes – CRN 9123" → "Carla Mendes"

- Lista de medicamentos finais (ex: "formula_0", "formula_1", etc.)

Cada medicamento pode conter uma ou mais matérias-primas. NÃO separe por ativo se estiverem na mesma fórmula com mesma posologia e forma.

Para cada medicamento:

• raw_materials: lista de substâncias com os campos:
  - active: nome da substância
  - dose: apenas o número (ex: 5, 200.0)
  - unity: unidade (mg, %, UI, mcg etc.)

• form: forma farmacêutica (ex: cápsula, sachê, pump)
• type: tipo da forma (ex: vegetal), se houver
• posology: modo de uso conforme descrito no texto
• quantity: número total de unidades a serem manipuladas

IMPORTANTE:
- Se a quantidade NÃO estiver explícita, calcule com base na posologia e duração:
  • Interprete variações como:
    - "por 2 meses", "durante 2 meses" = 60 dias
    - "uso contínuo" = 30 dias
    - "por 8 semanas" = 56 dias
    - "por 1 mês", "durante 1 mês" = 30 dias
  • Frequência:
    - "1x ao dia", "uma vez ao dia", "1 cápsula ao dia", "tomar diariamente" = 1 unidade por dia
    - "2x ao dia", "a cada 12h" = 2 unidades por dia
    - "3x ao dia", "a cada 8h" = 3 unidades por dia
  • Exemplo:
    - "Tomar 1 cápsula 2x ao dia por 30 dias" = 60 unidades
    - "Tomar 1 cápsula ao dia por 2 meses" = 60 unidades
    - "Tomar 1 dose ao dia, uso contínuo" = 30 unidades

Se o nome da fórmula não estiver claro, use "formula_0", "formula_1", etc., de forma incremental.

Nunca inclua valores diferentes de número em "dose". Use apenas números como 5, 10.0 etc.
Retorne APENAS um JSON neste formato:

{
  "patient": "Nome do paciente ou null",
  "doctor": "Nome da médica(o) ou null",
  "medications": {
    "formula_0": {
      "raw_materials": [
        { "active": "Naltrexona", "dose": 5, "unity": "mg" },
        { "active": "Topiramato", "dose": 10, "unity": "mg" }
      ],
      "form": "Cápsula",
      "type": "",
      "posology": "Tomar 1 cápsula 2x ao dia por 30 dias",
      "quantity": 60
    }
  }
}

Use null quando não houver valor. Nenhum texto fora do JSON.
`.trim();

  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text }
    ]
  });

  let raw = resp.choices[0].message.content.trim();
  raw = raw.replace(/^```(?:json)?\s*/, "").replace(/```$/, "");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Não foi possível parsear JSON da resposta do OpenAI Text: ${err.message}\nResposta: ${raw}`
    );
  }
}

module.exports = {
  callOpenAIWithVision,
  callOpenAIWithText,
};
