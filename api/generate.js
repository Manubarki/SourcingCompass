export const config = { api: { bodyParser: true } };

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1IlRq1Qab3ywgA1-r215HIZlh3e3m8Q6RT6kKvMePP4U/export?format=csv&gid=0";

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
  }).filter(r => r.company || r.name);
}

function filterCompanies(companies, role, skills, industries) {
  const keywords = [
    ...role.toLowerCase().split(/\s+/),
    ...skills.map(s => s.toLowerCase()),
    ...industries.map(i => i.toLowerCase()),
  ].filter(k => k.length > 2);

  const scored = companies.map(c => {
    const text = [c.company, c.name, c.category, c["sub category"], c["subcategory"], c.description]
      .join(" ").toLowerCase();
    const score = keywords.filter(k => text.includes(k)).length;
    return { ...c, _score: score };
  });

  // Return top 80 most relevant + a random sample of 20 others for diversity
  const relevant = scored.filter(c => c._score > 0).sort((a, b) => b._score - a._score).slice(0, 80);
  const others = scored.filter(c => c._score === 0).sort(() => Math.random() - 0.5).slice(0, 20);
  return [...relevant, ...others];
}

function formatCompanyList(companies) {
  return companies.map(c => {
    const name = c.company || c.name || "";
    const sub = c["sub category"] || c.subcategory || c.category || "";
    const funding = c.funding || "";
    const desc = (c.description || "").slice(0, 80);
    return [name, sub, funding, desc].filter(Boolean).join(" | ");
  }).join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const prompt = body.messages?.[0]?.content || "";

    // Extract role/skills/industries from the prompt for filtering
    const roleMatch = prompt.match(/Role:\s*(.+)/);
    const skillsMatch = prompt.match(/Skills:\s*(.+)/);
    const industriesMatch = prompt.match(/Preferred Industries:\s*(.+)/);
    const role = roleMatch?.[1] || "";
    const skills = skillsMatch?.[1]?.split(",").map(s => s.trim()) || [];
    const industries = industriesMatch?.[1]?.split(",").map(s => s.trim()) || [];

    // Fetch and parse company sheet
    let companyContext = "";
    try {
      const sheetRes = await fetch(SHEET_CSV_URL);
      const csv = await sheetRes.text();
      const companies = parseCSV(csv);
      const filtered = filterCompanies(companies, role, skills, industries);
      companyContext = "\n\nCOMPANY KNOWLEDGE BASE — you MUST only suggest target companies and adjacent pools from this verified list. Do not suggest any company not in this list:\n" + formatCompanyList(filtered);
    } catch (e) {
      // If sheet fetch fails, continue without it
      console.error("Sheet fetch failed:", e.message);
    }

    // Inject company context into the prompt
    const enrichedPrompt = prompt + companyContext;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: enrichedPrompt }],
        temperature: 0.2,
        max_tokens: 4000,
      }),
    });

    const rawText = await response.text();
    let data;
    try { data = JSON.parse(rawText); }
    catch { return res.status(500).json({ error: `Non-JSON response: ${rawText.slice(0, 300)}` }); }

    if (!response.ok) {
      return res.status(500).json({ error: data?.error?.message || JSON.stringify(data) });
    }

    const text = data.choices?.[0]?.message?.content || "{}";
    res.status(200).json({ content: [{ type: "text", text }] });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
