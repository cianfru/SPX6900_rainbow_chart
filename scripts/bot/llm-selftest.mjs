// One-shot diagnostic: makes a REAL draftCopy() call on a synthetic signal so we
// can confirm the OpenRouter key + model + validation pipeline work end-to-end,
// WITHOUT waiting for a live anomaly and WITHOUT posting or committing anything.
// Run in CI via the "LLM copy self-test" workflow (needs OPENROUTER_API_KEY), or
// locally with the key exported. Prints the draft + a PASS/FAIL/SKIP line.
import { draftCopy } from "./llm-copy.mjs";

// Real-shaped numbers (mirrors a diamond-jump signal) so the model has honest
// facts to work from — the same contract the daily detector uses.
const signal = {
  type: "diamond-jump", emoji: "💎", severity: 3,
  title: "Diamond share up +0.9pp → 60.9%",
  detail: "571,000,000 SPX now in the longest-held tier.",
  framing: "8M SPX just aged into diamond hands — coins reach the tier only by being held through everything, conviction deepening.",
  note: "Word it as HELD, not BOUGHT: the +8M came from a cohort aging in from gold, not fresh demand.",
  card: "diamondtrend",
};

const hasKey = !!process.env.OPENROUTER_API_KEY;
console.log(`OPENROUTER_API_KEY: ${hasKey ? "set" : "MISSING"} · OPENROUTER_MODEL: ${process.env.OPENROUTER_MODEL || "(default)"}`);

const d = await draftCopy(signal);
console.log(`model: ${d.model} · mock: ${d.mock} · ok: ${d.ok}${d.reason ? ` · reason: ${d.reason}` : ""}`);
console.log("--- draft ---");
console.log(d.text || "(none)");
console.log("-------------");

if (!hasKey) console.log("RESULT: SKIP — no OPENROUTER_API_KEY in this env (mock path). Set the secret to test the real call.");
else if (!d.mock && d.ok) console.log("RESULT: PASS — real OpenRouter draft generated and validated ✅");
else console.log(`RESULT: FAIL — the real call did not yield a valid draft (${d.reason || "unknown"}). Check the key, or override OPENROUTER_MODEL if the model is down/rate-limited.`);
