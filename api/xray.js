import { callLLM } from "./_helpers.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body) body = {};

  const { role, skills, seniority, location, companies, adjacent, wildcards } = body;

  try {
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
      const clean = s !== -1 && e !== -1 ? raw.slice(s, e + 1) : raw;
      result = JSON.parse(clean);
    } catch {
      result = { strategy: "", strings: [] };
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(result);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}
