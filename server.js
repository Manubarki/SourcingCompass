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

const LITELLM_MODEL   = "claude-haiku-4.5";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

async function callLLM(prompt, maxTokens = 6000) {
  if (process.env.LITELLM_API_KEY) {
    try {
      console.log("[LLM] Trying primary (LiteLLM proxy) with", LITELLM_MODEL);
      const result = await callEndpoint("https://llmproxy.atlan.dev/v1/messages", process.env.LITELLM_API_KEY, LITELLM_MODEL, prompt, maxTokens);
      console.log("[LLM] Primary succeeded.");
      return result;
    } catch (err) {
      console.warn("[LLM] Primary failed:", err.message, "— trying fallback...");
    }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      console.log("[LLM] Trying fallback (Anthropic direct) with", ANTHROPIC_MODEL);
      const result = await callEndpoint("https://api.anthropic.com/v1/messages", process.env.ANTHROPIC_API_KEY, ANTHROPIC_MODEL, prompt, maxTokens);
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
      ? "\n\nVERIFIED COMPANY LIST — for Target Companies ONLY use companies from this list. Adjacent and Wildcards may go beyond this list but must still be real, active companies:\n" + getRelevant(companies, role, skills, industries)
      : "";
    const raw = await callLLM(prompt + companyList);
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
  // Build actual title strings: "Staff Data Engineer", "Senior Data Engineer", etc.
  const titleVariants = titlePrefixes
    .map(p => p ? `"${p} ${roleStem}"` : `"${roleStem}"`)
    .filter((v, i, a) => a.indexOf(v) === i); // dedupe
  const titleOR = titleVariants.length > 1
    ? `(${titleVariants.join(" OR ")})`
    : titleVariants[0];

  // Skills as OR group — any one skill match is sufficient for a query hit
  const skillsOR = mustSkills.length > 1
    ? `(${mustSkills.map(s => `"${s}"`).join(" OR ")})`
    : mustSkills.length === 1 ? `"${mustSkills[0]}"` : "";

  // Build queries — 3 strategies per company
  const queryMeta = []; // { query, company, type }

  targets.forEach(company => {
    // Q1: intitle: with seniority title variants + company + skills + location (most precise)
    if (skillsOR) {
      queryMeta.push({
        query: `site:${site} intitle:${titleOR} "${company}" ${skillsOR}${locQ} -recruiter -hiring -consultant`,
        company, type: "title+company+skill"
      });
    } else {
      queryMeta.push({
        query: `site:${site} intitle:${titleOR} "${company}"${locQ} -recruiter -hiring -consultant`,
        company, type: "title+company"
      });
    }

    // Q2: company + roleStem keyword + skills (broader — catches non-standard titles)
    if (skillsOR) {
      queryMeta.push({
        query: `site:${site} "${company}" "${roleStem}" ${skillsOR}${locQ}`,
        company, type: "company+role+skill"
      });
    } else {
      queryMeta.push({
        query: `site:${site} "${company}" "${roleStem}"${locQ}`,
        company, type: "company+role"
      });
    }
  });

  // Q3: title + skills only (no company — catches people who recently moved)
  // Only run a few of these to avoid too many API calls
  if (skillsOR && targets.length > 0) {
    queryMeta.push({
      query: `site:${site} intitle:${titleOR} ${skillsOR}${locQ} -recruiter -hiring -consultant`,
      company: "", type: "title+skill"
    });
  }

  let rawResults = [];
  try {
    const responses = await Promise.all(
      queryMeta.map(({ query }) =>
        fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-KEY": SERPER_KEY },
          body: JSON.stringify({ q: query, num: 10 }),
        }).then(r => r.json()).catch(() => ({ organic: [] }))
      )
    );
    rawResults = responses.flatMap((r, i) => {
      const meta = queryMeta[i];
      return (r.organic || []).map(item => ({ ...item, _queryCompany: meta.company, _queryType: meta.type }));
    });
    console.log(`[SOURCE] ${queryMeta.length} queries → ${rawResults.length} raw results`);
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
    // Apply filters: seniority + skill
    .filter(c => {
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

    const prompt = `You are an expert technical recruiter and Boolean search specialist.

Generate intelligent Google X-ray search strings for LinkedIn to find candidates for this role:
Role: ${role}
Seniority: ${seniority}
Location: ${location}
Skills: ${(skills||[]).join(", ")||"not specified"}
Target Companies: ${(companies||[]).slice(0,6).join(", ")||"any"}
LinkedIn site: ${site}

TASK:
1. First, deeply understand the skills — research their ecosystem. For each skill, identify:
   - Alternative names / abbreviations (e.g. "Apache Iceberg" → also "Iceberg", "Open Table Format", "OTF")
   - Related technologies in the same space (e.g. "Apache Iceberg" → "Delta Lake", "Apache Hudi", "Tabular")
   - Communities/concepts people in this space use (e.g. "Lakehouse", "Open Table Format community")

2. Generate a search strategy paragraph explaining who to target and why.

3. Generate exactly 5 Boolean search strings using these Google X-ray operators:
   - site:${site} — always include
   - intitle:"term" — use for current job title (LinkedIn page title = current role)
   - "quoted phrase" — exact match
   - (term1 OR term2) — alternatives
   - AND — must have (implicit between terms)
   - -term — exclude (use -recruiter -hiring -consultant to filter noise)

CRITICAL RULE FOR TITLES: Never use the seniority as a plain keyword.
Always generate real title alternatives as an OR group in intitle:.
Examples:
  VP Sales → intitle:("VP Sales" OR "Vice President Sales" OR "Head of Sales" OR "Sales Director")
  Staff Engineer → intitle:("Staff Engineer" OR "Staff Software Engineer" OR "Principal Engineer")
  Customer Success Manager → intitle:("Customer Success Manager" OR "Client Success Manager" OR "Customer Success Lead")

Rules for strings:
- String 1: intitle:(title OR alt1 OR alt2 OR alt3) site:linkedin + location keyword
- String 2: intitle:(title OR alt) AND (skill1 OR skill_alt1 OR skill_alt2) AND location -noise
- String 3: intitle:(seniority_variant title) AND (related_tech1 OR related_tech2) AND location
- String 4: site:linkedin ("company1" OR "company2" OR "company3") AND intitle:(title OR alt) AND skill
- String 5: niche community angle — use ecosystem terms, community names, conference names

Every string MUST have title alternatives in an OR group. Never: intitle:"VP Sales" VP.
Always: intitle:("VP Sales" OR "Vice President Sales" OR "Head of Sales")

Return ONLY valid JSON, no markdown:
{
  "strategy": "2-3 sentence paragraph about who to target and where they hide",
  "strings": [
    {"label": "Short label", "query": "full google search string here"},
    {"label": "Short label", "query": "full google search string here"},
    {"label": "Short label", "query": "full google search string here"},
    {"label": "Short label", "query": "full google search string here"},
    {"label": "Short label", "query": "full google search string here"}
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
