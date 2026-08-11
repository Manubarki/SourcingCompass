// ─── GitHub contributor sourcing — client-side API calls ─────────────────────
// api.github.com allows CORS for public reads, so search/contributors/enrich
// run directly from the browser (optionally with a user-supplied PAT for a
// higher rate limit). findEmail and expandTopQuery need a server hop — see
// api/github.js — because they touch endpoints without CORS or need the LLM.

const GITHUB_API = "https://api.github.com";

let rateLimitRemaining = null;
let rateLimitLimit = null;
let rateLimitReset = null;
let lastToken;
const SAFETY_PERCENT = 0.10;
const MIN_SAFE_REMAINING = 5;
const THROTTLE_MS = 200;

export function resetRateLimitIfTokenChanged(token) {
  if (token !== lastToken) {
    rateLimitRemaining = null;
    rateLimitLimit = null;
    rateLimitReset = null;
    lastToken = token;
  }
}

function getSafetyBuffer() {
  if (rateLimitLimit !== null) return Math.max(Math.floor(rateLimitLimit * SAFETY_PERCENT), MIN_SAFE_REMAINING);
  return MIN_SAFE_REMAINING;
}

export function getRateLimitInfo() {
  return { remaining: rateLimitRemaining, resetAt: rateLimitReset };
}

function updateRateLimitFromHeaders(res) {
  const remaining = res.headers.get("x-ratelimit-remaining");
  const limit = res.headers.get("x-ratelimit-limit");
  const reset = res.headers.get("x-ratelimit-reset");
  if (remaining != null) rateLimitRemaining = parseInt(remaining);
  if (limit != null) rateLimitLimit = parseInt(limit);
  if (reset != null) rateLimitReset = parseInt(reset) * 1000;
}

async function fetchWithRateLimit(url, token) {
  if (rateLimitRemaining !== null && rateLimitRemaining <= getSafetyBuffer()) {
    const resetIn = rateLimitReset ? Math.max(0, rateLimitReset - Date.now()) : 0;
    const resetMins = Math.ceil(resetIn / 60000);
    throw new Error(`Rate limit guard: only ${rateLimitRemaining} requests left. Resets in ~${resetMins} min. Stopping to protect your quota.`);
  }

  const headers = { Accept: "application/vnd.github.v3+json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  updateRateLimitFromHeaders(res);

  if (res.status === 403 || res.status === 429) {
    const resetHeader = res.headers.get("x-ratelimit-reset");
    if (resetHeader) {
      const waitMs = Math.max(parseInt(resetHeader) * 1000 - Date.now(), 1000);
      throw new Error(`Rate limited by GitHub. Resets in ~${Math.ceil(waitMs / 60000)} min. Your data so far is preserved.`);
    }
    throw new Error("Rate limited by GitHub. Wait a moment and try again.");
  }
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  return res;
}

/** Parse "top N repos in/for/about X" → subject. */
export function parseNaturalQuery(input) {
  const raw = input.trim();
  const re = /^\s*(?:top|best|popular)\s+(?:(\d{1,3})\s+)?(?:repos?|repositories)\s+(?:in|for|about|on|related to)\s+(.+?)\s*$/i;
  const m = raw.match(re);
  if (!m) return { query: raw, perPage: 10, isTopQuery: false };
  const n = m[1] ? Math.min(Math.max(parseInt(m[1], 10), 1), 100) : 10;
  const subject = m[2].trim().replace(/[?.!]+$/, "");
  return { query: subject, perPage: n, isTopQuery: true, subject };
}

export async function expandTopQuery(subject) {
  try {
    const res = await fetch("/api/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "expandQuery", subject }),
    });
    if (!res.ok) throw new Error("expand failed");
    return await res.json();
  } catch {
    return { query: `${subject} stars:>50`, keywords: [subject], topics: [] };
  }
}

export async function searchRepos(query, token, page = 1, perPage = 10, sort = "stars") {
  const sortParam = sort === "stars" ? "&sort=stars&order=desc" : "";
  const res = await fetchWithRateLimit(
    `${GITHUB_API}/search/repositories?q=${encodeURIComponent(query)}${sortParam}&per_page=${perPage}&page=${page}`,
    token
  );
  const data = await res.json();
  return { items: data.items || [], total_count: data.total_count || 0 };
}

export async function getContributors(owner, repo, token, onProgress) {
  const allContributors = [];
  let page = 1;
  const perPage = 100;
  const MAX_PAGES = 20; // cap at 2000 contributors to protect quota

  while (page <= MAX_PAGES) {
    if (rateLimitRemaining !== null && rateLimitRemaining <= getSafetyBuffer()) break;

    const res = await fetchWithRateLimit(
      `${GITHUB_API}/repos/${owner}/${repo}/contributors?per_page=${perPage}&page=${page}`,
      token
    );
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    const filtered = data.filter(c => !c.login?.includes("[bot]") && c.type !== "Bot");
    allContributors.push(...filtered);
    onProgress?.(allContributors.length, rateLimitRemaining);

    if (data.length < perPage) break;
    page++;
    await new Promise(r => setTimeout(r, THROTTLE_MS));
  }

  return allContributors;
}

export async function enrichContributors(contributors, token, onProgress, control) {
  const enriched = [];
  const toEnrich = contributors.filter(c => !c.isAnonymous && c.login !== "anonymous");
  const alreadyAnon = contributors.filter(c => c.isAnonymous || c.login === "anonymous");
  const BATCH_SIZE = 5;

  for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
    while (control?.paused) await new Promise(r => setTimeout(r, 200));

    if (rateLimitRemaining !== null && rateLimitRemaining <= getSafetyBuffer()) {
      const remaining = toEnrich.slice(i).map(r => ({ ...r, enriched: false }));
      enriched.push(...remaining);
      onProgress?.(i, toEnrich.length, [...enriched]);
      break;
    }

    const batch = toEnrich.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async c => {
        try {
          const [profileRes, socialsRes] = await Promise.all([
            fetchWithRateLimit(`${GITHUB_API}/users/${c.login}`, token),
            fetchWithRateLimit(`${GITHUB_API}/users/${c.login}/social_accounts`, token).catch(() => null),
          ]);
          const profile = await profileRes.json();
          const socials = socialsRes ? await socialsRes.json() : [];
          return {
            ...c,
            name: profile.name || null,
            email: profile.email || c.email || null,
            bio: profile.bio || null,
            company: profile.company || null,
            blog: profile.blog || null,
            twitter_username: profile.twitter_username || null,
            location: profile.location || null,
            social_accounts: Array.isArray(socials) ? socials : [],
            enriched: true,
          };
        } catch {
          return { ...c, enriched: false };
        }
      })
    );

    results.forEach((r, idx) => enriched.push(r.status === "fulfilled" ? r.value : batch[idx]));

    const done = Math.min(i + BATCH_SIZE, toEnrich.length);
    onProgress?.(done, toEnrich.length, [...enriched, ...toEnrich.slice(done)]);
    if (done < toEnrich.length) await new Promise(r => setTimeout(r, THROTTLE_MS));
  }

  return [...enriched, ...alreadyAnon.map(c => ({ ...c, enriched: false }))];
}

export function contributorsToCsv(contributors, repoName) {
  const header = "Repository,Username,Full Name,Email,Profile URL,Contributions,Type,Company,Twitter,Blog,Social Links,Location,Bio\n";
  const rows = contributors
    .map(c => {
      const socialLinks = (c.social_accounts || []).map(s => s.url).join(" | ");
      return `"${repoName}","${c.login}","${c.name || ""}","${c.email || ""}","${c.html_url}",${c.contributions},"${c.isAnonymous ? "Anonymous" : "User"}","${c.company || ""}","${c.twitter_username ? `https://twitter.com/${c.twitter_username}` : ""}","${c.blog || ""}","${socialLinks}","${c.location || ""}","${(c.bio || "").replace(/"/g, '""')}"`;
    })
    .join("\n");
  return header + rows;
}

export async function findContributorEmail(login, token, repo) {
  try {
    const res = await fetch("/api/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "findEmail", login, token, repo }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.email || null;
  } catch {
    return null;
  }
}

export function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
