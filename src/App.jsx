import { useState, useRef } from "react";

const GRID_SIZE = 40;

const OUTREACH_EXAMPLE = `Here is an example of a great outreach message from Atlan. Match this style — mission-led, specific to their background, connects their skills to the role, ends with a soft CTA:

"I hope you are doing well. I'm reaching out from Atlan. Our mission is to become the context layer for the AI world — building the foundational primitives that will power the next generation of apps and agents. One of the core bets is our data platform: Building a control plane that transforms existing lakehouse architectures into AI-ready context stores with governance, multimodal capabilities (structured, unstructured, vector, graph), and extensibility. Your background as a [title], with experience in [specific area], aligns well with our needs. We're looking for someone to take deep ownership of [responsibility] — end-to-end, high impact. Your expertise in [skill1] and [skill2] would be invaluable to our team. We're also intentionally AI-native in how we design and ship systems, using modern AI tools for real engineering leverage while owning outcomes fully. Open to a quick chat?"

Style rules:
- Open with "I hope you are doing well. I'm reaching out from Atlan."
- State Atlan's mission in 1-2 sentences using context layer framing
- Connect to a specific technical area relevant to the company/role
- Reference their specific background, title, and 2-3 skills with [placeholders]
- State what they'd own at Atlan — specific, high impact
- Mention AI-native work culture
- End with "Open to a quick chat?"
- Keep it under 150 words
- No fluff, no generic praise`;

- Context layer = shared institutional knowledge (definitions, rules, relationships) made machine-readable for AI agents
- Context products = data + meaning packaged as reusable units per domain
- Minimum Viable Context (MVC) = when an AI agent can reliably answer golden questions for a domain
- Key belief: In a world where everyone has the same models, context becomes the company's real IP
- Atlan solves the "AI context gap" — models are smart but don't understand your business without context
- Used by data teams, CDOs, and AI platform teams to stop context from fragmenting across agents`;

const ATLAN_CONTEXT = `Atlan is a data catalog and active metadata platform that helps companies build an enterprise context layer for AI. Key concepts:
  return (
    <svg className="absolute inset-0 w-full h-full" style={{opacity:0.15}}>
      <defs>
        <pattern id="smallGrid" width={GRID_SIZE/4} height={GRID_SIZE/4} patternUnits="userSpaceOnUse">
          <path d={`M ${GRID_SIZE/4} 0 L 0 0 0 ${GRID_SIZE/4}`} fill="none" stroke="#7dd3fc" strokeWidth="0.3"/>
        </pattern>
        <pattern id="grid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
          <rect width={GRID_SIZE} height={GRID_SIZE} fill="url(#smallGrid)"/>
          <path d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`} fill="none" stroke="#7dd3fc" strokeWidth="0.7"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)"/>
    </svg>
  );
}

const CATEGORY_STYLES = {
  companies:{ bg:"bg-sky-900/80", border:"border-sky-400", text:"text-sky-300", badge:"bg-sky-400/20 text-sky-300", dot:"#38bdf8", label:"Target Companies" },
  adjacent: { bg:"bg-violet-900/80", border:"border-violet-400", text:"text-violet-300", badge:"bg-violet-400/20 text-violet-300", dot:"#a78bfa", label:"Adjacent Talent Pools" },
  wildcards:{ bg:"bg-orange-900/80", border:"border-orange-400", text:"text-orange-300", badge:"bg-orange-400/20 text-orange-300", dot:"#fb923c", label:"Wildcard Bets" },
  titles:   { bg:"bg-emerald-900/80", border:"border-emerald-400", text:"text-emerald-300", badge:"bg-emerald-400/20 text-emerald-300", dot:"#34d399", label:"Target Titles" },
};

const STAGE_STYLES = {
  "Public":    "bg-sky-900/60 text-sky-300 border-sky-700",
  "Enterprise":"bg-sky-900/60 text-sky-300 border-sky-700",
  "Late Stage":"bg-violet-900/60 text-violet-300 border-violet-700",
  "Series C+": "bg-violet-900/60 text-violet-300 border-violet-700",
  "Series B":  "bg-amber-900/60 text-amber-300 border-amber-700",
  "Series A":  "bg-orange-900/60 text-orange-300 border-orange-700",
  "Seed":      "bg-rose-900/60 text-rose-300 border-rose-700",
};

const CHANNEL_STYLES = {
  "LinkedIn InMail": "bg-blue-900/60 border-blue-700 text-blue-300",
  "LinkedIn DM":     "bg-sky-900/60 border-sky-700 text-sky-300",
  "Email":           "bg-violet-900/60 border-violet-700 text-violet-300",
  "Referral":        "bg-emerald-900/60 border-emerald-700 text-emerald-300",
  "Cold Intro":      "bg-orange-900/60 border-orange-700 text-orange-300",
};

function TagInput({ placeholder, tags, onChange }) {
  const [input, setInput] = useState("");
  const inputRef = useRef(null);
  function handleKey(e) {
    if ((e.key === "," || e.key === "Enter") && input.trim()) {
      e.preventDefault();
      onChange([...tags, input.trim().replace(/,$/, "")]);
      setInput("");
    } else if (e.key === "Backspace" && !input && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }
  function handlePaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    const newTags = pasted.split(/[,\n]+/).map(t => t.trim()).filter(Boolean);
    if (newTags.length > 1) onChange([...tags, ...newTags]);
    else setInput(pasted.trim());
  }
  return (
    <div className="w-full min-h-[38px] bg-slate-800 border border-slate-600 rounded px-2 py-1.5 flex flex-wrap gap-1 focus-within:border-sky-500 transition-colors cursor-text"
      onClick={() => inputRef.current?.focus()}>
      {tags.map((t, i) => (
        <span key={i} className="flex items-center gap-1 bg-sky-900/60 border border-sky-700 text-sky-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
          {t}
          <button type="button" onClick={e => { e.stopPropagation(); onChange(tags.filter((_, idx) => idx !== i)); }} className="text-sky-500 hover:text-sky-200 leading-none">×</button>
        </span>
      ))}
      <input ref={inputRef}
        className="bg-transparent text-xs text-slate-200 placeholder-slate-600 outline-none flex-1 min-w-[80px]"
        placeholder={tags.length ? "" : placeholder}
        value={input} onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey} onPaste={handlePaste}/>
    </div>
  );
}

function ScoreBar({ label, value, color }) {
  return (
    <div className="mt-1.5">
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-[9px] text-slate-500 tracking-widest uppercase">{label}</span>
        <span className="text-[10px] font-bold font-mono" style={{ color }}>{value}</span>
      </div>
      <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width:`${value}%`, background:color, boxShadow:`0 0 6px ${color}88` }}/>
      </div>
    </div>
  );
}

function CompanyScores({ node }) {
  return (
    <div className="mt-2 space-y-0.5">
      {node.talentDensity != null && <ScoreBar label="Talent Density" value={node.talentDensity} color="#38bdf8"/>}
      {node.confidence != null && <ScoreBar label="Relevance" value={node.confidence} color="#34d399"/>}
      {node.poachability != null && <ScoreBar label="Poachability" value={node.poachability} color="#facc15"/>}
      {node.likelyProfile && (
        <div className="mt-2 pt-2 border-t border-slate-700/50">
          <div className="text-[9px] text-slate-500 tracking-widest uppercase mb-1">Likely Talent Profile</div>
          <div className="text-[10px] text-slate-400 leading-relaxed">{node.likelyProfile}</div>
        </div>
      )}
      {node.poachabilitySignals?.length > 0 && (
        <div className="mt-2 pt-2 border-t border-yellow-900/40">
          <div className="text-[9px] text-yellow-600 tracking-widest uppercase mb-1">Poachability Signals</div>
          {node.poachabilitySignals.map((s, i) => (
            <div key={i} className="flex gap-1.5 mt-1">
              <span className="text-yellow-600 text-[9px] mt-0.5 flex-shrink-0">•</span>
              <span className="text-[10px] text-slate-400 leading-relaxed">{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HoverTooltip({ node, visible }) {
  if (!node.whyRelevant && !node.searchTitles?.length) return null;
  return (
    <div className="absolute top-0 left-full z-50 pl-2 pointer-events-none"
      style={{ width:"240px", opacity:visible?1:0, transform:visible?"translateX(0)":"translateX(-12px)", transition:"opacity 0.25s ease, transform 0.25s ease" }}>
      <div className="bg-slate-800 border border-sky-500/40 rounded-lg p-3 shadow-xl" style={{borderLeft:"3px solid #38bdf8"}}>
        {node.whyRelevant && (
          <div className="mb-2">
            <div className="text-[9px] text-sky-400 tracking-widest uppercase mb-1">Why relevant</div>
            <div className="text-[11px] text-slate-300 leading-relaxed">{node.whyRelevant}</div>
          </div>
        )}
        {node.searchTitles?.length > 0 && (
          <div>
            <div className="text-[9px] text-sky-400 tracking-widest uppercase mb-1">Quick LinkedIn search</div>
            <div className="flex flex-col gap-1 mt-1" style={{pointerEvents:"all"}}>
              {node.searchTitles.map((t, i) => (
                <span key={i}
                  className="text-[10px] bg-sky-900/60 border border-sky-700/60 text-sky-300 px-1.5 py-0.5 rounded font-mono cursor-pointer hover:bg-sky-800/60"
                  onClick={() => window.open(`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(t)}`, "_blank")}
                >{t} ↗</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NodeCard({ node, category }) {
  const [hovered, setHovered] = useState(false);
  const s = CATEGORY_STYLES[category];
  const hasTooltip = category === "companies" && (node.whyRelevant || node.searchTitles?.length > 0);
  return (
    <div id={`node-${node.id}`}
      className={`relative rounded border ${s.bg} ${s.border} p-3 transition-all duration-200 select-none overflow-visible ${hovered?"shadow-lg z-20":"hover:shadow-md"}`}
      style={{ boxShadow: hovered?`0 0 16px 2px ${s.dot}55`:undefined }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className={`text-xs font-bold tracking-widest uppercase ${s.text}`}>{node.label}</div>
        {node.stage && <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono whitespace-nowrap flex-shrink-0 ${STAGE_STYLES[node.stage]||"bg-slate-800 text-slate-400 border-slate-600"}`}>{node.stage}</span>}
      </div>
      {node.sub && <div className="text-xs text-slate-400">{node.sub}</div>}
      {node.tags && <div className="flex flex-wrap gap-1 mt-2">{node.tags.map(t=><span key={t} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${s.badge}`}>{t}</span>)}</div>}
      {category === "companies" && <CompanyScores node={node}/>}
      {category === "titles" && node.confidence != null && (
        <div className="mt-2"><ScoreBar label="Match Confidence" value={node.confidence} color={node.confidence>=80?"#34d399":node.confidence>=60?"#facc15":"#f87171"}/></div>
      )}
      {hasTooltip && <HoverTooltip node={node} visible={hovered}/>}
    </div>
  );
}

function Section({ category, nodes }) {
  const s = CATEGORY_STYLES[category];
  const descriptions = {
    companies:"Direct sourcing targets — companies where your ideal candidate likely works today",
    adjacent: "Companies with transferable skills — not obvious, but highly relevant",
    wildcards:"Unconventional bets — surprising sources most recruiters never think to check",
    titles:   "Exact LinkedIn search terms — copy these directly into your search",
  };
  return (
    <div className="mb-8">
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{background:s.dot,boxShadow:`0 0 6px ${s.dot}`}}/>
          <span className={`text-xs font-bold tracking-[0.2em] uppercase ${s.text}`}>{s.label}</span>
          <div className="flex-1 border-t border-dashed" style={{borderColor:s.dot+"44"}}/>
          <span className="text-[10px] font-mono text-slate-500">{nodes.length} nodes</span>
        </div>
        <div className="text-[10px] text-slate-600 ml-4">{descriptions[category]}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {nodes.map(n=><NodeCard key={n.id} node={n} category={category}/>)}
      </div>
    </div>
  );
}

function OutreachSection({ companies }) {
  const [activeCompany, setActiveCompany] = useState(0);
  const [copied, setCopied] = useState(null);
  const company = companies[activeCompany];
  if (!company?.outreachMessages?.length) return null;

  function copy(text, idx) {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full" style={{background:"#f97316",boxShadow:"0 0 6px #f97316"}}/>
        <span className="text-xs font-bold tracking-[0.2em] uppercase text-orange-300">Outreach Messages</span>
        <div className="flex-1 border-t border-dashed border-orange-900/60"/>
      </div>
      <div className="text-[10px] text-slate-600 ml-4 mb-4">Channel + angle combinations — click to copy, fill in [placeholders] before sending</div>

      {/* Company tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {companies.map((c, i) => (
          <button key={i} type="button" onClick={() => setActiveCompany(i)}
            className={`text-[10px] px-2.5 py-1 rounded border font-mono transition-all ${i===activeCompany?"bg-orange-500/20 border-orange-500 text-orange-300":"bg-slate-800 border-slate-600 text-slate-500 hover:border-slate-400"}`}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Messages grid */}
      <div className="grid grid-cols-2 gap-3">
        {company.outreachMessages.map((msg, i) => (
          <div key={i} className="bg-slate-900 border border-slate-700 rounded-lg p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-[9px] px-2 py-0.5 rounded border font-mono font-bold ${CHANNEL_STYLES[msg.channel]||"bg-slate-800 border-slate-600 text-slate-400"}`}>{msg.channel}</span>
                <span className="text-[9px] text-slate-500 tracking-widest uppercase">{msg.angle}</span>
              </div>
              <button type="button" onClick={() => copy(msg.message, i)}
                className="text-[9px] text-slate-500 hover:text-sky-400 transition-colors px-1.5 py-0.5 border border-slate-700 rounded hover:border-sky-700">
                {copied===i ? "✓ Copied" : "Copy"}
              </button>
            </div>
            <div className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">{msg.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function XRaySection({ xraySearches }) {
  const [copied, setCopied] = useState(null);
  if (!xraySearches?.length) return null;

  function copy(text, idx) {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full" style={{background:"#34d399",boxShadow:"0 0 6px #34d399"}}/>
        <span className="text-xs font-bold tracking-[0.2em] uppercase text-emerald-300">LinkedIn X-Ray Searches</span>
        <div className="flex-1 border-t border-dashed border-emerald-900/60"/>
      </div>
      <div className="text-[10px] text-slate-600 ml-4 mb-4">Google dork strings — paste directly into Google to find LinkedIn profiles</div>

      <div className="space-y-2">
        {xraySearches.map((s, i) => (
          <div key={i} className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
            <div className="flex-1">
              <div className="text-[9px] text-slate-500 tracking-widest uppercase mb-1">{s.label}</div>
              <div className="text-[11px] text-emerald-300 font-mono leading-relaxed break-all">{s.query}</div>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <button type="button" onClick={() => copy(s.query, i)}
                className="text-[9px] text-slate-500 hover:text-emerald-400 transition-colors px-1.5 py-0.5 border border-slate-700 rounded hover:border-emerald-700">
                {copied===i ? "✓" : "Copy"}
              </button>
              <button type="button"
                onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(s.query)}`, "_blank")}
                className="text-[9px] text-slate-500 hover:text-sky-400 transition-colors px-1.5 py-0.5 border border-slate-700 rounded hover:border-sky-700">
                Search ↗
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildPrompt(form) {
  return `You are a talent intelligence system for a company called Atlan. Return a structured talent map as JSON only — no markdown, no explanation, no backticks.

${ATLAN_CONTEXT}

${OUTREACH_EXAMPLE}

Role: ${form.role}
Hiring Company: ${form.company}
Location: ${form.location}
Seniority: ${form.seniority}
Skills: ${form.skills.join(", ")}
Preferred Industries: ${form.industries.join(", ") || "Any"}
Exclusions (do NOT include these): ${form.exclusions.join(", ") || "None"}

Return this exact JSON structure:
{
  "companies": [{
    "id": "c1", "label": "Company Name", "sub": "Industry · Size",
    "tags": ["tag1"], "connections": [], "confidence": 85, "stage": "Series B",
    "talentDensity": 78, "poachability": 65,
    "likelyProfile": "One sentence describing the typical engineer background.",
    "poachabilitySignals": ["[Signal] First reason", "[Confirmed] Second reason"],
    "whyRelevant": "1-2 sentences explaining why this company is a good source for this role.",
    "searchTitles": ["Exact Title 1", "Exact Title 2"],
    "outreachMessages": [
      { "channel": "LinkedIn InMail", "angle": "Atlan Context Layer", "message": "Subject: [Your name] → [role] at Atlan\n\nHi [First name],\n\nI noticed your work at [Company] on [specific area]. At Atlan, we're building the enterprise context layer for AI — the shared institutional knowledge that makes AI agents actually understand a business, not just answer generic questions.\n\n[Personalized line about their specific work and how it connects]. We're hiring a [role] to [specific responsibility].\n\nWorth a 20-min call? [Your name]" },
      { "channel": "LinkedIn DM", "angle": "Poachability Signal", "message": "Hey [First name] — following the [signal about their company e.g. recent changes]. Thought it might be good timing to share what we're building at Atlan. [One line on the role]. Open to a quick chat?" },
      { "channel": "Email", "angle": "Career Growth", "message": "Subject: [Role] opportunity — Atlan\n\nHi [First name],\n\nYour background at [Company] in [specific area] caught my attention. We're looking for a [role] at Atlan to [key responsibility].\n\nWhat makes this different: [career growth angle specific to their background]. Engineers here move fast — [specific growth signal].\n\nHappy to share more if this is interesting. [Your name]" },
      { "channel": "Email", "angle": "Tech Stack", "message": "Subject: Your [specific tech] experience + what we're building\n\nHi [First name],\n\nI came across your work on [specific tech from their background]. At Atlan, we're using [relevant tech stack] to solve [specific technical problem]. \n\nWe're hiring a [role] — the tech problems are genuinely hard: [specific technical challenge]. Given your experience with [their tech], I think you'd find it interesting.\n\nWorth a conversation? [Your name]" },
      { "channel": "Referral", "angle": "Network Ask", "message": "Hi [First name],\n\nI'm hiring a [role] at Atlan and thought you might know someone. We're building [one line on context layer]. Looking for someone with [key skill from their network].\n\nIf anyone comes to mind, I'd really appreciate an intro. Happy to return the favour anytime. [Your name]" },
      { "channel": "Cold Intro", "angle": "Mission/Vision", "message": "Hi [First name],\n\nBuilding the context layer for enterprise AI is one of the hardest unsolved problems in data right now — and it's what we do at Atlan.\n\nI'm recruiting a [role] to [core mission of the role]. Given your work at [Company] on [relevant area], I think you'd have a strong point of view on this.\n\nNo pressure — just curious if you'd be open to a conversation. [Your name]" }
    ]
  }],
  "adjacent": [{ "id": "a1", "label": "Company Name", "sub": "Why their talent is transferable", "tags": ["tag1"], "connections": [] }],
  "wildcards": [{ "id": "w1", "label": "Real Company Name", "sub": "Specific non-obvious reason their engineers are a great match", "tags": ["overlap"], "connections": [] }],
  "titles": [{ "id": "t1", "label": "Exact Job Title", "sub": "Which companies commonly use this title", "tags": ["variant"], "connections": [], "confidence": 90 }],
  "xraySearches": [
    { "label": "Target title at top companies", "query": "site:linkedin.com/in intitle:\"[exact title]\" (\"[Company1]\" OR \"[Company2]\" OR \"[Company3]\")" },
    { "label": "Skills + seniority combo", "query": "site:linkedin.com/in inurl:in \"[skill1]\" \"[skill2]\" \"[seniority]\"" },
    { "label": "Title variants across companies", "query": "site:linkedin.com/in intitle:(\"[title variant 1]\" OR \"[title variant 2]\") (\"[Company1]\" OR \"[Company2]\")" },
    { "label": "Location + role filter", "query": "site:linkedin.com/in intitle:\"[title]\" \"[location]\" \"[key skill]\"" },
    { "label": "Adjacent pool sourcing", "query": "site:linkedin.com/in intitle:\"[adjacent title]\" (\"[Adjacent Company 1]\" OR \"[Adjacent Company 2]\") \"[key skill]\"" }
  ]
}

Rules:
- 6-8 companies (mix of established AND 3-4 notable startups)
- NEVER include "${form.company}" in target companies
- CRITICAL: Only include real companies that actually exist
- adjacent = 4-5 specific COMPANIES (not job titles) with transferable skills
- wildcards = 3-4 unconventional REAL companies with a specific non-obvious reason
- titles = 5-7 EXACT job titles as they appear on real job postings
- outreachMessages = exactly 6 messages. ALL messages must follow the example style above — mission-led, specific to what that company builds, connects their skills to the role, under 150 words, ends with "Open to a quick chat?". Vary by channel and angle but keep the Atlan voice consistent. Use [placeholders] for personalisation (name, specific skill, specific area of their work).
- xraySearches = 5 Google dork strings using site:linkedin.com/in, intitle:, inurl:, specific to this role and target companies
- confidence = relevance 0-100, talentDensity = 0-100, poachability = 0-100
- poachabilitySignals = exactly 2-3 strings prefixed [Signal] or [Confirmed]
- likelyProfile = 1 sentence max
- stage = one of: Public / Late Stage / Series C+ / Series B / Series A / Seed / Enterprise
- Return ONLY raw valid JSON. No markdown. No backticks.`;
}

const EMPTY = { companies:[], adjacent:[], wildcards:[], titles:[], xraySearches:[] };

export default function TalentMap() {
  const [form, setForm] = useState({ role:"", company:"", location:"", seniority:"Senior", skills:[], industries:[], exclusions:[] });
  const [mapData, setMapData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState(false);
  const [showJD, setShowJD] = useState(false);
  const jdRef = useRef(null);
  const mapRef = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const allNodes = mapData ? [...mapData.companies, ...mapData.adjacent, ...mapData.wildcards, ...mapData.titles] : [];

  async function parseJD() {
    const jdText = jdRef.current?.value || "";
    if (!jdText.trim()) return;
    setParsing(true); setError("");
    try {
      const res = await fetch("/api/generate", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"llama-3.3-70b-versatile", max_tokens:500, messages:[{ role:"user", content:`Extract from this job description and return ONLY raw valid JSON, no markdown:
{ "role": "exact job title", "seniority": "Junior/Mid/Senior/Staff/Principal/Director/VP", "skills": ["skill1","skill2","skill3"] }
Job Description: ${jdText.slice(0,2000)}` }] })
      });
      const data = await res.json();
      const raw = data.content?.map(b=>b.text||"").join("").trim();
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setForm(f => ({ ...f, role:parsed.role||f.role, seniority:parsed.seniority||f.seniority, skills:parsed.skills?.length?parsed.skills:f.skills }));
      setShowJD(false);
    } catch(e) { setError(`JD parse failed: ${e.message}`); }
    setParsing(false);
  }

  async function generate() {
    if (!form.role.trim()) { setError("Role is required."); return; }
    setError(""); setLoading(true); setMapData(null);
    try {
      const res = await fetch("/api/generate", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"llama-3.3-70b-versatile", max_tokens:4000, messages:[{ role:"user", content:buildPrompt(form) }] })
      });
      const data = await res.json();
      if (!res.ok) { setError(`API error ${res.status}: ${JSON.stringify(data)}`); setLoading(false); return; }
      const raw = data.content?.map(b=>b.text||"").join("").trim();
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setMapData({ ...EMPTY, ...parsed });
      setGenerated(true);
    } catch(e) { setError(`Error: ${e.message}`); }
    setLoading(false);
  }

  function exportCSV() {
    const rows = [["Section","Company/Title","Stage","Relevance","Talent Density","Poachability","Likely Profile","Poachability Signals","Why Relevant","Search Titles","Tags"]];
    mapData.companies.forEach(n => rows.push(["Target Company",n.label,n.stage||"",n.confidence||"",n.talentDensity||"",n.poachability||"",n.likelyProfile||"",(n.poachabilitySignals||[]).join(" | "),n.whyRelevant||"",(n.searchTitles||[]).join(" | "),(n.tags||[]).join(", ")]));
    mapData.adjacent.forEach(n => rows.push(["Adjacent Pool",n.label,"","","","","","",n.sub||"","",(n.tags||[]).join(", ")]));
    mapData.wildcards.forEach(n => rows.push(["Wildcard Bet",n.label,"","","","","","",n.sub||"","",(n.tags||[]).join(", ")]));
    mapData.titles.forEach(n => rows.push(["Target Title",n.label,"",n.confidence||"","","","","",n.sub||"","",(n.tags||[]).join(", ")]));
    const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv],{type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download=`SourcingCompass_${form.role.replace(/\s+/g,"_")}_${form.company||"export"}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-screen bg-slate-950 font-mono overflow-hidden">
      {/* LEFT PANEL */}
      <div className="w-[30%] min-w-[260px] border-r border-slate-700/60 flex flex-col bg-slate-900/90 z-10">
        <div className="px-5 pt-5 pb-4 border-b border-slate-700/50">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-sm bg-sky-400" style={{boxShadow:"0 0 8px #38bdf8"}}/>
            <span className="text-sky-400 text-xs font-bold tracking-[0.25em] uppercase">SourcingCompass</span>
          </div>
          <div className="text-[10px] text-slate-500 tracking-wider">Talent Intelligence System</div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Role Title</label>
              <input className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
                placeholder="e.g. Staff Engineer" value={form.role} onChange={e=>set("role",e.target.value)}/>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Hiring Company</label>
              <input className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
                placeholder="e.g. Atlan" value={form.company} onChange={e=>set("company",e.target.value)}/>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Location</label>
              <input className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
                placeholder="e.g. North America" value={form.location} onChange={e=>set("location",e.target.value)}/>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Seniority</label>
              <select className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                value={form.seniority} onChange={e=>set("seniority",e.target.value)}>
                {["Junior","Mid","Senior","Staff","Principal","Director","VP"].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Must-Have Skills</label>
            <TagInput placeholder="Type skill, press , or Enter" tags={form.skills} onChange={v=>set("skills",v)}/>
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Preferred Industries</label>
            <TagInput placeholder="e.g. Fintech, Data" tags={form.industries} onChange={v=>set("industries",v)}/>
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Exclusions</label>
            <TagInput placeholder="Companies or industries to skip" tags={form.exclusions} onChange={v=>set("exclusions",v)}/>
          </div>
          <div>
            <button type="button" onClick={()=>setShowJD(v=>!v)}
              className="text-[10px] text-sky-500 hover:text-sky-300 tracking-widest uppercase transition-colors">
              {showJD?"▾ Hide":"▸ Paste"} Job Description
            </button>
            {showJD && (
              <div className="mt-2 space-y-2">
                <textarea ref={jdRef} rows={6}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 resize-none"
                  placeholder="Paste your JD here..."/>
                <button type="button" onClick={parseJD} disabled={parsing}
                  className="w-full py-2 rounded text-xs font-bold tracking-widest uppercase bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 transition-all">
                  {parsing?"Parsing...":"⚡ Parse JD — Auto-fill Fields"}
                </button>
              </div>
            )}
          </div>
          <div className="text-[9px] text-slate-600 bg-slate-800/50 border border-slate-700 rounded px-3 py-2 leading-relaxed">
            ⚠ AI-generated results. Verify companies before sourcing.
          </div>
          {error && <div className="text-[11px] text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">{error}</div>}
          <button type="button" onClick={generate} disabled={loading}
            className="w-full py-2.5 rounded text-xs font-bold tracking-widest uppercase bg-sky-500 hover:bg-sky-400 text-slate-900 disabled:opacity-50 transition-all"
            style={{boxShadow:loading?"none":"0 0 12px #38bdf855"}}>
            {loading?"Generating...":"Generate Map"}
          </button>
        </div>
        <div className="px-5 py-4 border-t border-slate-700/50 space-y-2">
          <div className="text-[9px] text-slate-600 tracking-widest uppercase mb-2">Legend</div>
          {Object.entries(CATEGORY_STYLES).map(([k,s])=>(
            <div key={k} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:s.dot}}/>
              <span className="text-[10px] text-slate-500">{s.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:"#f97316"}}/>
            <span className="text-[10px] text-slate-500">Outreach Messages</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:"#34d399"}}/>
            <span className="text-[10px] text-slate-500">X-Ray Searches</span>
          </div>
        </div>
      </div>

      {/* RIGHT MAP */}
      <div className="flex-1 relative overflow-y-auto" ref={mapRef}>
        <BlueprintGrid/>
        {!generated && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
            <div className="text-slate-700 text-4xl mb-4">⊕</div>
            <div className="text-slate-500 text-xs tracking-widest uppercase">Configure inputs and hit Generate Map</div>
            <div className="text-slate-700 text-[10px] mt-2">AI-powered talent intelligence will populate here</div>
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin"/>
            <div className="text-sky-400 text-xs tracking-widest uppercase animate-pulse">Mapping talent landscape...</div>
          </div>
        )}
        {mapData && !loading && (
          <div className="relative z-10 p-8">
            <div className="mb-8 pb-4 border-b border-slate-700/50 flex items-start justify-between gap-4">
              <div>
                <div className="text-slate-300 text-sm font-bold tracking-widest uppercase">{form.role} · {form.seniority}</div>
                <div className="text-slate-500 text-xs mt-1">{[form.company,form.location].filter(Boolean).join(" · ")}</div>
                <div className="text-[10px] text-slate-600 mt-2">{allNodes.length} nodes · outreach messages + x-ray searches below</div>
              </div>
              <button type="button" onClick={exportCSV}
                className="flex-shrink-0 py-2 px-3 rounded text-xs font-bold tracking-widest uppercase bg-emerald-600 hover:bg-emerald-500 text-white transition-all">
                ↓ CSV
              </button>
            </div>
            <Section category="companies" nodes={mapData.companies}/>
            <Section category="adjacent" nodes={mapData.adjacent}/>
            <Section category="wildcards" nodes={mapData.wildcards}/>
            <Section category="titles" nodes={mapData.titles}/>
            <OutreachSection companies={mapData.companies}/>
            <XRaySection xraySearches={mapData.xraySearches}/>
          </div>
        )}
      </div>
    </div>
  );
}
