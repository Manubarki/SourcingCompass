import { useState, useRef } from "react";

const GRID_SIZE = 40;

const ATLAN_CONTEXT = [
  "Atlan is a data catalog and active metadata platform that helps companies build an enterprise context layer for AI.",
  "Context layer = shared institutional knowledge (definitions, rules, relationships) made machine-readable for AI agents.",
  "Context products = data + meaning packaged as reusable units per domain.",
  "Minimum Viable Context (MVC) = when an AI agent can reliably answer golden questions for a domain.",
  "Key belief: In a world where everyone has the same models, context becomes the company's real IP.",
  "Atlan solves the AI context gap — models are smart but do not understand your business without context.",
  "Used by data teams, CDOs, and AI platform teams to stop context from fragmenting across agents.",
].join(" ");

const OUTREACH_EXAMPLE = [
  "OUTREACH STYLE GUIDE — generate 4 LinkedIn InMail messages, each with a genuinely different angle and tone. Do NOT repeat the same structure with different skill words.",
  "",
  "Example of the base Atlan style (use this as the voice/tone reference):",
  "I hope you are doing well. I am reaching out from Atlan. Our mission is to become the context layer for the AI world — building the foundational primitives that will power the next generation of apps and agents. One of the core bets is our data platform: Building a control plane that transforms existing lakehouse architectures into AI-ready context stores with governance, multimodal capabilities, and extensibility. Your background as a [title], with experience in [specific area], aligns well with our needs. We are looking for someone to take deep ownership of [responsibility] — end-to-end, high impact. Your expertise in [skill1] and [skill2] would be invaluable to our team. We are also intentionally AI-native in how we design and ship systems. Open to a quick chat?",
  "",
  "The 4 messages must each take a DIFFERENT approach:",
  "Message 1 — Mission angle: Lead with Atlan mission and context layer vision. Connect their specific work at this company to the problem Atlan is solving.",
      "Message 2 — Poachability angle (short, casual LinkedIn DM, NOT InMail): Use ONLY the real poachability signals provided below for this company. Reference the specific signal directly. Keep it under 50 words, casual tone, no mission statement. Frame Atlan as the right next step given their specific situation.",
  "Message 3 — Technical challenge angle: Lead with a specific hard technical problem at Atlan (not the mission). Make it sound intellectually exciting. Connect to their tech background.",
  "Message 4 — Career ownership angle: Lead with scope and ownership. What they would own at Atlan, why it is rare. Do not mention mission — sell the role itself.",
  "",
  "Rules for all 4:",
  "- Channel is always LinkedIn InMail",
  "- Use [placeholders] for name, specific skill, specific area of their work",
  "- Under 120 words each",
  "- End every message with: Open to a quick chat?",
  "- No fluff, no generic praise, no repeating the same structure",
].join("\n");

function BlueprintGrid() {
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
          <button type="button" onClick={e => { e.stopPropagation(); onChange(tags.filter((_, idx) => idx !== i)); }} className="text-sky-500 hover:text-sky-200 leading-none">x</button>
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
      {node.poachabilitySignals && node.poachabilitySignals.length > 0 && (
        <div className="mt-2 pt-2 border-t border-yellow-900/40">
          <div className="text-[9px] text-yellow-600 tracking-widest uppercase mb-1">Poachability Signals</div>
          {node.poachabilitySignals.map((s, i) => (
            <div key={i} className="flex gap-1.5 mt-1">
              <span className="text-yellow-600 text-[9px] mt-0.5 flex-shrink-0">*</span>
              <span className="text-[10px] text-slate-400 leading-relaxed">{s}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HoverTooltip({ node, visible }) {
  if (!node.whyRelevant) return null;
  return (
    <div className="absolute top-0 left-full z-50 pl-2 pointer-events-none"
      style={{ width:"240px", opacity:visible?1:0, transform:visible?"translateX(0)":"translateX(-12px)", transition:"opacity 0.25s ease, transform 0.25s ease" }}>
      <div className="bg-slate-800 border border-sky-500/40 rounded-lg p-3 shadow-xl" style={{borderLeft:"3px solid #38bdf8"}}>
        <div className="text-[9px] text-sky-400 tracking-widest uppercase mb-1">Why relevant</div>
        <div className="text-[11px] text-slate-300 leading-relaxed">{node.whyRelevant}</div>
      </div>
    </div>
  );
}

function NodeCard({ node, category }) {
  const [hovered, setHovered] = useState(false);
  const s = CATEGORY_STYLES[category];
  const hasTooltip = category === "companies" && node.whyRelevant;
  return (
    <div id={"node-" + node.id}
      className={"relative rounded border " + s.bg + " " + s.border + " p-3 transition-all duration-200 select-none overflow-visible " + (hovered ? "shadow-lg z-20" : "hover:shadow-md")}
      style={{ boxShadow: hovered ? "0 0 16px 2px " + s.dot + "55" : undefined }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className={"text-xs font-bold tracking-widest uppercase " + s.text}>{node.label}</div>
        {node.stage && <span className={"text-[9px] px-1.5 py-0.5 rounded border font-mono whitespace-nowrap flex-shrink-0 " + (STAGE_STYLES[node.stage] || "bg-slate-800 text-slate-400 border-slate-600")}>{node.stage}</span>}
      </div>
      {node.sub && <div className="text-xs text-slate-400">{node.sub}</div>}
      {node.tags && <div className="flex flex-wrap gap-1 mt-2">{node.tags.map(t => <span key={t} className={"text-[10px] px-1.5 py-0.5 rounded font-mono " + s.badge}>{t}</span>)}</div>}
      {category === "companies" && <CompanyScores node={node}/>}
      {category === "titles" && node.confidence != null && (
        <div className="mt-2"><ScoreBar label="Match Confidence" value={node.confidence} color={node.confidence >= 80 ? "#34d399" : node.confidence >= 60 ? "#facc15" : "#f87171"}/></div>
      )}
      {hasTooltip && <HoverTooltip node={node} visible={hovered}/>}
    </div>
  );
}

function LoadingScreen() {
  const [step, setStep] = useState(0);
  const steps = ["Target Companies", "Adjacent Talent Pools", "Wildcard Bets", "Target Titles"];

  useState(() => {
    const interval = setInterval(() => {
      setStep(s => (s + 1) % steps.length);
    }, 800);
    return () => clearInterval(interval);
  });

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
      <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin"/>
      <div className="space-y-2 text-center">
        {steps.map((s, i) => (
          <div key={s} className={"flex items-center gap-2 transition-all duration-300 " + (i === step ? "opacity-100" : "opacity-20")}>
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{
              background: ["#38bdf8","#a78bfa","#fb923c","#34d399"][i],
              boxShadow: i === step ? "0 0 6px " + ["#38bdf8","#a78bfa","#fb923c","#34d399"][i] : "none"
            }}/>
            <span className={"text-xs tracking-widest uppercase font-mono " + (i === step ? ["text-sky-300","text-violet-300","text-orange-300","text-emerald-300"][i] : "text-slate-600")}>
              {s}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
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
          <div className="w-2 h-2 rounded-full" style={{background:s.dot, boxShadow:"0 0 6px " + s.dot}}/>
          <span className={"text-xs font-bold tracking-[0.2em] uppercase " + s.text}>{s.label}</span>
          <div className="flex-1 border-t border-dashed" style={{borderColor:s.dot + "44"}}/>
          <span className="text-[10px] font-mono text-slate-500">{nodes.length} nodes</span>
        </div>
        <div className="text-[10px] text-slate-600 ml-4">{descriptions[category]}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {nodes.map(n => <NodeCard key={n.id} node={n} category={category}/>)}
      </div>
    </div>
  );
}

function buildOutreachPrompt(company, form) {
  return [
    "You are a talent sourcing assistant for Atlan. Generate 6 outreach messages for a candidate at " + company.label + ".",
    "",
    ATLAN_CONTEXT,
    "",
    OUTREACH_EXAMPLE,
    "",
    "Role we are hiring: " + form.role,
    "Seniority: " + form.seniority,
    "Skills: " + form.skills.join(", "),
    "Target company: " + company.label,
    "Why relevant: " + (company.whyRelevant || company.sub || ""),
    "Poachability signals: " + (company.poachabilitySignals || []).join(", "),
    "Likely profile: " + (company.likelyProfile || ""),
    "",
    "Return ONLY this raw valid JSON, no markdown, no backticks:",
    '[{"channel":"LinkedIn InMail","angle":"Context Layer","message":"full message here"},{"channel":"LinkedIn DM","angle":"Poachability Signal","message":"full message here"},{"channel":"Email","angle":"Career Growth","message":"full message here"},{"channel":"Email","angle":"Tech Stack","message":"full message here"},{"channel":"Referral","angle":"Network Ask","message":"full message here"},{"channel":"Cold Intro","angle":"Mission/Vision","message":"full message here"}]',
    "",
    "Rules:",
    "- All 6 messages must follow the Atlan style from the example",
    "- Specific to " + company.label + " and the " + form.role + " role",
    "- Use [placeholders] for name, specific skill, specific area",
    "- Under 150 words each",
    "- End every message with: Open to a quick chat?",
    "- Return ONLY the JSON array, nothing else",
  ].join("\n");
}

function OutreachSection({ companies, form }) {
  const [activeCompany, setActiveCompany] = useState(0);
  const [outreachMap, setOutreachMap] = useState({});
  const [loadingIdx, setLoadingIdx] = useState(null);
  const [copied, setCopied] = useState(null);
  const [error, setError] = useState("");

  async function generateOutreach(company, idx) {
    setLoadingIdx(idx); setError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model:"llama-3.1-8b-instant", max_tokens:4000, messages:[{ role:"user", content:buildOutreachPrompt(company, form) }] })
      });
      const data = await res.json();
      const raw = data.content?.map(b => b.text || "").join("").trim();
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      const filtered = parsed.filter(m => !m.angle?.toLowerCase().includes("poachab"));
      setOutreachMap(prev => ({ ...prev, [company.id]: filtered }));
    } catch(e) { setError("Failed to generate: " + e.message); }
    setLoadingIdx(null);
  }

  function copy(text, key) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const company = companies[activeCompany];
  const messages = outreachMap[company?.id];

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full" style={{background:"#f97316", boxShadow:"0 0 6px #f97316"}}/>
        <span className="text-xs font-bold tracking-[0.2em] uppercase text-orange-300">Outreach Messages</span>
        <div className="flex-1 border-t border-dashed border-orange-900/60"/>
      </div>
      <div className="text-[10px] text-slate-600 ml-4 mb-4">Select a company and generate tailored messages — fill [placeholders] before sending</div>

      {/* Company tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {companies.map((c, i) => (
          <button key={i} type="button" onClick={() => setActiveCompany(i)}
            className={"text-[10px] px-2.5 py-1 rounded border font-mono transition-all flex items-center gap-1.5 " + (i === activeCompany ? "bg-orange-500/20 border-orange-500 text-orange-300" : "bg-slate-800 border-slate-600 text-slate-500 hover:border-slate-400")}>
            {c.label}
            {outreachMap[c.id] && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"/>}
          </button>
        ))}
      </div>

      {error && <div className="text-[11px] text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2 mb-4">{error}</div>}

      {!messages ? (
        <div className="border border-slate-700/50 border-dashed rounded-lg p-8 text-center">
          <div className="text-slate-500 text-xs mb-4">No outreach messages generated yet for <span className="text-slate-300">{company?.label}</span></div>
          <button type="button"
            onClick={() => generateOutreach(company, activeCompany)}
            disabled={loadingIdx === activeCompany}
            className="px-4 py-2 rounded text-xs font-bold tracking-widest uppercase bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-40 transition-all">
            {loadingIdx === activeCompany ? "Generating..." : "Generate Outreach Messages"}
          </button>
        </div>
      ) : (
        <div>
          <div className="flex justify-end mb-3">
            <button type="button"
              onClick={() => generateOutreach(company, activeCompany)}
              disabled={loadingIdx === activeCompany}
              className="text-[10px] px-2.5 py-1 rounded border border-slate-600 text-slate-500 hover:text-orange-400 hover:border-orange-700 transition-all">
              {loadingIdx === activeCompany ? "Regenerating..." : "Regenerate"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {messages.map((msg, i) => (
              <div key={i} className="bg-slate-900 border border-slate-700 rounded-lg p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={"text-[9px] px-2 py-0.5 rounded border font-mono font-bold " + (CHANNEL_STYLES[msg.channel] || "bg-slate-800 border-slate-600 text-slate-400")}>{msg.channel}</span>
                    <span className="text-[9px] text-slate-500 tracking-widest uppercase">{msg.angle}</span>
                  </div>
                  <button type="button" onClick={() => copy(msg.message, i + "-" + activeCompany)}
                    className="text-[9px] text-slate-500 hover:text-sky-400 transition-colors px-1.5 py-0.5 border border-slate-700 rounded hover:border-sky-700">
                    {copied === i + "-" + activeCompany ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">{msg.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}
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
        <div className="w-2 h-2 rounded-full" style={{background:"#34d399", boxShadow:"0 0 6px #34d399"}}/>
        <span className="text-xs font-bold tracking-[0.2em] uppercase text-emerald-300">LinkedIn X-Ray Searches</span>
        <div className="flex-1 border-t border-dashed border-emerald-900/60"/>
      </div>
      <div className="text-[10px] text-slate-600 ml-4 mb-4">Google dork strings — paste into Google to find LinkedIn profiles</div>
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
                {copied === i ? "Copied" : "Copy"}
              </button>
              <button type="button"
                onClick={() => window.open("https://www.google.com/search?q=" + encodeURIComponent(s.query), "_blank")}
                className="text-[9px] text-slate-500 hover:text-sky-400 transition-colors px-1.5 py-0.5 border border-slate-700 rounded hover:border-sky-700">
                Search
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TABS = [
  { id:"companies", label:"Target Companies", dot:"#38bdf8" },
  { id:"adjacent",  label:"Adjacent Pools",   dot:"#a78bfa" },
  { id:"wildcards", label:"Wildcard Bets",     dot:"#fb923c" },
  { id:"titles",    label:"Target Titles",     dot:"#34d399" },
];

function Tabs({ mapData, form }) {
  const [active, setActive] = useState("companies");
  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-6 border-b border-slate-700/50 pb-3">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setActive(t.id)}
            className={"flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold tracking-widest uppercase transition-all " + (active === t.id ? "bg-slate-700 text-slate-200" : "text-slate-500 hover:text-slate-300")}>
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background: active === t.id ? t.dot : "#475569", boxShadow: active === t.id ? "0 0 5px " + t.dot : "none"}}/>
            {t.label}
          </button>
        ))}
      </div>
      {active === "companies" && <Section category="companies" nodes={mapData.companies}/>}
      {active === "adjacent"  && <Section category="adjacent"  nodes={mapData.adjacent}/>}
      {active === "wildcards" && <Section category="wildcards" nodes={mapData.wildcards}/>}
      {active === "titles"    && <Section category="titles"    nodes={mapData.titles}/>}
    </div>
  );
}

function buildPrompt(form) {
  return [
    "You are a talent intelligence system for Atlan. Return a structured talent map as JSON only. No markdown, no explanation, no backticks.",
    "",
    ATLAN_CONTEXT,
    "",
    OUTREACH_EXAMPLE,
    "",
    "Role: " + form.role,
    "Hiring Company: " + form.company,
    "Location: " + form.location,
    "Seniority: " + form.seniority,
    "Skills: " + form.skills.join(", "),
    "Preferred Industries: " + (form.industries.join(", ") || "Any"),
    "Exclusions: " + (form.exclusions.join(", ") || "None"),
    "",
    "Return this JSON structure (replace all placeholder values with real content for " + form.role + " at " + form.company + "):",
    "{\"companies\":[{\"id\":\"c1\",\"label\":\"Company Name\",\"sub\":\"Industry Size\",\"tags\":[\"tag1\"],\"connections\":[],\"confidence\":85,\"stage\":\"Series B\",\"talentDensity\":78,\"poachability\":65,\"likelyProfile\":\"One sentence.\",\"poachabilitySignals\":[\"[Signal] reason\",\"[Confirmed] reason\"],\"whyRelevant\":\"1-2 sentences.\",\"searchTitles\":[\"Title 1\",\"Title 2\"]}],\"adjacent\":[{\"id\":\"a1\",\"label\":\"Company Name\",\"sub\":\"Why transferable\",\"tags\":[\"tag1\"],\"connections\":[]}],\"wildcards\":[{\"id\":\"w1\",\"label\":\"Company Name\",\"sub\":\"Non-obvious reason\",\"tags\":[\"overlap\"],\"connections\":[]}],\"titles\":[{\"id\":\"t1\",\"label\":\"Exact Job Title\",\"sub\":\"Companies using this title\",\"tags\":[\"variant\"],\"connections\":[],\"confidence\":90}],\"xraySearches\":[{\"label\":\"Title at target companies\",\"query\":\"site:linkedin.com/in intitle:Title Company1 OR Company2\"},{\"label\":\"Title variants\",\"query\":\"site:linkedin.com/in intitle:Title1 OR Title2 CompanyName\"},{\"label\":\"Skills in profile\",\"query\":\"site:linkedin.com/in intext:skill1 intext:skill2 intitle:Engineer\"},{\"label\":\"Seniority and skill\",\"query\":\"site:linkedin.com/in intitle:Staff OR Senior intext:skill1 intext:skill2\"},{\"label\":\"Adjacent pool\",\"query\":\"site:linkedin.com/in intitle:Title Company1 OR Company2 intext:skill\"}]}",
    "",
    "Rules:",
    "- 6-8 companies, mix of established and 3-4 startups",
    "- NEVER include " + form.company + " in results",
    "- Only real companies that actually exist",
    "- adjacent = 4-5 specific companies with transferable skills, not job titles",
    "- wildcards = 3-4 unconventional real companies with specific non-obvious reasons",
    "- titles = 5-7 exact job titles as on real postings",
    "- outreachMessages = 6 messages in Atlan style, specific to that company, [placeholders], under 150 words, ends with: Open to a quick chat?",
    "- xraySearches = 5 Google dork strings. ONLY use real Google operators: site:linkedin.com/in, intitle:, inurl:, intext:, \"quoted strings\", OR, -minus. Do NOT use fake operators like skill:, company:, seniority:, location: — these do not exist in Google.",
    "- confidence/talentDensity/poachability = 0-100",
    "- poachabilitySignals = 2-3 strings prefixed [Signal] or [Confirmed]",
    "- stage = Public / Late Stage / Series C+ / Series B / Series A / Seed / Enterprise",
    "- Return ONLY raw valid JSON.",
  ].join("\n");
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
        body: JSON.stringify({ model:"llama-3.3-70b-versatile", max_tokens:500, messages:[{ role:"user", content:"Extract from this job description and return ONLY raw valid JSON, no markdown: {\"role\":\"exact job title\",\"seniority\":\"Junior/Mid/Senior/Staff/Principal/Director/VP\",\"skills\":[\"skill1\",\"skill2\"]} Job Description: " + jdText.slice(0,2000) }] })
      });
      const data = await res.json();
      const raw = data.content?.map(b => b.text || "").join("").trim();
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setForm(f => ({ ...f, role:parsed.role||f.role, seniority:parsed.seniority||f.seniority, skills:parsed.skills?.length?parsed.skills:f.skills }));
      setShowJD(false);
    } catch(e) { setError("JD parse failed: " + e.message); }
    setParsing(false);
  }

  async function generate() {
    if (!form.role.trim()) { setError("Role is required."); return; }
    setError(""); setLoading(true); setMapData(null);
    try {
      const res = await fetch("/api/generate", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"llama-3.1-8b-instant", max_tokens:8000, messages:[{ role:"user", content:buildPrompt(form) }] })
      });
      const data = await res.json();
      if (!res.ok) { setError("API error " + res.status + ": " + JSON.stringify(data)); setLoading(false); return; }
      const raw = data.content?.map(b => b.text || "").join("").trim();
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setMapData({ ...EMPTY, ...parsed });
      setGenerated(true);
    } catch(e) { setError("Error: " + e.message); }
    setLoading(false);
  }

  function exportCSV() {
    const rows = [["Section","Company/Title","Stage","Relevance","Talent Density","Poachability","Likely Profile","Poachability Signals","Why Relevant","Search Titles","Tags"]];
    mapData.companies.forEach(n => rows.push(["Target Company",n.label,n.stage||"",n.confidence||"",n.talentDensity||"",n.poachability||"",n.likelyProfile||"",(n.poachabilitySignals||[]).join(" | "),n.whyRelevant||"",(n.searchTitles||[]).join(" | "),(n.tags||[]).join(", ")]));
    mapData.adjacent.forEach(n => rows.push(["Adjacent Pool",n.label,"","","","","","",n.sub||"","",(n.tags||[]).join(", ")]));
    mapData.wildcards.forEach(n => rows.push(["Wildcard Bet",n.label,"","","","","","",n.sub||"","",(n.tags||[]).join(", ")]));
    mapData.titles.forEach(n => rows.push(["Target Title",n.label,"",n.confidence||"","","","","",n.sub||"","",(n.tags||[]).join(", ")]));
    const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(",")).join("\n");
    const blob = new Blob([csv],{type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download="SourcingCompass_" + form.role.replace(/\s+/g,"_") + "_" + (form.company||"export") + ".csv";
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-screen bg-slate-950 font-mono overflow-hidden">
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
                placeholder="e.g. Staff Engineer" value={form.role} onChange={e => set("role", e.target.value)}/>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Hiring Company</label>
              <input className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
                placeholder="e.g. Atlan" value={form.company} onChange={e => set("company", e.target.value)}/>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Location</label>
              <input className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
                placeholder="e.g. North America" value={form.location} onChange={e => set("location", e.target.value)}/>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Seniority</label>
              <select className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                value={form.seniority} onChange={e => set("seniority", e.target.value)}>
                {["Junior","Mid","Senior","Staff","Principal","Director","VP"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Must-Have Skills</label>
            <TagInput placeholder="Type skill, press , or Enter" tags={form.skills} onChange={v => set("skills", v)}/>
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Preferred Industries</label>
            <TagInput placeholder="e.g. Fintech, Data" tags={form.industries} onChange={v => set("industries", v)}/>
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Exclusions</label>
            <TagInput placeholder="Companies or industries to skip" tags={form.exclusions} onChange={v => set("exclusions", v)}/>
          </div>
          <div>
            <button type="button" onClick={() => setShowJD(v => !v)}
              className="text-[10px] text-sky-500 hover:text-sky-300 tracking-widest uppercase transition-colors">
              {showJD ? "Hide" : "Paste"} Job Description
            </button>
            {showJD && (
              <div className="mt-2 space-y-2">
                <textarea ref={jdRef} rows={6}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 resize-none"
                  placeholder="Paste your JD here..."/>
                <button type="button" onClick={parseJD} disabled={parsing}
                  className="w-full py-2 rounded text-xs font-bold tracking-widest uppercase bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 transition-all">
                  {parsing ? "Parsing..." : "Parse JD — Auto-fill Fields"}
                </button>
              </div>
            )}
          </div>
          <div className="text-[9px] text-slate-600 bg-slate-800/50 border border-slate-700 rounded px-3 py-2 leading-relaxed">
            AI-generated results. Verify companies before sourcing.
          </div>
          {error && <div className="text-[11px] text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">{error}</div>}
          <button type="button" onClick={generate} disabled={loading}
            className="w-full py-2.5 rounded text-xs font-bold tracking-widest uppercase bg-sky-500 hover:bg-sky-400 text-slate-900 disabled:opacity-50 transition-all"
            style={{boxShadow:loading?"none":"0 0 12px #38bdf855"}}>
            {loading ? "Generating..." : "Generate Map"}
          </button>
        </div>
        <div className="px-5 py-4 border-t border-slate-700/50 space-y-2">
          <div className="text-[9px] text-slate-600 tracking-widest uppercase mb-2">Legend</div>
          {Object.entries(CATEGORY_STYLES).map(([k,s]) => (
            <div key={k} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:s.dot}}/>
              <span className="text-[10px] text-slate-500">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 relative overflow-y-auto" ref={mapRef}>
        <BlueprintGrid/>
        {!generated && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
            <div className="text-slate-700 text-4xl mb-4">+</div>
            <div className="text-slate-500 text-xs tracking-widest uppercase">Configure inputs and hit Generate Map</div>
            <div className="text-slate-700 text-[10px] mt-2">AI-powered talent intelligence will populate here</div>
          </div>
        )}
        {loading && <LoadingScreen/>}
        {mapData && !loading && (
          <div className="relative z-10 p-8">
            <div className="mb-6 pb-4 border-b border-slate-700/50 flex items-start justify-between gap-4">
              <div>
                <div className="text-slate-300 text-sm font-bold tracking-widest uppercase">{form.role} · {form.seniority}</div>
                <div className="text-slate-500 text-xs mt-1">{[form.company,form.location].filter(Boolean).join(" · ")}</div>
                <div className="text-[10px] text-slate-600 mt-2">{allNodes.length} nodes mapped</div>
              </div>
              <button type="button" onClick={exportCSV}
                className="flex-shrink-0 py-2 px-3 rounded text-xs font-bold tracking-widest uppercase bg-emerald-600 hover:bg-emerald-500 text-white transition-all">
                CSV
              </button>
            </div>
            <Tabs mapData={mapData} form={form}/>
          </div>
        )}
      </div>
    </div>
  );
}
