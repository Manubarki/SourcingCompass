# 🧭 SourcingCompass

> AI-powered talent mapping for recruiters and sourcers. Know *where* to look before you start searching.

---

## What is SourcingCompass?

SourcingCompass is a talent intelligence tool that helps recruiters and hiring managers answer one of the hardest questions in recruiting:

**"Where do people like this actually work?"**

Instead of starting every search from scratch on LinkedIn, SourcingCompass gives you an instant, AI-generated map of the talent landscape for any role — showing you exactly which companies to target, which job titles to search, and how likely people are to move.

---

## Why does this exist?

Sourcing is time-consuming. A recruiter typically spends hours figuring out:
- Which companies hire people with these skills?
- What job titles should I search on LinkedIn?
- Who is actually likely to be open to a move right now?
- Are there any non-obvious talent pools I'm missing?

SourcingCompass answers all of these questions in under 30 seconds.

---

## What does it show you?

When you generate a map, you get four sections:

### 🔵 Target Companies
The most relevant companies to source from for your role. Each company card shows:
- **Match Confidence** — how relevant this company is for your specific role (0–100%)
- **Talent Density** — how many relevant engineers or professionals work there
- **Poachability Score** — how likely people at this company are to consider a move right now
- **Poachability Signals** — specific reasons why they might be open to moving (e.g. recent layoffs, equity concerns, slow growth)
- **Likely Talent Profile** — a one-line description of the type of person who typically works there
- **Company Stage** — whether it's a startup (Seed, Series A/B/C) or established company (Public, Enterprise)

### 🟣 Adjacent Talent Pools
Companies that aren't an obvious match but whose employees have highly transferable skills. These are the hidden gems most recruiters miss — people who could do the job well even though they don't come from a direct competitor.

### 🟠 Wildcard Bets
Unconventional companies with a surprising but specific reason their talent would be a great fit. Think outside the usual suspects — sometimes the best hire comes from an unexpected place.

### 🟢 Target Titles
The exact job titles you should search on LinkedIn or job boards. These are real titles as they appear in actual job postings — not generic labels. Each title includes which companies commonly use it and a match confidence score.

---

## How do I use it?

1. **Open the tool** at [sourcing-compass.vercel.app](https://sourcing-compass.vercel.app)
2. **Fill in the left panel:**
   - **Role Title** — the role you're hiring for (e.g. "Staff Backend Engineer")
   - **Hiring Company** — your company (so it doesn't show up in results)
   - **Location** — where the role is based or where you want to source from
   - **Seniority** — Junior, Mid, Senior, Staff, Principal, Director, or VP
   - **Must-Have Skills** — type a skill and press `,` or `Enter` to add it as a tag
   - **Preferred Industries** — industries to focus on (optional)
   - **Exclusions** — companies or industries you want to skip
3. **Click Generate Map**
4. **Explore the results** — hover over any card to see laser lines connecting related companies and titles

---

## How does it work?

Here's the simple version:

1. You fill in your search parameters
2. SourcingCompass sends those details to an AI with a detailed set of instructions
3. The AI thinks about your role and generates a structured talent map based on its knowledge of the industry
4. The results are displayed as an interactive map you can explore

The AI is instructed to only suggest real, verifiable companies — and to back up every poachability signal with a specific reason, not just a guess.

---

## What makes a good search?

The more specific your inputs, the better your results. Here are some tips:

- **Add specific skills** rather than leaving it blank — e.g. "Apache Iceberg, dbt, Spark" gives much better results than just "data engineering"
- **Use the Exclusions field** to skip companies you've already sourced from or that are off-limits
- **Try different seniority levels** — a Staff search and a Senior search will return different company mixes
- **Add preferred industries** if your hiring manager has a preference — e.g. "Fintech, Data Infrastructure"

---

## Who built this?

Built by **Manu Barki** on the People team at Atlan. This is an internal tool designed to make sourcing faster and smarter for the recruiting team.

---

## Limitations

- The AI's knowledge has a cutoff date, so very recent company news (last few months) may not always be reflected
- Occasionally the AI may suggest a company that's slightly off — always do a quick sanity check before sourcing
- The tool works best for technical roles but can be used for any role

---

## Feedback

Try it, break it, and share your thoughts! The more feedback we get, the better it gets. Drop a message to Manu on Slack.
