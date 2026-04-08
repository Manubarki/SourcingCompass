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
