// ─── Shared helpers for Vercel serverless functions ──────────────────────────

const SHEET_URL = "https://docs.google.com/spreadsheets/d/1IlRq1Qab3ywgA1-r215HIZlh3e3m8Q6RT6kKvMePP4U/export?format=csv&gid=0";

export function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/"/g,"").trim().toLowerCase());
  return lines.slice(1).map(line => {
    const cols = []; let cur = "", q = false;
    for (const ch of line) {
      if (ch === '"') { q = !q; continue; }
      if (ch === "," && !q) { cols.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cols[i] || ""; });
    return obj;
  }).filter(r => (r.company || r.name || "").trim());
}

export async function getMemory() {
  try {
    const res = await fetch(SHEET_URL);
    const csv = await res.text();
    return parseCSV(csv).map(c => ({
      name: (c.company || c.name || "").trim(),
      cat:  (c.category || "").trim(),
      sub:  (c["sub category"] || c.subcategory || "").trim(),
      fund: (c.funding || "").trim(),
    })).filter(c => c.name);
  } catch { return []; }
}

export function getRelevant(companies, role, skills, industries) {
  const kw = [...role.toLowerCase().split(/\s+/), ...skills.map(s=>s.toLowerCase()), ...industries.map(i=>i.toLowerCase())].filter(k=>k.length>2);
  const scored = companies.map(c => {
    const txt = [c.name, c.cat, c.sub].join(" ").toLowerCase();
    return { ...c, score: kw.reduce((n,k) => n+(txt.includes(k)?1:0), 0) };
  });
  const rel = scored.filter(c=>c.score>0).sort((a,b)=>b.score-a.score).slice(0,25);
  const other = scored.filter(c=>c.score===0).sort(()=>Math.random()-0.5).slice(0,5);
  return [...rel,...other].map(c=>[c.name,c.sub||c.cat,c.fund].filter(Boolean).join(" | ")).join("\n");
}

// Primary: Atlan LiteLLM proxy — Fallback: Anthropic direct
const LITELLM_MODEL   = "claude-haiku-4.5";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

async function callEndpoint(url, apiKey, model, prompt, maxTokens) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
    }),
  });
  const rawText = await response.text();
  let data;
  try { data = JSON.parse(rawText); }
  catch { throw new Error("Non-JSON: " + rawText.slice(0, 200)); }
  if (!response.ok) throw new Error(data?.error?.message || JSON.stringify(data));
  return data.content?.map(b => b.text || "").join("").trim() || "";
}

export async function callLLM(prompt, maxTokens = 6000) {
  if (process.env.LITELLM_API_KEY) {
    try {
      return await callEndpoint("https://llmproxy.atlan.dev/v1/messages", process.env.LITELLM_API_KEY, LITELLM_MODEL, prompt, maxTokens);
    } catch (err) {
      console.warn("[LLM] Primary failed:", err.message);
    }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return await callEndpoint("https://api.anthropic.com/v1/messages", process.env.ANTHROPIC_API_KEY, ANTHROPIC_MODEL, prompt, maxTokens);
  }
  throw new Error("No LLM API key configured.");
}

export function repairJSON(raw) {
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s === -1 || e === -1) return raw;
  let clean = raw.slice(s, e + 1)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/,\s*([}\]])/g, "$1");
  try { JSON.parse(clean); return clean; } catch {}
  // Try to repair truncated JSON
  const trimmed = clean.slice(0, clean.lastIndexOf(","));
  let opens = 0, openSq = 0;
  for (const ch of trimmed) {
    if (ch === '{') opens++; else if (ch === '}') opens--;
    if (ch === '[') openSq++; else if (ch === ']') openSq--;
  }
  const repaired = trimmed + "]".repeat(Math.max(0,openSq)) + "}".repeat(Math.max(0,opens));
  try { JSON.parse(repaired); return repaired; } catch {}
  return raw;
}
