export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Parse body — Vercel passes raw body
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body) body = {};

  const { companies, role, skills, seniority, location } = body;
  if (!companies?.length || !role) return res.status(400).json({ error: "companies and role are required" });

  const SERPER_KEY = process.env.SERPER_API_KEY;
  if (!SERPER_KEY) return res.status(500).json({ error: "SERPER_API_KEY not configured" });

  const targets = companies.slice(0, 8);
  const mustSkills = (skills || []).filter(s => s && s.trim());
  const topSkill = mustSkills[0] || "";

  // LinkedIn subdomain by location
  const LINKEDIN_SITE = {
    "United States":  { site: "linkedin.com/in",   loc: "United States" },
    "Canada":         { site: "ca.linkedin.com/in", loc: "" },
    "India":          { site: "in.linkedin.com/in", loc: "" },
    "United Kingdom": { site: "uk.linkedin.com/in", loc: "" },
    "Europe":         { site: "linkedin.com/in",    loc: "Europe" },
    "Australia":      { site: "au.linkedin.com/in", loc: "" },
    "Singapore":      { site: "sg.linkedin.com/in", loc: "" },
  };
  const locConfig = LINKEDIN_SITE[location] || { site: "linkedin.com/in", loc: "" };
  const site = locConfig.site;
  const locHint = locConfig.loc ? ` "${locConfig.loc}"` : "";

  // Strip seniority prefix to get core role
  // "Staff Customer Success Manager" -> "Customer Success Manager"
  const roleStem = role
    .replace(/^(Intern|Junior|Mid-Level|Senior|Lead|Staff|Principal|Manager|Director|VP|SVP)\s+/i, "")
    .trim();

  // Seniority alternatives — what this level is called in the real world
  const SENIORITY_VARIANTS = {
    "Intern":          ["Intern", "Junior"],
    "Junior":          ["Junior", "Associate"],
    "Mid-Level":       ["Senior", "Lead"],
    "Senior":          ["Senior", "Lead"],
    "Lead":            ["Lead", "Senior", "Staff"],
    "Staff":           ["Staff", "Senior", "Lead", "Principal"],
    "Principal":       ["Principal", "Staff", "Director"],
    "Manager":         ["Manager", "Senior Manager"],
    "Senior Manager":  ["Senior Manager", "Manager", "Director"],
    "Director":        ["Director", "Senior Director"],
    "Senior Director": ["Senior Director", "Director", "VP"],
    "VP":              ["VP", "Vice President"],
    "SVP":             ["SVP", "VP"],
    "C-Level":         ["Chief", "President"],
  };
  const senVariants = SENIORITY_VARIANTS[seniority] || [seniority];

  // Skills as OR — any one of them in the profile is sufficient
  const skillsOR = mustSkills.length > 1
    ? `(${mustSkills.map(s=>`"${s}"`).join(" OR ")})`
    : mustSkills.length === 1 ? `"${mustSkills[0]}"` : "";

  // Location as OR group — city-level matching for better recall
  const LOCATION_CITIES = {
    "India":          "(India OR Bangalore OR Bengaluru OR Mumbai OR Pune OR Hyderabad OR Delhi OR Chennai)",
    "United States":  `("United States" OR "San Francisco" OR "New York" OR Seattle OR Austin)`,
    "United Kingdom": `("United Kingdom" OR London OR Manchester)`,
    "Europe":         "(Europe OR London OR Berlin OR Amsterdam OR Paris OR Dublin)",
    "Canada":         "(Canada OR Toronto OR Vancouver OR Montreal)",
    "Australia":      "(Australia OR Sydney OR Melbourne)",
    "Singapore":      "Singapore",
  };
  const locationOR = LOCATION_CITIES[location] || (locHint ? locHint.trim().replace(/^"|"$/g,"") : "");
  const locQ = locationOR ? ` AND ${locationOR}` : "";

  const queries = [];
  targets.forEach(company => {
    // Q1: intitle:roleStem + company + skills OR + location — proper Boolean
    queries.push(
      skillsOR
        ? `site:${site} intitle:"${roleStem}" AND "${company}" AND ${skillsOR}${locQ} -recruiter -hiring`
        : `site:${site} intitle:"${roleStem}" AND "${company}"${locQ} -recruiter -hiring`
    );
    // Q2: keyword search — no intitle, catches variant titles
    queries.push(
      skillsOR
        ? `site:${site} "${company}" AND "${roleStem}" AND ${skillsOR}${locQ}`
        : `site:${site} "${company}" AND "${roleStem}"${locQ}`
    );
    // Q3: seniority variant + company (e.g. "Senior" when user picked "Staff")
    if (senVariants[1]) {
      queries.push(`site:${site} "${company}" AND "${senVariants[1]} ${roleStem}"${locQ}`);
    }
  });

  const uniqueQueries = [...new Set(queries)];

  let rawResults = [];
  try {
    const responses = await Promise.all(
      uniqueQueries.map(q =>
        fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-KEY": SERPER_KEY },
          body: JSON.stringify({ q, num: 10 }),
        }).then(r => r.json()).catch(() => ({ organic: [] }))
      )
    );

    rawResults = responses.flatMap((r, qi) => {
      // Ground truth company from the query
      const queryCompany = targets.find(t => uniqueQueries[qi]?.includes(`"${t}"`)) || "";
      return (r.organic || []).map(item => ({ ...item, _queryCompany: queryCompany }));
    });
  } catch (err) {
    return res.status(500).json({ error: "Serper search failed: " + err.message });
  }

  function parseCandidate(result) {
    const url = result.link || "";
    if (!url.includes("linkedin.com/in/")) return null;

    const snippet  = result.snippet || "";
    const rawTitle = result.title   || "";

    // LinkedIn page title format: "Firstname Lastname - Current Title at Company | LinkedIn"
    const nameMatch = rawTitle.match(/^([^|\-]{2,50}?)(?:\s*[-|]|$)/);
    const name = nameMatch ? nameMatch[1].trim() : "";
    if (!name || name.toLowerCase().includes("linkedin")) return null;

    // Extract current title — everything between first " - " and " | LinkedIn"
    const titleMatch = rawTitle.match(/\s*-\s*(.+?)(?:\s*\|\s*LinkedIn)?$/i);
    const currentTitle = titleMatch
      ? titleMatch[1].replace(/\s+at\s+.+$/i, "").trim()
      : "";

    const queriedCompany = result._queryCompany || "";
    const emailMatch = snippet.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    const email = emailMatch ? emailMatch[0] : null;

    // Score by relevance
    const kw = [role, roleStem, ...(mustSkills), seniority || ""].map(k => k.toLowerCase()).filter(Boolean);
    const fullText = [name, currentTitle, queriedCompany, snippet].join(" ").toLowerCase();
    const score = kw.reduce((n, k) => n + (fullText.includes(k) ? 1 : 0), 0);

    return { name, currentTitle, currentCompany: queriedCompany, linkedinUrl: url, email, snippet, score };
  }

  // Post-filter: if must-have skills entered, at least one must appear in snippet
  function hasRequiredSkill(c) {
    if (!mustSkills.length) return true;
    const text = [c.currentTitle, c.snippet].join(" ").toLowerCase();
    return mustSkills.some(skill => {
      const s = skill.toLowerCase();
      if (text.includes(s)) return true;
      // Multi-word skill: all words must appear (handles "data governance" -> "data" AND "governance")
      const words = s.split(/\s+/).filter(w => w.length > 3);
      return words.length > 1 && words.every(w => text.includes(w));
    });
  }

  const seen = new Set();
  const candidates = rawResults
    .map(parseCandidate)
    .filter(Boolean)
    .filter(c => {
      if (seen.has(c.linkedinUrl)) return false;
      seen.add(c.linkedinUrl);
      if (!c.name) return false;
      if (!hasRequiredSkill(c)) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({ candidates });
}
