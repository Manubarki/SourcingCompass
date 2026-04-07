export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { companies, role, skills, seniority, location } = req.body;
  if (!companies?.length || !role) return res.status(400).json({ error: "companies and role are required" });

  const SERPER_KEY = process.env.SERPER_API_KEY;
  if (!SERPER_KEY) return res.status(500).json({ error: "SERPER_API_KEY not configured" });

  const targets = companies.slice(0, 8);
  const normTargets = targets.map(t => t.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const topSkill = skills?.[0] || "";
  const mustSkills = (skills || []).filter(s => s && s.trim()).slice(0, 3);

  const LINKEDIN_SITE = {
    "United States": { site:"linkedin.com/in",  loc:"United States" },
    "Canada":        { site:"ca.linkedin.com/in", loc:"" },
    "India":         { site:"in.linkedin.com/in", loc:"" },
    "United Kingdom":{ site:"uk.linkedin.com/in", loc:"" },
    "Europe":        { site:"linkedin.com/in",  loc:"Europe" },
    "Australia":     { site:"au.linkedin.com/in", loc:"" },
    "Singapore":     { site:"sg.linkedin.com/in", loc:"" },
  };
  const locConfig = LINKEDIN_SITE[location] || { site:"linkedin.com/in", loc:"" };
  const site = locConfig.site;
  const locHint = locConfig.loc ? ` "${locConfig.loc}"` : "";

  const SENIORITY_ADJACENT = {
    "Intern":          ["Intern","Associate","Junior"],
    "Junior":          ["Junior","Associate"],
    "Mid-Level":       ["Mid","Senior","Lead"],
    "Senior":          ["Senior","Lead","Staff"],
    "Lead":            ["Lead","Senior","Staff"],
    "Staff":           ["Staff","Lead","Senior","Principal"],
    "Principal":       ["Principal","Staff","Director"],
    "Manager":         ["Manager","Senior Manager","Lead"],
    "Senior Manager":  ["Senior Manager","Manager","Director"],
    "Director":        ["Director","Senior Director","Principal"],
    "Senior Director": ["Senior Director","Director","VP"],
    "VP":              ["VP","Vice President","Senior Director"],
    "SVP":             ["SVP","Senior Vice President","VP"],
    "C-Level":         ["Chief","President","C-Level"],
  };
  const seniorityLevels = SENIORITY_ADJACENT[seniority] || [seniority];
  const roleStem = role.replace(/^(Intern|Junior|Mid-Level|Senior|Lead|Staff|Principal|Manager|Director|VP|SVP)\s+/i, "").trim();

  const queries = targets.flatMap(company => {
    const q1 = topSkill
      ? `site:${site} "${company}" "${roleStem}" "${topSkill}"${locHint}`
      : `site:${site} "${company}" "${roleStem}"${locHint}`;
    return [q1, ...seniorityLevels.slice(0,2).map(level =>
      topSkill
        ? `site:${site} "${company}" "${roleStem}" ${level} "${topSkill}"${locHint}`
        : `site:${site} "${company}" "${roleStem}" ${level}${locHint}`
    )];
  });

  let rawResults = [];
  try {
    const responses = await Promise.all(
      queries.map(q =>
        fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-KEY": SERPER_KEY },
          body: JSON.stringify({ q, num: 10 }),
        }).then(r => r.json()).catch(() => ({ organic: [] }))
      )
    );
    rawResults = responses.flatMap((r, i) => {
      const queryCompany = targets[Math.floor(i / 3)]; // 3 queries per company now
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
    const nameMatch = rawTitle.match(/^([^|\-]+?)(?:\s*[-|]|$)/);
    const name = nameMatch ? nameMatch[1].trim() : "Unknown";
    const afterName = rawTitle.replace(/^[^-]+-\s*/, "");
    const cleanedTitle = afterName.replace(/\s*\|.*$/, "").replace(/\s*[@＠]\s*\S+.*$/, "").replace(/\s+at\s+.+$/i, "").trim();
    const queriedCompany = result._queryCompany || "";
    const emailMatch = snippet.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    const email = emailMatch ? emailMatch[0] : null;
    const kw = [role, ...(skills || []), seniority || ""].map(k => k.toLowerCase());
    const fullText = [name, cleanedTitle, queriedCompany, snippet].join(" ").toLowerCase();
    const score = kw.reduce((n, k) => n + (k && fullText.includes(k) ? 1 : 0), 0);
    return { name, currentTitle: cleanedTitle, currentCompany: queriedCompany, linkedinUrl: url, email, snippet, score };
  }

  function isFromTargetCompany(c) {
    if (!c.currentCompany) return false;
    const compNorm = c.currentCompany.toLowerCase().replace(/[^a-z0-9]/g, "");
    const urlNorm  = c.linkedinUrl.toLowerCase();
    return normTargets.some(t => compNorm.includes(t) || t.includes(compNorm) || urlNorm.includes(t));
  }

  function hasRequiredSkill(c) {
    if (!mustSkills.length) return true;
    const text = [c.currentTitle, c.snippet].join(" ").toLowerCase();
    return mustSkills.some(skill => {
      const s = skill.toLowerCase();
      if (text.includes(s)) return true;
      const words = s.split(/\s+/).filter(w => w.length > 3);
      return words.length > 1 && words.every(w => text.includes(w));
    });
  }

  const seen = new Set();
  const candidates = rawResults
    .map(parseCandidate).filter(Boolean)
    .filter(c => {
      if (seen.has(c.linkedinUrl)) return false;
      seen.add(c.linkedinUrl);
      if (!c.name || c.name === "Unknown") return false;
      if (!isFromTargetCompany(c)) return false;
      if (!hasRequiredSkill(c)) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 30);

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({ candidates });
}
