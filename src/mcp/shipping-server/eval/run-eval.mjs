import fs from "node:fs";
import path from "node:path";
import { ShippingKnowledgeRepository } from "../rag/repository.mjs";
import { ShippingRagPipeline } from "../rag/pipeline.mjs";

function loadRequiredEnvFromLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 1) continue;
    const key = trimmed.slice(0, idx).trim();
    if (key !== "DATABASE_URL" && key !== "OPENAI_API_KEY") continue;
    if (process.env[key]) continue;
    const raw = trimmed.slice(idx + 1).trim();
    process.env[key] = raw.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
}

function loadCases() {
  const filePath = path.resolve(process.cwd(), "src/mcp/shipping-server/eval/cases.json");
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function pct(n, d) {
  if (!d) return 0;
  return Number(((n / d) * 100).toFixed(2));
}

async function run() {
  loadRequiredEnvFromLocal();
  const cases = loadCases();
  const repository = new ShippingKnowledgeRepository();
  const pipeline = new ShippingRagPipeline(repository);

  let top1 = 0;
  let top3 = 0;
  let ambiguous = 0;
  const misses = [];

  for (const testCase of cases) {
    const result = await pipeline.getBestQuote({ address: testCase.query });
    const bestCode = result.best?.code ?? null;
    const top3Codes = [result.best?.code, ...result.alternatives.slice(0, 2).map((x) => x.code)].filter(Boolean);

    if (bestCode === testCase.expectedCode) top1 += 1;
    if (top3Codes.includes(testCase.expectedCode)) top3 += 1;
    if (result.confidence?.requiresClarification) ambiguous += 1;

    if (bestCode !== testCase.expectedCode) {
      misses.push({
        query: testCase.query,
        expectedCode: testCase.expectedCode,
        got: bestCode,
        top3: top3Codes,
        confidence: result.confidence,
      });
    }
  }

  const summary = {
    total: cases.length,
    top1Accuracy: pct(top1, cases.length),
    top3Recall: pct(top3, cases.length),
    ambiguityRate: pct(ambiguous, cases.length),
    counts: {
      top1Correct: top1,
      top3Hit: top3,
      ambiguous,
    },
    misses,
  };

  console.log(JSON.stringify(summary, null, 2));
  await repository.close();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
