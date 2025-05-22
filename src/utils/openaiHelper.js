// src/utils/openaiHelper.js
const { OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");
const { log, error } = require("./logger");

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

async function callOpenAIWithVision(filepath, key, jobId) {
  try {
    const ext = path.extname(filepath).toLowerCase();
    const mime =
      [".jpg", ".jpeg", ".png"].includes(ext) ? "image/jpeg" : "application/octet-stream";
    const buffer = fs.readFileSync(filepath);
    const base64 = buffer.toString("base64");

    const openai = new OpenAI({ apiKey: key });
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 1500,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Extraia os dados da receita anexa:" },
            {
              type: "image_url",
              image_url: {
                url: `data:${mime};base64,${base64}`,
              },
            },
          ],
        },
      ],
    });

    const content = response.choices[0].message.content;
    const match = content.match(/\{[\s\S]*\}/);
    const json = match ? JSON.parse(match[0]) : null;

    if (!json || (!json.patient && !json.medications)) {
      log(`👤 Resultado inválido para job ${jobId}`);
      return { status: "human" };
    }

    return json;
  } catch (err) {
    error("Erro Vision:", err);
    return { status: "human" };
  }
}

async function callOpenAIWithText(text, key, jobId) {
  try {
    const openai = new OpenAI({ apiKey: key });
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 1500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
    });

    const content = response.choices[0].message.content;
    const match = content.match(/\{[\s\S]*\}/);
    const json = match ? JSON.parse(match[0]) : null;

    if (!json || (!json.patient && !json.medications)) {
      log(`👤 Resultado inválido para job ${jobId}`);
      return { status: "human" };
    }

    return json;
  } catch (err) {
    error("Erro Text GPT:", err);
    return { status: "human" };
  }
}

module.exports = {
  callOpenAIWithVision,
  callOpenAIWithText,
};
