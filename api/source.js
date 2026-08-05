import { crustdataPeopleSearch, hasCrustdata } from "./_helpers.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body) body = {};

  const { companies, role, skills, seniority, location } = body;
  if (!companies?.length || !role) return res.status(400).json({ error: "companies and role are required" });

  const SERPER_KEY = process.env.SERPER_API_KEY;
  if (!SERPER_KEY && !hasCrustdata()) return res.status(500).json({ error: "Neither SERPER_API_KEY nor CRUSTDATA_API_KEY is configured" });

  const targets = companies.slice(0, 8);
  const normTargets = targets.map(t => t.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const mustSkills = (skills || []).filter(s => s && s.trim()).slice(0, 5);

  // LinkedIn subdomain by location
  const LINKEDIN_SITE = {
    "United States":  { site: "linkedin.com/in",    loc: "United States" },
    "Canada":         { site: "ca.linkedin.com/in",  loc: "" },
    "India":          { site: "in.linkedin.com/in",  loc: "" },
    "United Kingdom": { site: "uk.linkedin.com/in",  loc: "" },
    "Europe":         { site: "linkedin.com/in",     loc: "Europe" },
    "Australia":      { site: "au.linkedin.com/in",  loc: "" },
    "Singapore":      { site: "sg.linkedin.com/in",  loc: "" },
  };
  const locConfig = LINKEDIN_SITE[location] || { site: "linkedin.com/in", loc: "" };
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

  // Strip seniority prefix from role to get core title
  const roleStem = role
    .replace(/^(Intern|Junior|Mid-Level|Senior|Lead|Staff|Principal|Manager|Director|VP|SVP)\s+/i, "")
    .trim();

  // Build seniority-aware title variants for intitle: operator
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
  const titleVariants = titlePrefixes
    .map(p => p ? `"${p} ${roleStem}"` : `"${roleStem}"`)
    .filter((v, i, a) => a.indexOf(v) === i);
  const titleOR = titleVariants.length > 1
    ? `(${titleVariants.join(" OR ")})`
    : titleVariants[0];

  // Skills as OR group
  const skillsOR = mustSkills.length > 1
    ? `(${mustSkills.map(s => `"${s}"`).join(" OR ")})`
    : mustSkills.length === 1 ? `"${mustSkills[0]}"` : "";

  // Build queries — keep them SHORT for better Serper results
  const queryMeta = [];

  targets.forEach(company => {
    // Q1: intitle: seniority title variants + company (precise, no location clutter)
    queryMeta.push({
      query: `site:${site} intitle:${titleOR} "${company}" -recruiter -hiring`,
      company, type: "title+company"
    });

    // Q2: company + full role (e.g. "VP Sales" not just "Sales")
    queryMeta.push({
      query: `site:${site} "${company}" "${role}"${locQ ? " " + locOR : ""}`,
      company, type: "company+fullrole"
    });

    // Q3: if skills exist, company + skills + roleStem
    if (skillsOR) {
      queryMeta.push({
        query: `site:${site} "${company}" "${roleStem}" ${skillsOR}`,
        company, type: "company+role+skill"
      });
    }
  });

  // Q4: title-only (no company) — catches people who recently moved
  queryMeta.push({
    query: `site:${site} intitle:${titleOR}${locQ ? " " + locOR : ""} -recruiter -hiring`,
    company: "", type: "title+loc"
  });
  if (skillsOR) {
    queryMeta.push({
      query: `site:${site} intitle:${titleOR} ${skillsOR} -recruiter -hiring`,
      company: "", type: "title+skill"
    });
  }

  const uniqueQueries = [];
  const uniqueSet = new Set();
  queryMeta.forEach(m => {
    if (!uniqueSet.has(m.query)) {
      uniqueSet.add(m.query);
      uniqueQueries.push(m);
    }
  });

  let rawResults = [];
  if (SERPER_KEY) {
    try {
      const responses = await Promise.all(
        uniqueQueries.map(({ query }) =>
          fetch("https://google.serper.dev/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-API-KEY": SERPER_KEY },
            body: JSON.stringify({ q: query, num: 10 }),
          }).then(r => r.json()).catch(() => ({ organic: [] }))
        )
      );

      rawResults = responses.flatMap((r, i) => {
        const meta = uniqueQueries[i];
        return (r.organic || []).map(item => ({ ...item, _queryCompany: meta.company, _queryType: meta.type }));
      });
    } catch (err) {
      if (!hasCrustdata()) return res.status(500).json({ error: "Serper search failed: " + err.message });
    }
  }

  // Crustdata people search — real profile data merged alongside the X-ray results.
  let crustdataCandidates = [];
  if (hasCrustdata()) {
    const crustResults = await Promise.all(
      targets.map(company => crustdataPeopleSearch({ title: roleStem, companies: [company], location }))
    );
    crustdataCandidates = crustResults.flat().filter(Boolean);
  }

  // ── Parse candidate ──
  function parseCandidate(result) {
    const url = result.link || "";
    if (!url.includes("linkedin.com/in/")) return null;

    const snippet  = result.snippet || "";
    const rawTitle = result.title   || "";

    const nameMatch = rawTitle.match(/^([^|\-]{2,50}?)(?:\s*[-|]|$)/);
    const name = nameMatch ? nameMatch[1].trim() : "";
    if (!name || name.toLowerCase().includes("linkedin")) return null;

    const titleMatch = rawTitle.match(/\s*-\s*(.+?)(?:\s*\|\s*LinkedIn)?$/i);
    const currentTitle = titleMatch
      ? titleMatch[1].replace(/\s+at\s+.+$/i, "").trim()
      : "";

    const atMatch = rawTitle.match(/\s+at\s+(.+?)(?:\s*\|\s*LinkedIn)?$/i);
    const parsedCompany = atMatch ? atMatch[1].trim() : "";
    const currentCompany = parsedCompany || result._queryCompany || "";

    const emailMatch = snippet.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    const email = emailMatch ? emailMatch[0] : null;

    return { name, currentTitle, currentCompany, linkedinUrl: url, email, snippet, source: "serper", _queryType: result._queryType };
  }

  // ── Seniority validation ──
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
    if (!candidateTitle || !seniority) return true;
    const t = candidateTitle.toLowerCase();
    const rules = SENIORITY_KEYWORDS[seniority];
    if (!rules) return true;

    if (rules.block.some(b => {
      const re = new RegExp(`\\b${b}\\b`, "i");
      return re.test(t);
    })) {
      if (!rules.must.some(m => t.includes(m))) return false;
    }

    if (rules.must.length > 0) {
      return rules.must.some(m => t.includes(m));
    }
    return true;
  }

  // ── Role relevance filter ──
  function matchesRole(c) {
    const stemLower = roleStem.toLowerCase();
    if (stemLower.length < 3) return true;
    const text = [c.currentTitle, c.snippet].join(" ").toLowerCase();
    if (text.includes(stemLower)) return true;
    const words = stemLower.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 1) return words.every(w => text.includes(w));
    return false;
  }

  // ── Skill validation ──
  function hasRequiredSkill(c) {
    if (!mustSkills.length) return true;
    const text = [c.currentTitle, c.snippet, c.currentCompany].join(" ").toLowerCase();
    return mustSkills.some(skill => {
      const s = skill.toLowerCase();
      if (text.includes(s)) return true;
      const words = s.split(/\s+/).filter(w => w.length > 2);
      return words.length > 1 && words.every(w => text.includes(w));
    });
  }

  // ── Relevance scoring ──
  function scoreCandidate(c) {
    const titleLower = (c.currentTitle || "").toLowerCase();
    const fullText = [c.name, c.currentTitle, c.currentCompany, c.snippet].join(" ").toLowerCase();
    let score = 0;

    if (titleLower.includes(roleStem.toLowerCase())) score += 3;

    mustSkills.forEach(skill => {
      if (fullText.includes(skill.toLowerCase())) score += 2;
    });

    titlePrefixes.forEach(p => {
      if (p && titleLower.includes(p.toLowerCase())) score += 2;
    });

    const compNorm = (c.currentCompany || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normTargets.some(t => compNorm.includes(t) || t.includes(compNorm))) score += 1;

    if (c._queryType === "title+company+skill") score += 1;

    return score;
  }

  // ── Assemble results ──
  const seen = new Set();
  const serperCandidates = rawResults
    .map(parseCandidate)
    .filter(Boolean)
    .filter(c => {
      if (seen.has(c.linkedinUrl)) return false;
      seen.add(c.linkedinUrl);
      if (!c.name) return false;
      return true;
    })
    .map(c => ({ ...c, score: scoreCandidate(c) }))
    .filter(c => {
      if (!matchesRole(c)) return false;
      if (!matchesSeniority(c.currentTitle)) return false;
      if (!hasRequiredSkill(c)) return false;
      return true;
    })
    .map(({ _queryType, ...c }) => c);

  const dedupedCrustdata = crustdataCandidates.filter(c => {
    if (seen.has(c.linkedinUrl)) return false;
    seen.add(c.linkedinUrl);
    return true;
  }).map(c => ({ ...c, score: scoreCandidate(c) + 2 })); // real profile data — nudge above equivalent Serper guesses

  const candidates = [...serperCandidates, ...dedupedCrustdata]
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({ candidates, crustdataUsed: hasCrustdata(), serperUsed: !!SERPER_KEY });
}
