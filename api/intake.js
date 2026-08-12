import { callLLM, repairJSON } from "./_helpers.js";

// ─── Intake Agent ──────────────────────────────────────────────────────────
// Plays the recruiter in an intake call with the hiring manager: asks focused
// follow-up questions one at a time (phase: "chat"), then synthesizes a
// structured ICP + job description once enough ground has been covered
// (phase: "finalize").

const INTAKE_TOPICS = [
  "the team this role sits on and why it's open right now (backfill, headcount growth, new team/function)",
  "must-have skills, experience, or qualifications — non-negotiable",
  "nice-to-have / good-to-have skills that are a bonus but not required",
  "explicit dealbreakers — things that would rule a candidate out",
  "seniority / level and how it maps to their internal ladder",
  "compensation range (base, and equity/bonus if relevant)",
  "what success looks like in the first 6-12 months in this role",
  "team culture, working style, and who they'd report to",
  "interview process and what they're screening hardest for",
];

const CHAT_SYSTEM = `You are Compass, an expert technical recruiter running an intake call with a hiring manager to build an Ideal Candidate Profile (ICP) before sourcing starts.

Ask exactly ONE focused, conversational follow-up question at a time — never a list of questions. Keep each message under 3 sentences. Be warm but efficient, like a recruiter who respects the hiring manager's time.

Cover these topics over the course of the conversation, in whatever order feels natural based on what they've already said (don't re-ask something they've already answered):
${INTAKE_TOPICS.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Once you judge that you have enough to build a solid ICP and job description (most topics above touched on, even briefly), end your message with the exact line "READY_TO_FINALIZE" on its own — but only once, and only when genuinely ready. Do not mention this marker to the user or explain it.`;

const FINALIZE_SYSTEM = `You are an expert technical recruiter. You will be given the transcript of an intake call with a hiring manager. Synthesize it into a structured Ideal Candidate Profile (ICP) and a full job description.

Output ONLY valid compact single-line JSON. No markdown. No backticks. No explanation before or after.

Fill every field using what was actually discussed. If something was never covered, make a reasonable, clearly-labeled inference rather than leaving it blank (e.g. "Not discussed — inferred from role/seniority").

mustHaves is for the human-readable ICP/JD — full qualification bullets are fine there (can include years of experience, degree, soft skills, etc).

searchKeywords is a SEPARATE, much stricter field: it feeds directly into sourcing search queries (boolean X-ray strings, LinkedIn/Crustdata filters), so it must be SHORT and PRECISE, not a restatement of mustHaves. Rules:
- Maximum 5 keywords. Fewer is better if the role doesn't have 5 distinct discriminating skills.
- Each keyword is a single technology, tool, language, framework, domain, or functional term a candidate would actually list on a resume or LinkedIn profile — e.g. "Kubernetes", "Go", "distributed systems", "React", "supply chain". 1-3 words max per keyword.
- NEVER include full sentences, soft skills ("communication", "leadership"), degree/education requirements, years-of-experience phrases, or generic filler ("team player", "self-starter"). Only concrete, searchable, resume-worthy terms.
- Rank by how discriminating/important each is for finding the right candidates — put the most essential first.

Return exactly this structure:
{"icp":{"role":"","seniority":"","location":"","teamContext":"1-2 sentences on the team and why the role is open","mustHaves":["skill/qualification",""],"searchKeywords":["kw1","kw2"],"niceToHaves":["",""],"dealbreakers":["",""],"compRange":"e.g. $180k-$220k base + equity","successMetrics":"1-2 sentences on 6-12 month success","cultureNotes":"1-2 sentences","interviewProcess":"1 sentence","summary":"3-4 sentence recruiter-ready ICP summary"},"jobDescription":"full markdown job description: role title as # heading, About the Role, What You'll Do (bullets), What We're Looking For (bullets, must-haves first then nice-to-haves), and a short About the Team section. Use \\n for line breaks."}`;

function formatTranscript(transcript) {
  return (transcript || [])
    .map(m => `${m.role === "assistant" ? "Recruiter" : "Hiring Manager"}: ${m.content}`)
    .join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body) body = {};

  const { transcript = [], phase = "chat" } = body;

  try {
    if (phase === "finalize") {
      if (!transcript.length) return res.status(400).json({ error: "transcript is required" });
      const prompt = `INTAKE CALL TRANSCRIPT:\n${formatTranscript(transcript)}\n\nSynthesize the ICP and job description now.`;
      const raw = await callLLM(prompt, 4096, FINALIZE_SYSTEM);
      const clean = repairJSON(raw.replace(/```json|```/g, "").trim());
      const parsed = JSON.parse(clean);
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.json(parsed);
    }

    // phase === "chat"
    const convo = transcript.length
      ? formatTranscript(transcript)
      : "(This is the very start of the call — greet them briefly and ask your first question.)";
    const prompt = `${convo}\n\nRecruiter:`;
    const raw = await callLLM(prompt, 500, CHAT_SYSTEM);
    const readyToFinalize = /READY_TO_FINALIZE/.test(raw);
    const reply = raw.replace(/READY_TO_FINALIZE/g, "").trim();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json({ reply, readyToFinalize });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
