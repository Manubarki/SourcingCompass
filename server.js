import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import sourceHandler from "./api/source.js";
import intakeHandler from "./api/intake.js";
import enrichHandler from "./api/enrich.js";
import clayHandler from "./api/clay.js";
import githubHandler from "./api/github.js";

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(express.json({ limit: "2mb" }));

app.use(express.static(join(__dirname, "dist"), {
  setHeaders: (res, path) => {
    if (path.endsWith(".js")) res.setHeader("Content-Type", "application/javascript");
    if (path.endsWith(".css")) res.setHeader("Content-Type", "text/css");
  }
}));

// ─── Company memory ───────────────────────────────────────────────────────────
const SHEET_URL = "https://docs.google.com/spreadsheets/d/1IlRq1Qab3ywgA1-r215HIZlh3e3m8Q6RT6kKvMePP4U/export?format=csv&gid=0";
let MEMORY = null;

function parseCSV(text) {
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

async function getMemory() {
  if (MEMORY) return MEMORY;
  try {
    const res = await fetch(SHEET_URL);
    const csv = await res.text();
    MEMORY = parseCSV(csv).map(c => ({
      name: (c.company || c.name || "").trim(),
      cat:  (c.category || "").trim(),
      sub:  (c["sub category"] || c.subcategory || "").trim(),
      fund: (c.funding || "").trim(),
    })).filter(c => c.name);
    return MEMORY;
  } catch { return []; }
}

function getRelevant(companies, role, skills, industries) {
  const kw = [...role.toLowerCase().split(/\s+/), ...skills.map(s=>s.toLowerCase()), ...industries.map(i=>i.toLowerCase())].filter(k=>k.length>2);
  const scored = companies.map(c => {
    const txt = [c.name, c.cat, c.sub].join(" ").toLowerCase();
    return { ...c, score: kw.reduce((n,k) => n+(txt.includes(k)?1:0), 0) };
  });
  const rel = scored.filter(c=>c.score>0).sort((a,b)=>b.score-a.score).slice(0,25);
  const other = scored.filter(c=>c.score===0).sort(()=>Math.random()-0.5).slice(0,5);
  return [...rel,...other].map(c=>[c.name,c.sub||c.cat,c.fund].filter(Boolean).join(" | ")).join("\n");
}

// ─── LLM helpers ─────────────────────────────────────────────────────────────
async function callEndpoint(url, apiKey, model, prompt, maxTokens, systemPrompt) {
  const body = {
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: maxTokens,
  };
  if (systemPrompt) body.system = systemPrompt;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });
  const rawText = await response.text();
  let data;
  try { data = JSON.parse(rawText); }
  catch { throw new Error("Non-JSON: " + rawText.slice(0, 200)); }
  if (!response.ok) throw new Error(data?.error?.message || JSON.stringify(data));
  return data.content?.map(b => b.text || "").join("").trim() || "";
}

const LITELLM_MODEL   = "claude-haiku-4.5";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

async function callLLM(prompt, maxTokens = 8192, systemPrompt = null) {
  if (process.env.LITELLM_API_KEY) {
    try {
      console.log("[LLM] Trying primary (LiteLLM proxy) with", LITELLM_MODEL);
      const result = await callEndpoint("https://llmproxy.atlan.dev/v1/messages", process.env.LITELLM_API_KEY, LITELLM_MODEL, prompt, maxTokens, systemPrompt);
      console.log("[LLM] Primary succeeded.");
      return result;
    } catch (err) {
      console.warn("[LLM] Primary failed:", err.message, "— trying fallback...");
    }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      console.log("[LLM] Trying fallback (Anthropic direct) with", ANTHROPIC_MODEL);
      const result = await callEndpoint("https://api.anthropic.com/v1/messages", process.env.ANTHROPIC_API_KEY, ANTHROPIC_MODEL, prompt, maxTokens, systemPrompt);
      console.log("[LLM] Fallback succeeded.");
      return result;
    } catch (err) {
      throw new Error("Both LLM endpoints failed. Last error: " + err.message);
    }
  }
  throw new Error("No LLM API key configured. Set LITELLM_API_KEY or ANTHROPIC_API_KEY.");
}

// ─── Robust JSON repair ──────────────────────────────────────────────────────
function repairJSON(raw) {
  const s = raw.indexOf("{");
  if (s === -1) return raw;
  const e = raw.lastIndexOf("}");
  let clean = e !== -1 ? raw.slice(s, e + 1) : raw.slice(s);

  clean = clean
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .replace(/,\s*([}\]])/g, "$1");

  try { JSON.parse(clean); return clean; } catch {}

  function tryCloseFrom(str) {
    let trimmed = str.replace(/,\s*$/, "");
    let inStr = false, esc = false, opens = 0, openSq = 0;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') opens++; else if (ch === '}') opens--;
      if (ch === '[') openSq++; else if (ch === ']') openSq--;
    }
    if (inStr) return null;
    const closed = trimmed + "]".repeat(Math.max(0, openSq)) + "}".repeat(Math.max(0, opens));
    try { JSON.parse(closed); return closed; } catch { return null; }
  }

  let result = tryCloseFrom(clean);
  if (result) { console.log("[SERVER] Repaired JSON (close brackets)"); return result; }

  let inStr = false, esc = false, lastSafeComma = -1, depth = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    else if (ch === ',' && depth > 0) lastSafeComma = i;
  }
  if (lastSafeComma === -1) return raw;

  result = tryCloseFrom(clean.slice(0, lastSafeComma));
  if (result) { console.log("[SERVER] Repaired JSON (cut + close)"); return result; }

  console.warn("[SERVER] Could not repair JSON");
  return raw;
}

// ─── /api/generate ────────────────────────────────────────────────────────────
app.post("/api/generate", async (req, res) => {
  try {
    const prompt = req.body.messages?.[0]?.content || "";
    const role = prompt.match(/Role:\s*(.+)/)?.[1] || "";
    const skills = (prompt.match(/Skills:\s*(.+)/)?.[1] || "").split(",").map(s=>s.trim());
    const industries = (prompt.match(/Preferred Industries:\s*(.+)/)?.[1] || "").split(",").map(s=>s.trim());
    const companies = await getMemory();
    const companyList = companies.length > 0
      ? "\n\nREFERENCE COMPANY LIST (tech/data companies) — use as a starting point for Target Companies. You may pick companies from this list OR use other well-known companies that are more relevant to the ROLE above. Adjacent and Wildcards should go beyond this list. IMPORTANT: Describe every company from the perspective of the searched ROLE, not from the company's engineering side. For a VP Sales search, describe sales teams, GTM motions, and revenue signals — NOT engineering infrastructure:\n" + getRelevant(companies, role, skills, industries)
      : "";
    const SYSTEM_JSON = "You output ONLY valid compact single-line JSON. No newlines inside the JSON. No markdown. No backticks. No explanation before or after. Every string value must be concise (under 120 chars). CRITICAL: All companies, profiles, signals, and titles must be specific to the role and skills requested — never default to engineering examples. CRITICAL JSON SAFETY: never put a literal double-quote character (\\\") inside any string value — it breaks the JSON. If you need to quote a term, name, or measurement inline, use single quotes ' instead, or rephrase to avoid quoting entirely.";
    const raw = await callLLM(prompt + companyList, 8192, SYSTEM_JSON);
    const text = repairJSON(raw);

    res.json({ content: [{ type: "text", text }] });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── /api/source, /api/intake, /api/enrich, /api/clay ──────────────────────
// Mounted directly from the Vercel handlers in api/ so both deployment targets
// (Railway via this file, Vercel via api/*.js) share one implementation.
app.post("/api/source", sourceHandler);
app.post("/api/intake", intakeHandler);
app.post("/api/enrich", enrichHandler);
app.post("/api/clay", clayHandler);
app.post("/api/github", githubHandler);

// ─── /api/xray — AI-generated boolean search strings ─────────────────────────
app.post("/api/xray", async (req, res) => {
  try {
    const { role, skills, seniority, location, companies, adjacent, wildcards } = req.body;

    const LINKEDIN_SITE = {
      "United States": "linkedin.com/in", "Canada": "ca.linkedin.com/in",
      "India": "in.linkedin.com/in", "United Kingdom": "uk.linkedin.com/in",
      "Europe": "linkedin.com/in", "Australia": "au.linkedin.com/in", "Singapore": "sg.linkedin.com/in",
    };
    const site = LINKEDIN_SITE[location] || "linkedin.com/in";

    const prompt = `You are an expert recruiter writing Google X-ray search strings for LinkedIn.

Role: ${role}
Seniority: ${seniority}
Location: ${location}
Skills: ${(skills||[]).join(", ")||"not specified"}
Target Companies: ${(companies||[]).slice(0,6).join(", ")||"any"}
LinkedIn site: ${site}

Generate 5 simple, practical X-ray search strings. Each string should be SHORT and actually work in Google.

FORMAT for every string:
site:${site} intitle:(title variants as OR group) (skill/keyword terms) location -recruiter -noise

RULES:
- Always start with site:${site}
- Use intitle:("Title A" OR "Title B" OR "Title C") for job title matching — 3-5 real title alternatives
- Add skill keywords or related technologies as an OR group: ("skill1" OR "skill2" OR "related_tech")
- Add location as a simple keyword (e.g. "United States" or "India")
- End with -recruiter -hiring to filter noise
- Keep strings UNDER 200 characters. Shorter = better results.
- Do NOT nest intitle: inside other operators. Do NOT use AND keyword (it's implicit in Google).

WHAT MAKES EACH STRING DIFFERENT:
1. Title variants + location (broadest — finds anyone with matching title)
2. Title variants + skills/keywords + location (best balance of precision and recall)
3. Title variants + related/adjacent technologies + location (finds people with transferable skills)
4. Target companies OR group + title variants (finds people at specific companies)
5. Title variants + niche ecosystem terms (finds specialists)

For skills, think about what ELSE these people mention on their profiles:
- Alternative names: "Apache Iceberg" → also "Iceberg", "open table format"
- Related tech: "Apache Iceberg" → "Delta Lake", "Apache Hudi", "Lakehouse"
- For non-technical roles: industry terms, methodologies, tools they use

CRITICAL JSON SAFETY: the "query" strings legitimately contain double-quote characters (for exact-phrase matching, e.g. "Senior Engineer" OR "Staff Engineer") — every one of those double quotes MUST be escaped as \\" so the JSON stays valid. Do not use quotes in "label" or "strategy" — rephrase instead.

Return ONLY valid JSON, no markdown:
{
  "strategy": "2-3 sentence paragraph about who to target",
  "strings": [
    {"label": "Short 3-5 word label", "query": "the actual google search string"},
    {"label": "Short 3-5 word label", "query": "the actual google search string"},
    {"label": "Short 3-5 word label", "query": "the actual google search string"},
    {"label": "Short 3-5 word label", "query": "the actual google search string"},
    {"label": "Short 3-5 word label", "query": "the actual google search string"}
  ]
}`;

    const raw = await callLLM(prompt, 2000);

    let result;
    try {
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
      const clean = s !== -1 && e !== -1 ? raw.slice(s, e+1) : raw;
      result = JSON.parse(clean);
    } catch {
      result = { strategy: "", strings: [] };
    }

    res.json(result);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => console.log("SourcingCompass running on port " + PORT));
