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

export async function callLLM(prompt, maxTokens = 8192, systemPrompt = null) {
  if (process.env.LITELLM_API_KEY) {
    try {
      return await callEndpoint("https://llmproxy.atlan.dev/v1/messages", process.env.LITELLM_API_KEY, LITELLM_MODEL, prompt, maxTokens, systemPrompt);
    } catch (err) {
      console.warn("[LLM] Primary failed:", err.message);
    }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return await callEndpoint("https://api.anthropic.com/v1/messages", process.env.ANTHROPIC_API_KEY, ANTHROPIC_MODEL, prompt, maxTokens, systemPrompt);
  }
  throw new Error("No LLM API key configured.");
}

// ─── Crustdata — real company + people data (used for market mapping & sourcing) ─
// NOTE: field names below follow Crustdata's publicly documented screener API
// (Authorization: Token <key>, /screener/company, /screener/person/search) as of
// this writing. Verify against your live account/Postman collection if Crustdata
// changes their schema — every call here is defensive (optional chaining, try/catch,
// null on any mismatch) so a schema drift degrades gracefully instead of breaking
// the app; callers should treat a null return as "no enrichment available."
const CRUSTDATA_BASE = "https://api.crustdata.com";

function crustdataHeaders() {
  const key = process.env.CRUSTDATA_API_KEY;
  if (!key) return null;
  return { "Content-Type": "application/json", "Authorization": `Token ${key}` };
}

export function hasCrustdata() {
  return !!process.env.CRUSTDATA_API_KEY;
}

// Real headcount-growth / funding signals for one company — used to back
// poachability with actual data instead of an AI guess (layoffs, hiring freeze,
// funding stress).
export async function crustdataEnrichCompany(nameOrDomain) {
  const headers = crustdataHeaders();
  if (!headers || !nameOrDomain) return null;
  try {
    const isDomain = /\.[a-z]{2,}$/i.test(nameOrDomain.trim());
    const qs = isDomain
      ? `company_domain=${encodeURIComponent(nameOrDomain.trim())}`
      : `company_name=${encodeURIComponent(nameOrDomain.trim())}`;
    const res = await fetch(`${CRUSTDATA_BASE}/screener/company?${qs}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : (data?.results?.[0] || data?.companies?.[0] || null);
    if (!row) return null;

    const growth3m = row.linkedin_headcount_growth_percentage_3_months ?? row.headcount_growth_3m ?? null;
    const growth1y = row.linkedin_headcount_growth_percentage_1_year ?? row.headcount_growth_1y ?? null;
    const headcount = row.employee_count ?? row.linkedin_headcount ?? row.headcount ?? null;
    const funding = row.latest_funding_round_type ?? row.last_funding_round ?? null;
    const fundingDate = row.latest_funding_round_date ?? row.last_funding_date ?? null;

    const signals = [];
    if (typeof growth3m === "number" && growth3m <= -5) signals.push(`[Confirmed] Headcount down ${Math.abs(growth3m)}% over 3 months (Crustdata)`);
    if (typeof growth1y === "number" && growth1y <= -10) signals.push(`[Confirmed] Headcount down ${Math.abs(growth1y)}% over 12 months (Crustdata)`);
    if (typeof growth3m === "number" && growth3m >= 0 && growth3m < 2) signals.push(`[Signal] Hiring has stalled — near-flat headcount growth (Crustdata)`);
    if (typeof growth1y === "number" && growth1y >= 15) signals.push(`[Signal] Headcount up ${growth1y}% over 12 months — fast growth, but also fresh promo/comp pressure (Crustdata)`);

    return { company: nameOrDomain, headcount, growth3m, growth1y, funding, fundingDate, signals, source: "crustdata" };
  } catch {
    return null;
  }
}

// Real candidate search by title/company/region — merged alongside the Serper
// LinkedIn X-ray results in the Sourcing tab.
export async function crustdataPeopleSearch({ title, companies, location, limit = 20 }) {
  const headers = crustdataHeaders();
  if (!headers) return null;
  try {
    const filters = [
      title ? { filter_type: "CURRENT_TITLE", type: "in", value: [title] } : null,
      companies?.length ? { filter_type: "CURRENT_COMPANY", type: "in", value: companies } : null,
      location ? { filter_type: "REGION", type: "in", value: [location] } : null,
    ].filter(Boolean);
    if (!filters.length) return null;

    const res = await fetch(`${CRUSTDATA_BASE}/screener/person/search`, {
      method: "POST", headers, body: JSON.stringify({ filters, page: 1 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const rows = data?.profiles || data?.results || (Array.isArray(data) ? data : []);
    return rows.slice(0, limit).map(p => ({
      name: p.name || [p.first_name, p.last_name].filter(Boolean).join(" "),
      currentTitle: p.current_title || p.title || "",
      currentCompany: p.current_employer || p.company || "",
      linkedinUrl: p.linkedin_profile_url || p.linkedin_url || "",
      location: p.location || p.region || "",
      source: "crustdata",
    })).filter(p => p.name && p.linkedinUrl);
  } catch {
    return null;
  }
}

// ─── Clay — push rows into the user's Clay table for waterfall enrichment ────
// Clay's public integration surface is webhook-based (inbound webhook per table),
// not a synchronous search API, so this fires rows at the configured webhook and
// lets Clay's own workbook do the enrichment — results land in Clay, not back here.
export async function pushToClay(webhookUrl, rows) {
  if (!webhookUrl) throw new Error("No Clay webhook URL configured.");
  if (!rows?.length) throw new Error("No rows to send.");
  const results = await Promise.allSettled(
    rows.map(row =>
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row),
      })
    )
  );
  const delivered = results.filter(r => r.status === "fulfilled" && r.value.ok).length;
  return { sent: rows.length, delivered };
}

// Robust JSON repair — string-aware bracket counting, two-strategy approach.
// Strategy 1: close unclosed brackets directly.
// Strategy 2: cut to last safe comma + close.
export function repairJSON(raw) {
  const s = raw.indexOf("{");
  if (s === -1) return raw;
  const e = raw.lastIndexOf("}");
  let clean = e !== -1 ? raw.slice(s, e + 1) : raw.slice(s);

  clean = clean
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")  // strip control chars (keep \t \n \r)
    .replace(/,\s*([}\]])/g, "$1");                         // trailing commas

  // Happy path
  try { JSON.parse(clean); return clean; } catch {}

  // Helper: try closing unclosed brackets on a fragment
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
    if (inStr) return null; // unterminated string — can't just close
    const closed = trimmed + "]".repeat(Math.max(0, openSq)) + "}".repeat(Math.max(0, opens));
    try { JSON.parse(closed); return closed; } catch { return null; }
  }

  // Strategy 1: close brackets directly
  let result = tryCloseFrom(clean);
  if (result) return result;

  // Strategy 2: cut to last safe structural comma, then close
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
  if (result) return result;

  return raw;
}
