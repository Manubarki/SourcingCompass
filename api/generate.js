export const config = { api: { bodyParser: true } };

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1IlRq1Qab3ywgA1-r215HIZlh3e3m8Q6RT6kKvMePP4U/export?format=csv&gid=0";

// Module-level cache — persists for the lifetime of the serverless function instance
let COMPANY_MEMORY = null;

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim().toLowerCase());
  return lines.slice(1).map(line => {
    const cols = [];
    let cur = "", inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { cols.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cols[i] || ""; });
    return obj;
  }).filter(r => (r.company || r.name || "").trim().length > 0);
}

async function loadCompanyMemory() {
  if (COMPANY_MEMORY) return COMPANY_MEMORY;
  try {
    const res = await fetch(SHEET_CSV_URL);
    const csv = await res.text();
    COMPANY_MEMORY = parseCSV(csv).map(c => ({
      name: (c.company || c.name || "").trim(),
      category: (c.category || "").trim(),
      sub: (c["sub category"] || c.subcategory || "").trim(),
      funding: (c.funding || "").trim(),
      location: (c.location || "").trim(),
      desc: (c.description || "").slice(0, 60).trim(),
    })).filter(c => c.name.length > 0);
    return COMPANY_MEMORY;
  } catch (e) {
    return [];
  }
}

function filterAndFormat(companies, role, skills, industries) {
  const keywords = [
    ...role.toLowerCase().split(/\s+/),
    ...skills.map(s => s.toLowerCase()),
    ...industries.map(i => i.toLowerCase()),
  ].filter(k => k.length > 2);

  const scored = companies.map(c => {
    const text = [c.name, c.category, c.sub, c.desc].join(" ").toLowerCase();
    const score = keywords.reduce((n, k) => n + (text.includes(k) ? 1 : 0), 0);
    return { ...c, score };
  });

  const relevant = scored.filter(c => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 30);
  const others = scored.filter(c => c.score === 0).sort(() => Math.random() - 0.5).slice(0, 5);

  return [...relevant, ...others]
    .map(c => [c.name, c.sub || c.category, c.funding].filter(Boolean).join(" | "))
    .join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const prompt = body.messages?.[0]?.content || "";

    // Extract role/skills/industries for filtering
    const role = prompt.match(/Role:\s*(.+)/)?.[1] || "";
    const skills = (prompt.match(/Skills:\s*(.+)/)?.[1] || "").split(",").map(s => s.trim());
    const industries = (prompt.match(/Preferred Industries:\s*(.+)/)?.[1] || "").split(",").map(s => s.trim());

    // Load company memory (cached in module scope after first load)
    const companies = await loadCompanyMemory();
    const companyList = companies.length > 0
      ? "\n\nCOMPANY KNOWLEDGE BASE — you MUST only suggest companies from this verified list. Do not invent or suggest any company not in this list:\n" + filterAndFormat(companies, role, skills, industries)
      : "";

    const finalPrompt = prompt + companyList;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        messages: [{ role: "user", content: finalPrompt }],
        max_tokens: 4000,
      }),
    });

    const rawText = await response.text();
    let data;
    try { data = JSON.parse(rawText); }
    catch { return res.status(500).json({ error: `Non-JSON: ${rawText.slice(0, 300)}` }); }

    if (!response.ok) {
      return res.status(500).json({ error: data?.error?.message || JSON.stringify(data) });
    }

    const text = data.content?.map(b => b.text || "").join("").trim() || "{}";
    res.status(200).json({ content: [{ type: "text", text }] });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
