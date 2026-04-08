import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

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
    const SYSTEM_JSON = "You output ONLY valid compact single-line JSON. No newlines inside the JSON. No markdown. No backticks. No explanation before or after. Every string value must be concise (under 120 chars). CRITICAL: All companies, profiles, signals, and titles must be specific to the role and skills requested — never default to engineering examples.";
    const raw = await callLLM(prompt + companyList, 8192, SYSTEM_JSON);
    const text = repairJSON(raw);

    res.json({ content: [{ type: "text", text }] });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── /api/source — X-ray candidate sourcing via Serper ───────────────────────
// Three-query strategy per company:
//   Q1: intitle:(seniority title variants) + company + skills OR + location  (precise)
//   Q2: company + roleStem keyword + skills OR + location                    (broader)
//   Q3: intitle:(seniority title variants) + skills OR + location            (no company — catches movers)
// Post-filters: seniority validation + skill validation + relevance scoring
app.post("/api/source", async (req, res) => {
  const { companies, role, skills, seniority, location } = req.body;
  if (!companies?.length || !role) return res.status(400).json({ error: "companies and role are required" });

  const SERPER_KEY = process.env.SERPER_API_KEY;
  if (!SERPER_KEY) return res.status(500).json({ error: "SERPER_API_KEY not configured" });

  const targets = companies.slice(0, 8);
  const normTargets = targets.map(t => t.toLowerCase().replace(/[^a-z0-9]/g, ""));

  const mustSkills = (skills || []).filter(s => s && s.trim()).slice(0, 5);

  // LinkedIn subdomain by location
  const LINKEDIN_SITE = {
    "United States": { site:"linkedin.com/in",    loc:"United States" },
    "Canada":        { site:"ca.linkedin.com/in",  loc:"" },
    "India":         { site:"in.linkedin.com/in",  loc:"" },
    "United Kingdom":{ site:"uk.linkedin.com/in",  loc:"" },
    "Europe":        { site:"linkedin.com/in",     loc:"Europe" },
    "Australia":     { site:"au.linkedin.com/in",  loc:"" },
    "Singapore":     { site:"sg.linkedin.com/in",  loc:"" },
  };
  const locConfig = LINKEDIN_SITE[location] || { site:"linkedin.com/in", loc:"" };
  const site = locConfig.site;

  // Location as OR group — city-level for better recall
  const LOCATION_CITIES = {
    "India":          '(India OR Bangalore OR Bengaluru OR Mumbai OR Pune OR Hyderabad OR Delhi OR Chennai OR Gurugram OR Noida)',
    "United States":  '("United States" OR "San Francisco" OR "New York" OR Seattle OR Austin OR "San Jose" OR Denver OR Boston OR Chicago)',
    "United Kingdom": '("United Kingdom" OR London OR Manchester OR Edinburgh OR Bristol)',
    "Europe":         '(Europe OR London OR Berlin OR Amsterdam OR Paris OR Dublin OR Barcelona OR Stockholm)',
    "Canada":         '(Canada OR Toronto OR Vancouver OR Montreal OR Ottawa)',
    "Australia":      '(Australia OR Sydney OR Melbourne OR Brisbane)',
    "Singapore":      'Singapore',
  };
  const locOR = LOCATION_CITIES[location] || "";
  const locQ = locOR ? ` ${locOR}` : "";

  // Strip seniority prefix from role to get the core title
  const roleStem = role.replace(/^(Intern|Junior|Mid-Level|Senior|Lead|Staff|Principal|Manager|Director|VP|SVP)\s+/i, "").trim();

  // Build seniority-aware title variants for intitle: operator
  // Maps the user's seniority to real LinkedIn title prefixes
  const SENIORITY_TITLES = {
    "Intern":          ["Intern", ""],
    "Junior":          ["Junior", "Associate", ""],
    "Mid-Level":       ["", "Senior"],
    "Senior":          ["Senior", "Lead", ""],
    "Lead":            ["Lead", "Senior", "Staff"],
    "Staff":           ["Staff", "Senior", "Lead", "Principal"],
    "Principal":       ["Principal", "Staff", "Distinguished"],
    "Manager":         ["Manager", "Senior Manager", "Engineering Manager"],
    "Senior Manager":  ["Senior Manager", "Manager", "Director"],
    "Director":        ["Director", "Senior Director", "Head of"],
    "Senior Director": ["Senior Director", "Director", "VP"],
    "VP":              ["VP", "Vice President", "Head of", "Senior Director"],
    "SVP":             ["SVP", "Senior Vice President", "VP"],
    "C-Level":         ["Chief", "CTO", "CIO", "CDO", "President"],
  };

  const titlePrefixes = SENIORITY_TITLES[seniority] || [seniority, ""];
  // Build title strings as simple quoted phrases: "VP Sales", "Vice President Sales", etc.
  const titleVariants = titlePrefixes
    .map(p => p ? `${p} ${roleStem}` : roleStem)
    .filter((v, i, a) => a.indexOf(v) === i); // dedupe

  const mustSkillQuoted = mustSkills.map(s => `"${s}"`);

  // ── Build queries ──
  // KEY: One title variant per query. No intitle: OR groups. Short queries = better Serper results.
  // Strategy: title×company (core), company×fullrole (broad), title×location (global)
  const queryMeta = []; // { query, company, type }

  targets.forEach(company => {
    // For each title variant: "VP Sales" "Salesforce", "Vice President Sales" "Salesforce", etc.
    titleVariants.slice(0, 3).forEach(tv => {
      queryMeta.push({
        query: `site:${site} "${tv}" "${company}"`,
        company, type: "title+company"
      });
    });

    // Full role + company + location (broader — catches variant titles mentioning the role)
    queryMeta.push({
      query: `site:${site} "${company}" "${role}"`,
      company, type: "company+fullrole"
    });

    // If skills exist: company + skill (catches people with right skills at target company)
    if (mustSkillQuoted.length > 0) {
      queryMeta.push({
        query: `site:${site} "${company}" "${roleStem}" ${mustSkillQuoted[0]}`,
        company, type: "company+role+skill"
      });
    }
  });

  // Global queries (no company) — catches people across all companies
  // Use a simple location keyword (first city from the list)
  const locKeyword = location === "United States" ? '"United States"'
    : location === "Europe" ? '"Europe"'
    : location ? `"${location}"` : "";

  titleVariants.slice(0, 2).forEach(tv => {
    queryMeta.push({
      query: locKeyword
        ? `site:${site} "${tv}" ${locKeyword}`
        : `site:${site} "${tv}"`,
      company: "", type: "title+loc"
    });
  });
  if (mustSkillQuoted.length > 0) {
    queryMeta.push({
      query: `site:${site} "${titleVariants[0]}" ${mustSkillQuoted[0]}`,
      company: "", type: "title+skill"
    });
  }

  // Dedupe queries
  const seen2 = new Set();
  const uniqueQueries = queryMeta.filter(m => {
    if (seen2.has(m.query)) return false;
    seen2.add(m.query);
    return true;
  });

  let rawResults = [];
  try {
    const responses = await Promise.all(
      uniqueQueries.map(({ query }) =>
        fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-KEY": SERPER_KEY },
          body: JSON.stringify({ q: query, num: 20 }),
        }).then(r => r.json()).catch(() => ({ organic: [] }))
      )
    );
    rawResults = responses.flatMap((r, i) => {
      const meta = uniqueQueries[i];
      return (r.organic || []).map(item => ({ ...item, _queryCompany: meta.company, _queryType: meta.type }));
    });
    console.log(`[SOURCE] ${uniqueQueries.length} queries → ${rawResults.length} raw results`);
  } catch (err) {
    return res.status(500).json({ error: "Serper search failed: " + err.message });
  }

  // ── Parse candidate from Serper result ──
  function parseCandidate(result) {
    const url = result.link || "";
    if (!url.includes("linkedin.com/in/")) return null;

    const snippet  = result.snippet || "";
    const rawTitle = result.title   || "";

    // LinkedIn title format: "Firstname Lastname - Current Title at Company | LinkedIn"
    const nameMatch = rawTitle.match(/^([^|\-]{2,50}?)(?:\s*[-|]|$)/);
    const name = nameMatch ? nameMatch[1].trim() : "";
    if (!name || name.toLowerCase().includes("linkedin")) return null;

    // Extract current title — between first " - " and " | LinkedIn"
    const titleMatch = rawTitle.match(/\s*-\s*(.+?)(?:\s*\|\s*LinkedIn)?$/i);
    const currentTitle = titleMatch
      ? titleMatch[1].replace(/\s+at\s+.+$/i, "").trim()
      : "";

    // Company: prefer what's in the title "... at Company", fall back to queried company
    const atMatch = rawTitle.match(/\s+at\s+(.+?)(?:\s*\|\s*LinkedIn)?$/i);
    const parsedCompany = atMatch ? atMatch[1].trim() : "";
    const currentCompany = parsedCompany || result._queryCompany || "";

    const emailMatch = snippet.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    const email = emailMatch ? emailMatch[0] : null;

    return { name, currentTitle, currentCompany, linkedinUrl: url, email, snippet, _queryType: result._queryType };
  }

  // ── Seniority validation ──
  // Check if the candidate's title matches the target seniority band
  const SENIORITY_KEYWORDS = {
    "Intern":          { must: ["intern"], block: [] },
    "Junior":          { must: ["junior", "associate", "entry"], block: ["senior", "lead", "staff", "principal", "director", "vp", "head", "chief", "manager"] },
    "Mid-Level":       { must: [], block: ["intern", "junior", "associate", "director", "vp", "head", "chief", "principal"] },
    "Senior":          { must: ["senior", "sr", "lead"], block: ["junior", "intern", "director", "vp", "head", "chief", "principal", "staff", "distinguished"] },
    "Lead":            { must: ["lead", "senior", "staff"], block: ["junior", "intern", "director", "vp", "head", "chief"] },
    "Staff":           { must: ["staff", "principal", "senior", "lead"], block: ["junior", "intern", "associate", "vp", "director", "head", "chief"] },
    "Principal":       { must: ["principal", "staff", "distinguished"], block: ["junior", "intern", "associate", "vp", "chief"] },
    "Manager":         { must: ["manager", "lead"], block: ["intern", "junior", "director", "vp", "chief"] },
    "Senior Manager":  { must: ["senior manager", "manager", "director"], block: ["intern", "junior"] },
    "Director":        { must: ["director", "head"], block: ["intern", "junior", "associate"] },
    "Senior Director": { must: ["senior director", "director", "vp"], block: ["intern", "junior", "associate"] },
    "VP":              { must: ["vp", "vice president", "head", "director"], block: ["intern", "junior", "associate"] },
    "SVP":             { must: ["svp", "senior vice president", "vp"], block: ["intern", "junior", "associate"] },
    "C-Level":         { must: ["chief", "cto", "cio", "cdo", "ceo", "president"], block: ["intern", "junior", "associate"] },
  };

  function matchesSeniority(candidateTitle) {
    if (!candidateTitle || !seniority) return true; // no title to check = let it through
    const t = candidateTitle.toLowerCase();
    const rules = SENIORITY_KEYWORDS[seniority];
    if (!rules) return true;

    // If title contains a blocked keyword, reject
    if (rules.block.some(b => {
      // "senior" shouldn't block "senior manager" when looking for Manager
      // Check as word boundary
      const re = new RegExp(`\\b${b}\\b`, "i");
      return re.test(t);
    })) {
      // Exception: if a must-keyword is also present, don't block
      // e.g. title "Senior Manager" when seniority=Manager — "senior" is in block but "manager" is in must
      if (!rules.must.some(m => t.includes(m))) {
        return false;
      }
    }

    // If must-keywords defined, at least one should appear
    if (rules.must.length > 0) {
      return rules.must.some(m => t.includes(m));
    }
    return true;
  }

  // ── Role relevance filter ──
  // The candidate's title or snippet must mention the role function
  // e.g. for "VP Sales", title/snippet must contain "sales"
  // This prevents "Sr Director Software Engineering" from appearing in a Sales search
  function matchesRole(c) {
    const stemLower = roleStem.toLowerCase();
    // Skip this filter if roleStem is very short/generic (< 3 chars)
    if (stemLower.length < 3) return true;
    const text = [c.currentTitle, c.snippet].join(" ").toLowerCase();
    // Check for the role stem
    if (text.includes(stemLower)) return true;
    // Check individual words of multi-word stems (e.g. "Data Engineer" -> "data" AND "engineer")
    const words = stemLower.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 1) return words.every(w => text.includes(w));
    return false;
  }

  // ── Skill validation ──
  // At least one must-have skill should appear in title or snippet
  function hasRequiredSkill(c) {
    if (!mustSkills.length) return true;
    const text = [c.currentTitle, c.snippet, c.currentCompany].join(" ").toLowerCase();
    return mustSkills.some(skill => {
      const s = skill.toLowerCase();
      if (text.includes(s)) return true;
      // Multi-word skill: all significant words must appear
      const words = s.split(/\s+/).filter(w => w.length > 2);
      return words.length > 1 && words.every(w => text.includes(w));
    });
  }

  // ── Relevance scoring ──
  function scoreCandidate(c) {
    const titleLower = (c.currentTitle || "").toLowerCase();
    const fullText = [c.name, c.currentTitle, c.currentCompany, c.snippet].join(" ").toLowerCase();
    let score = 0;

    // +3 if title contains the role stem
    if (titleLower.includes(roleStem.toLowerCase())) score += 3;

    // +2 for each matching skill
    mustSkills.forEach(skill => {
      if (fullText.includes(skill.toLowerCase())) score += 2;
    });

    // +2 if title matches a seniority variant
    titlePrefixes.forEach(p => {
      if (p && titleLower.includes(p.toLowerCase())) score += 2;
    });

    // +1 if from a target company
    const compNorm = (c.currentCompany || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normTargets.some(t => compNorm.includes(t) || t.includes(compNorm))) score += 1;

    // +1 for title+company+skill query type (highest precision)
    if (c._queryType === "title+company+skill") score += 1;

    return score;
  }

  // ── Assemble results ──
  const seen = new Set();
  const candidates = rawResults
    .map(parseCandidate)
    .filter(Boolean)
    .filter(c => {
      if (seen.has(c.linkedinUrl)) return false;
      seen.add(c.linkedinUrl);
      if (!c.name) return false;
      return true;
    })
    .map(c => ({ ...c, score: scoreCandidate(c) }))
    // Apply filters: role relevance + seniority + skill
    .filter(c => {
      if (!matchesRole(c)) {
        console.log(`[FILTER] Role mismatch: "${c.currentTitle}" (want ${roleStem}) — ${c.name}`);
        return false;
      }
      if (!matchesSeniority(c.currentTitle)) {
        console.log(`[FILTER] Seniority mismatch: "${c.currentTitle}" (want ${seniority}) — ${c.name}`);
        return false;
      }
      if (!hasRequiredSkill(c)) {
        console.log(`[FILTER] Missing skills: ${c.name} — "${c.currentTitle}"`);
        return false;
      }
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
    .map(({ _queryType, ...c }) => c); // strip internal field before sending

  console.log(`[SOURCE] After filters: ${candidates.length} candidates (role: ${role}, seniority: ${seniority}, skills: ${mustSkills.join(", ")||"none"})`);
  res.json({ candidates });
});

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
