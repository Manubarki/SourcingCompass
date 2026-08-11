import { callLLM } from "./_helpers.js";

// ─── GitHub contributor sourcing — repo search, contributor extraction, and
// profile enrichment run client-side (api.github.com allows CORS for public
// reads). Two things can't run in the browser and live here instead:
// 1. findEmail — digs through commit .patch files on github.com (no CORS),
//    across multiple fallback strategies.
// 2. expandQuery — turns a natural-language "top N repos for X" ask into a
//    real GitHub search query via the LLM.

const GITHUB_API = "https://api.github.com";

function isRealEmail(email) {
  if (!email || email.length < 5) return false;
  const lower = email.toLowerCase();
  if (lower.includes("noreply") || lower === "none" || lower.endsWith("@github.com")) return false;
  return lower.includes("@");
}

function ghHeaders(token) {
  const headers = { Accept: "application/vnd.github.v3+json", "User-Agent": "sourcingcompass-github-extract" };
  const authToken = token || process.env.GITHUB_PAT;
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  return headers;
}

async function tryPatchEmail(repoFullName, login, headers) {
  try {
    for (const param of ["author", "committer"]) {
      const commitsRes = await fetch(`${GITHUB_API}/repos/${repoFullName}/commits?${param}=${encodeURIComponent(login)}&per_page=30`, { headers });
      if (!commitsRes.ok) continue;
      const commits = await commitsRes.json();
      if (!Array.isArray(commits) || commits.length === 0) continue;

      for (const commit of commits) {
        const authorEmail = commit?.commit?.author?.email;
        if (isRealEmail(authorEmail)) return authorEmail;
        const committerEmail = commit?.commit?.committer?.email;
        if (isRealEmail(committerEmail)) return committerEmail;

        try {
          const patchUrl = `https://github.com/${repoFullName}/commit/${commit.sha}.patch`;
          const patchRes = await fetch(patchUrl, { headers: { "User-Agent": "sourcingcompass-github-extract" }, redirect: "follow" });
          if (patchRes.ok) {
            const patchText = await patchRes.text();
            const fromMatch = patchText.match(/^From:.*<([^>]+)>/m);
            if (fromMatch && isRealEmail(fromMatch[1])) return fromMatch[1];
            const authorMatch = patchText.match(/^author\s+.*<([^>]+)>/m);
            if (authorMatch && isRealEmail(authorMatch[1])) return authorMatch[1];
          }
        } catch { /* try next commit */ }
      }
    }
  } catch { /* fall through to next strategy */ }
  return null;
}

async function findEmail(login, token, repo) {
  const headers = ghHeaders(token);

  // Strategy 1: public profile email
  try {
    const profileRes = await fetch(`${GITHUB_API}/users/${encodeURIComponent(login)}`, { headers });
    if (profileRes.ok) {
      const profile = await profileRes.json();
      if (isRealEmail(profile.email)) return profile.email;
    }
  } catch { /* continue */ }

  // Strategy 2: commits/patches on the repo we found them through
  if (repo) {
    const email = await tryPatchEmail(repo, login, headers);
    if (email) return email;
  }

  // Strategy 3: GitHub commit search across all repos
  try {
    const searchRes = await fetch(
      `${GITHUB_API}/search/commits?q=author:${encodeURIComponent(login)}&sort=author-date&order=asc&per_page=20`,
      { headers: { ...headers, Accept: "application/vnd.github.cloak-preview+json" } }
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      for (const item of searchData.items || []) {
        const authorEmail = item?.commit?.author?.email;
        if (isRealEmail(authorEmail)) return authorEmail;
        const committerEmail = item?.commit?.committer?.email;
        if (isRealEmail(committerEmail)) return committerEmail;
      }
    }
  } catch { /* continue */ }

  // Strategy 4: public events feed
  try {
    const eventsRes = await fetch(`${GITHUB_API}/users/${encodeURIComponent(login)}/events/public?per_page=100`, { headers });
    if (eventsRes.ok) {
      const events = await eventsRes.json();
      for (const event of events || []) {
        if (event.type === "PushEvent" && event.payload?.commits) {
          for (const c of event.payload.commits) {
            if (isRealEmail(c.author?.email)) return c.author.email;
          }
        }
      }
    }
  } catch { /* continue */ }

  // Strategy 5: the user's own repos (owned first, then forks)
  try {
    const reposRes = await fetch(`${GITHUB_API}/users/${encodeURIComponent(login)}/repos?sort=updated&per_page=10`, { headers });
    if (reposRes.ok) {
      const repos = await reposRes.json();
      if (Array.isArray(repos)) {
        const ordered = [...repos.filter(r => !r.fork), ...repos.filter(r => r.fork)];
        for (const r of ordered) {
          const email = await tryPatchEmail(r.full_name, login, headers);
          if (email) return email;
        }
      }
    }
  } catch { /* continue */ }

  return null;
}

async function expandQuery(subject) {
  const system = "You translate a short topic into a GitHub repository search query optimized for SEMANTIC RELEVANCE. Return ONLY JSON: {\"keywords\":[2-5 short phrases or terms],\"topics\":[1-5 valid github topic slugs lowercase-hyphenated]}. Topics must be REAL widely-used GitHub topic slugs (e.g. kubernetes, terraform, devops, infrastructure-as-code, cloud-computing). Do NOT invent slugs. Keywords should be the most descriptive terms a relevant repo's README/description would contain.";
  try {
    const raw = await callLLM(`Topic: ${subject}`, 300, system);
    const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
    const parsed = JSON.parse(s !== -1 && e !== -1 ? raw.slice(s, e + 1) : raw);
    const keywords = (parsed.keywords || []).filter(k => typeof k === "string").slice(0, 3);
    const topics = (parsed.topics || [])
      .filter(t => typeof t === "string")
      .map(t => t.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))
      .filter(Boolean)
      .slice(0, 2);
    const kwTerms = (keywords.length ? keywords : [subject]).map(k => (k.includes(" ") ? `"${k}"` : k));
    return { query: `${kwTerms.join(" OR ")} stars:>100`, keywords, topics };
  } catch {
    return { query: `${subject} stars:>50`, keywords: [subject], topics: [] };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body) body = {};

  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    if (body.mode === "expandQuery") {
      const { subject } = body;
      if (!subject) return res.status(400).json({ error: "subject is required" });
      return res.json(await expandQuery(subject));
    }

    // mode: "findEmail" (default)
    const { login, token, repo } = body;
    if (!login) return res.status(400).json({ error: "login is required" });
    const email = await findEmail(login, token, repo);
    return res.json({ email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
