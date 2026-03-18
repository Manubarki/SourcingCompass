import { useState, useRef, useEffect } from "react";

const GRID_SIZE = 40;

const DOC_CONTEXT = "SourcingCompass is a talent intelligence tool built by Manu Barki at Atlan. It helps recruiters find where talent lives by generating a map of Target Companies, Adjacent Talent Pools, Wildcard Bets, and Target Titles for any role. It uses Claude Sonnet via Anthropic API, hosted on Vercel, built with React + Vite + Tailwind. The company memory is grounded in a MAD landscape dataset of 2000+ ML/AI/Data ecosystem companies. Key features: tag-based skill input (press comma or Enter), JD parser (paste JD to auto-fill fields), CSV export, poachability signals ([Signal] = inferred pattern, [Confirmed] = reported fact), talent density, relevance scores, hover tooltip showing why a company is relevant. Four result tabs: Target Companies (with scores), Adjacent Pools (transferable skills), Wildcard Bets (unconventional tech companies only), Target Titles (exact LinkedIn search terms with confidence scores). No outreach templates feature. Location filter ensures companies have engineering presence in the specified location. AI model: Claude Sonnet (claude-sonnet-4-20250514). The tool does NOT store any candidate data. API key is secure on server. The tool is intentionally stateless — every search is fresh. Poachability signals should not be used verbatim in outreach — use them to tailor your angle. Adjacent = one step removed from obvious. Wildcard = two or three steps removed, always a tech company. Target Titles help cast a wider LinkedIn net since same role has different titles at different companies.";

function BlueprintGrid() {
  return (
    <svg className="absolute inset-0 w-full h-full" style={{opacity:0.15}}>
      <defs>
        <pattern id="smallGrid" width={GRID_SIZE/4} height={GRID_SIZE/4} patternUnits="userSpaceOnUse">
          <path d={"M " + (GRID_SIZE/4) + " 0 L 0 0 0 " + (GRID_SIZE/4)} fill="none" stroke="#7dd3fc" strokeWidth="0.3"/>
        </pattern>
        <pattern id="grid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
          <rect width={GRID_SIZE} height={GRID_SIZE} fill="url(#smallGrid)"/>
          <path d={"M " + GRID_SIZE + " 0 L 0 0 0 " + GRID_SIZE} fill="none" stroke="#7dd3fc" strokeWidth="0.7"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)"/>
    </svg>
  );
}

const CAT = {
  companies: { bg:"bg-sky-900/80",    border:"border-sky-400",    text:"text-sky-300",    badge:"bg-sky-400/20 text-sky-300",    dot:"#38bdf8", label:"Target Companies",     desc:"Direct sourcing targets — companies where your ideal candidate likely works today" },
  adjacent:  { bg:"bg-violet-900/80", border:"border-violet-400", text:"text-violet-300", badge:"bg-violet-400/20 text-violet-300",dot:"#a78bfa", label:"Adjacent Talent Pools", desc:"Companies with transferable skills — not obvious, but highly relevant" },
  wildcards: { bg:"bg-orange-900/80", border:"border-orange-400", text:"text-orange-300", badge:"bg-orange-400/20 text-orange-300",dot:"#fb923c", label:"Wildcard Bets",          desc:"Unconventional bets — surprising sources most recruiters never think to check" },
  titles:    { bg:"bg-emerald-900/80",border:"border-emerald-400",text:"text-emerald-300",badge:"bg-emerald-400/20 text-emerald-300",dot:"#34d399", label:"Target Titles",         desc:"Exact LinkedIn search terms — copy these directly into your search" },
};

const STAGES = {
  "Public":    "bg-sky-900/60 text-sky-300 border-sky-700",
  "Enterprise":"bg-sky-900/60 text-sky-300 border-sky-700",
  "Late Stage":"bg-violet-900/60 text-violet-300 border-violet-700",
  "Series C+": "bg-violet-900/60 text-violet-300 border-violet-700",
  "Series B":  "bg-amber-900/60 text-amber-300 border-amber-700",
  "Series A":  "bg-orange-900/60 text-orange-300 border-orange-700",
  "Seed":      "bg-rose-900/60 text-rose-300 border-rose-700",
};

function TagInput({ placeholder, tags, onChange }) {
  const [input, setInput] = useState("");
  const ref = useRef(null);
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
    const parts = e.clipboardData.getData("text").split(/[,\n]+/).map(t => t.trim()).filter(Boolean);
    if (parts.length > 1) onChange([...tags, ...parts]);
    else setInput(parts[0] || "");
  }
  return (
    <div className="w-full min-h-[38px] bg-slate-800 border border-slate-600 rounded px-2 py-1.5 flex flex-wrap gap-1 focus-within:border-sky-500 cursor-text"
      onClick={() => ref.current?.focus()}>
      {tags.map((t, i) => (
        <span key={i} className="flex items-center gap-1 bg-sky-900/60 border border-sky-700 text-sky-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
          {t}
          <button type="button" onClick={e => { e.stopPropagation(); onChange(tags.filter((_, j) => j !== i)); }} className="text-sky-500 hover:text-sky-200 leading-none">x</button>
        </span>
      ))}
      <input ref={ref} className="bg-transparent text-xs text-slate-200 placeholder-slate-600 outline-none flex-1 min-w-[80px]"
        placeholder={tags.length ? "" : placeholder} value={input}
        onChange={e => setInput(e.target.value)} onKeyDown={handleKey} onPaste={handlePaste}/>
    </div>
  );
}

function Bar({ label, value, color }) {
  return (
    <div className="mt-1.5">
      <div className="flex justify-between mb-0.5">
        <span className="text-[9px] text-slate-500 tracking-widest uppercase">{label}</span>
        <span className="text-[10px] font-bold font-mono" style={{color}}>{value}</span>
      </div>
      <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{width:`${value}%`,background:color,boxShadow:`0 0 6px ${color}88`}}/>
      </div>
    </div>
  );
}

function CompanyCard({ node }) {
  const [hov, setHov] = useState(false);
  const s = CAT.companies;
  return (
    <div className={"relative rounded border " + s.bg + " " + s.border + " p-3 transition-all duration-200 select-none overflow-visible " + (hov ? "shadow-lg z-20" : "hover:shadow-md")}
      style={{boxShadow: hov ? "0 0 16px 2px " + s.dot + "55" : undefined}}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className={"text-xs font-bold tracking-widest uppercase " + s.text}>{node.label}</div>
        {node.stage && <span className={"text-[9px] px-1.5 py-0.5 rounded border font-mono whitespace-nowrap flex-shrink-0 " + (STAGES[node.stage] || "bg-slate-800 text-slate-400 border-slate-600")}>{node.stage}</span>}
      </div>
      {node.sub && <div className="text-xs text-slate-400">{node.sub}</div>}
      {node.tags && <div className="flex flex-wrap gap-1 mt-2">{node.tags.map(t => <span key={t} className={"text-[10px] px-1.5 py-0.5 rounded font-mono " + s.badge}>{t}</span>)}</div>}
      {node.talentDensity != null && <Bar label="Talent Density" value={node.talentDensity} color="#38bdf8"/>}
      {node.confidence != null && <Bar label="Relevance" value={node.confidence} color="#34d399"/>}
      {node.poachability != null && <Bar label="Poachability" value={node.poachability} color="#facc15"/>}
      {node.likelyProfile && (
        <div className="mt-2 pt-2 border-t border-slate-700/50">
          <div className="text-[9px] text-slate-500 tracking-widest uppercase mb-1">Likely Talent Profile</div>
          <div className="text-[10px] text-slate-400 leading-relaxed">{node.likelyProfile}</div>
        </div>
      )}
      {node.poachabilitySignals && node.poachabilitySignals.length > 0 && (
        <div className="mt-2 pt-2 border-t border-yellow-900/40">
          <div className="text-[9px] text-yellow-600 tracking-widest uppercase mb-1">Poachability Signals</div>
          {node.poachabilitySignals.map((sig, i) => (
            <div key={i} className="flex gap-1.5 mt-1">
              <span className="text-yellow-600 text-[9px] mt-0.5 flex-shrink-0">*</span>
              <span className="text-[10px] text-slate-400 leading-relaxed">{sig}</span>
            </div>
          ))}
        </div>
      )}
      {node.whyRelevant && (
        <div className="absolute top-0 left-full z-50 pl-2 pointer-events-none"
          style={{width:"220px",opacity:hov?1:0,transform:hov?"translateX(0)":"translateX(-12px)",transition:"opacity 0.25s ease,transform 0.25s ease"}}>
          <div className="bg-slate-800 border border-sky-500/40 rounded-lg p-3 shadow-xl" style={{borderLeft:"3px solid #38bdf8"}}>
            <div className="text-[9px] text-sky-400 tracking-widest uppercase mb-1">Why relevant</div>
            <div className="text-[11px] text-slate-300 leading-relaxed">{node.whyRelevant}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function SimpleCard({ node, cat }) {
  const s = CAT[cat];
  return (
    <div className={"rounded border " + s.bg + " " + s.border + " p-3 transition-all duration-200 select-none hover:shadow-md"}>
      <div className={"text-xs font-bold tracking-widest uppercase mb-1 " + s.text}>{node.label}</div>
      {node.sub && <div className="text-xs text-slate-400">{node.sub}</div>}
      {node.tags && <div className="flex flex-wrap gap-1 mt-2">{node.tags.map(t => <span key={t} className={"text-[10px] px-1.5 py-0.5 rounded font-mono " + s.badge}>{t}</span>)}</div>}
      {cat === "titles" && node.confidence != null && (
        <Bar label="Match Confidence" value={node.confidence} color={node.confidence>=80?"#34d399":node.confidence>=60?"#facc15":"#f87171"}/>
      )}
    </div>
  );
}

function Section({ cat, nodes }) {
  const s = CAT[cat];
  return (
    <div>
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{background:s.dot,boxShadow:"0 0 6px "+s.dot}}/>
          <span className={"text-xs font-bold tracking-[0.2em] uppercase "+s.text}>{s.label}</span>
          <div className="flex-1 border-t border-dashed" style={{borderColor:s.dot+"44"}}/>
          <span className="text-[10px] font-mono text-slate-500">{nodes.length} nodes</span>
        </div>
        <div className="text-[10px] text-slate-600 ml-4">{s.desc}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {nodes.map(n => cat === "companies"
          ? <CompanyCard key={n.id} node={n}/>
          : <SimpleCard key={n.id} node={n} cat={cat}/>
        )}
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

function ResultTabs({ mapData }) {
  const [active, setActive] = useState("companies");
  const nodes = { companies:mapData.companies, adjacent:mapData.adjacent, wildcards:mapData.wildcards, titles:mapData.titles };
  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-6 border-b border-slate-700/50 pb-3">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setActive(t.id)}
            className={"flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold tracking-widest uppercase transition-all " +
              (active===t.id ? "bg-slate-700 text-slate-200" : "text-slate-500 hover:text-slate-300")}>
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{background:active===t.id?t.dot:"#475569",boxShadow:active===t.id?"0 0 5px "+t.dot:"none"}}/>
            {t.label}
          </button>
        ))}
      </div>
      <Section cat={active} nodes={nodes[active]}/>
    </div>
  );
}

function LoadingScreen() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setStep(s => (s+1) % TABS.length), 800);
    return () => clearInterval(iv);
  }, []);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
      <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin"/>
      <div className="space-y-2 text-center">
        <div className="text-[9px] text-slate-600 tracking-widest uppercase mb-3">Finding</div>
        {TABS.map((t, i) => (
          <div key={t.id} className={"flex items-center gap-2 transition-all duration-300 " + (i===step?"opacity-100":"opacity-20")}>
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:t.dot,boxShadow:i===step?"0 0 6px "+t.dot:"none"}}/>
            <span className="text-xs tracking-widest uppercase font-mono" style={{color:i===step?t.dot:"#475569"}}>{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AvatarFace({ thinking }) {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <circle cx="18" cy="18" r="17" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5"/>
      <line x1="18" y1="1" x2="18" y2="35" stroke="#38bdf8" strokeWidth="0.3" opacity="0.3"/>
      <line x1="1" y1="18" x2="35" y2="18" stroke="#38bdf8" strokeWidth="0.3" opacity="0.3"/>
      {thinking ? (
        <>
          <rect x="10" y="14" width="5" height="2" rx="1" fill="#38bdf8" opacity="0.9">
            <animate attributeName="width" values="5;2;5" dur="1.2s" repeatCount="indefinite"/>
          </rect>
          <rect x="21" y="14" width="5" height="2" rx="1" fill="#38bdf8" opacity="0.9">
            <animate attributeName="width" values="5;2;5" dur="1.2s" repeatCount="indefinite"/>
          </rect>
          <path d="M12 24 Q18 22 24 24" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.8">
            <animate attributeName="d" values="M12 24 Q18 22 24 24;M12 23 Q18 25 24 23;M12 24 Q18 22 24 24" dur="1s" repeatCount="indefinite"/>
          </path>
        </>
      ) : (
        <>
          <rect x="10" y="13" width="5" height="5" rx="1.5" fill="#38bdf8" opacity="0.9"/>
          <rect x="21" y="13" width="5" height="5" rx="1.5" fill="#38bdf8" opacity="0.9"/>
          <rect x="12" y="15" width="2" height="2" rx="0.5" fill="#0f172a"/>
          <rect x="23" y="15" width="2" height="2" rx="0.5" fill="#0f172a"/>
          <path d="M12 23 Q18 27 24 23" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.8"/>
        </>
      )}
      <line x1="18" y1="1" x2="18" y2="6" stroke="#38bdf8" strokeWidth="1.5"/>
      <circle cx="18" cy="5" r="1.5" fill="#38bdf8">
        <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite"/>
      </circle>
      <line x1="2" y1="16" x2="8" y2="16" stroke="#38bdf8" strokeWidth="0.8" opacity="0.5"/>
      <line x1="5" y1="16" x2="5" y2="20" stroke="#38bdf8" strokeWidth="0.8" opacity="0.5"/>
      <line x1="28" y1="16" x2="34" y2="16" stroke="#38bdf8" strokeWidth="0.8" opacity="0.5"/>
      <line x1="31" y1="16" x2="31" y2="20" stroke="#38bdf8" strokeWidth="0.8" opacity="0.5"/>
    </svg>
  );
}

function renderMessage(text) {
  const parts = text.split(/\*([^*]+)\*/g);
  return parts.map((p, i) => i % 2 === 1
    ? <strong key={i} className="text-sky-300 font-semibold">{p}</strong>
    : <span key={i}>{p}</span>
  );
}

function Chatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role:"assistant", text:"Hey! I'm Compass, your SourcingCompass guide. Ask me anything about how the tool works, what the scores mean, or how to get better results!" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages]);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages(m => [...m, { role:"user", text:q }]);
    setLoading(true);
    try {
      const history = messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }));
      const res = await fetch("/api/generate", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ messages:[{ role:"user", content:
          "You are Compass, a friendly AI assistant for SourcingCompass. You have a slightly nerdy, helpful personality. Use only the following documentation to answer questions.\n\nRESPONSE RULES:\n- By default: answer in 2-3 short sentences max. Be direct and clear.\n- If the user asks to explain in detail, go deeper with bullet points and structure.\n- Bold key terms using *asterisks* when helpful.\n- Never use long paragraphs by default.\n- If the question is not about SourcingCompass, politely say you can only help with questions about the tool.\n\nDOCUMENTATION:\n" + DOC_CONTEXT + "\n\nConversation so far:\n" + history.map(h=>h.role+": "+h.content).join("\n") + "\n\nUser question: " + q
        }]})
      });
      const data = await res.json();
      const text = data.content?.map(b => b.text||"").join("").trim() || "Hmm, I couldn't get a response. Try again!";
      setMessages(m => [...m, { role:"assistant", text }]);
    } catch(e) {
      setMessages(m => [...m, { role:"assistant", text:"Something went wrong. Please try again!" }]);
    }
    setLoading(false);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(v => !v)}
        className="fixed bottom-6 right-6 z-50 transition-all hover:scale-110"
        style={{filter: open ? "drop-shadow(0 0 12px #38bdf8)" : "drop-shadow(0 0 6px #38bdf888)"}}>
        {open
          ? <div className="w-12 h-12 rounded-full bg-slate-900 border-2 border-sky-400 flex items-center justify-center text-sky-400 text-xl font-bold" style={{boxShadow:"0 0 16px #38bdf888"}}>x</div>
          : <AvatarFace thinking={false}/>
        }
      </button>
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{height:"440px",boxShadow:"0 0 40px #38bdf822"}}>
          <div className="px-4 py-3 border-b border-slate-700/50 flex items-center gap-3 bg-slate-800/50">
            <AvatarFace thinking={loading}/>
            <div>
              <div className="text-xs font-bold text-sky-400 tracking-widest uppercase">Compass</div>
              <div className="text-[10px] text-slate-500">{loading ? "Thinking..." : "SourcingCompass Guide"}</div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start gap-2 items-end"}>
                {m.role === "assistant" && <div className="flex-shrink-0 mb-0.5"><AvatarFace thinking={false}/></div>}
                <div className={"max-w-[80%] rounded-lg px-3 py-2 text-[11px] leading-relaxed " +
                  (m.role === "user"
                    ? "bg-sky-600/80 text-white rounded-br-none"
                    : "bg-slate-800 text-slate-300 border border-slate-700/60 rounded-bl-none")}>
                  {renderMessage(m.text)}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start gap-2 items-end">
                <AvatarFace thinking={true}/>
                <div className="bg-slate-800 border border-slate-700/60 rounded-lg rounded-bl-none px-3 py-2.5">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-bounce" style={{animationDelay:i*0.15+"s"}}/>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>
          {messages.length === 1 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1">
              {["What is poachability?","How do I use the JD parser?","What's a wildcard bet?"].map(q => (
                <button key={q} type="button" onClick={() => setInput(q)}
                  className="text-[9px] px-2 py-1 rounded border border-slate-700 text-slate-500 hover:text-sky-400 hover:border-sky-700 transition-all">
                  {q}
                </button>
              ))}
            </div>
          )}
          <div className="px-3 py-3 border-t border-slate-700/50 flex gap-2">
            <input
              className="flex-1 bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
              placeholder="Ask Compass anything..."
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}/>
            <button type="button" onClick={send} disabled={loading || !input.trim()}
              className="px-3 py-1.5 rounded bg-sky-500 hover:bg-sky-400 text-slate-900 text-xs font-bold disabled:opacity-40">
              →
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function buildPrompt(form) {
  return [
    "You are a talent intelligence system. Return a structured talent map as JSON only. No markdown, no explanation, no backticks.",
    "",
    "CRITICAL: Every company you suggest MUST be a real company that exists today. Do NOT invent community groups, open source projects, contributor pools, or spin-off descriptions. Only suggest actual incorporated companies.",
    "CRITICAL: Location is " + (form.location || "not specified") + ". ONLY suggest companies with an actual engineering office or significant engineering team in " + (form.location || "the specified location") + ". For India, focus on Indian product companies, Indian unicorns, and global companies with large India engineering teams.",
    "",
    "Role: " + form.role,
    "Hiring Company: " + form.company,
    "Location: " + form.location,
    "Seniority: " + form.seniority,
    "Skills: " + form.skills.join(", "),
    "Preferred Industries: " + (form.industries.join(", ") || "Any"),
    "Exclusions: " + (form.exclusions.join(", ") || "None"),
    "",
    "Return this JSON:",
    "{\"companies\":[{\"id\":\"c1\",\"label\":\"Name\",\"sub\":\"Industry\",\"tags\":[\"t\"],\"confidence\":85,\"stage\":\"Series B\",\"talentDensity\":78,\"poachability\":65,\"likelyProfile\":\"sentence.\",\"poachabilitySignals\":[\"[Signal] x\",\"[Confirmed] y\"],\"whyRelevant\":\"sentence.\"}],\"adjacent\":[{\"id\":\"a1\",\"label\":\"Name\",\"sub\":\"Why\",\"tags\":[\"t\"]}],\"wildcards\":[{\"id\":\"w1\",\"label\":\"Name\",\"sub\":\"Reason\",\"tags\":[\"t\"]}],\"titles\":[{\"id\":\"t1\",\"label\":\"Title\",\"sub\":\"Companies\",\"tags\":[\"t\"],\"confidence\":90}]}",
    "",
    "Rules:",
    "- 6-8 companies (mix of established AND 3-4 startups)",
    "- NEVER include " + form.company + " in results",
    "- Only real companies with engineering presence in " + (form.location || "the specified location"),
    "- adjacent = 4-5 specific companies with transferable skills, not job titles",
    "- wildcards = 3-4 unconventional TECH companies only (not banks, manufacturers, or conglomerates)",
    "- titles = 5-7 exact job titles as on real postings",
    "- confidence/talentDensity/poachability = 0-100",
    "- poachabilitySignals = 2-3 strings prefixed [Signal] or [Confirmed]",
    "- stage = Public / Late Stage / Series C+ / Series B / Series A / Seed / Enterprise",
    "- Return ONLY raw valid JSON.",
  ].join("\n");
}

const EMPTY = { companies:[], adjacent:[], wildcards:[], titles:[] };

export default function TalentMap() {
  const [form, setForm] = useState({ role:"", company:"", location:"", seniority:"Senior", skills:[], industries:[], exclusions:[] });
  const [mapData, setMapData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState(false);
  const [showJD, setShowJD] = useState(false);
  const jdRef = useRef(null);
  const set = (k, v) => setForm(f => ({...f, [k]:v}));
  const allNodes = mapData ? [...mapData.companies,...mapData.adjacent,...mapData.wildcards,...mapData.titles] : [];

  async function parseJD() {
    const txt = jdRef.current?.value || "";
    if (!txt.trim()) return;
    setParsing(true); setError("");
    try {
      const res = await fetch("/api/generate", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ messages:[{ role:"user", content:"Extract from this job description and return ONLY raw valid JSON, no markdown: {\"role\":\"exact job title\",\"seniority\":\"Junior/Mid/Senior/Staff/Principal/Director/VP\",\"skills\":[\"skill1\",\"skill2\"]} Job Description: " + txt.slice(0,2000) }] })
      });
      const data = await res.json();
      const raw = data.content?.map(b => b.text||"").join("").trim();
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setForm(f => ({...f, role:parsed.role||f.role, seniority:parsed.seniority||f.seniority, skills:parsed.skills?.length?parsed.skills:f.skills}));
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
        body: JSON.stringify({ messages:[{ role:"user", content:buildPrompt(form) }] })
      });
      const data = await res.json();
      if (!res.ok) { setError("API error " + res.status + ": " + JSON.stringify(data)); setLoading(false); return; }
      const raw = data.content?.map(b => b.text||"").join("").trim();
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setMapData({...EMPTY,...parsed});
      setGenerated(true);
    } catch(e) { setError("Error: " + e.message); }
    setLoading(false);
  }

  function exportCSV() {
    const rows = [["Section","Company/Title","Stage","Relevance","Talent Density","Poachability","Likely Profile","Poachability Signals","Why Relevant","Tags"]];
    mapData.companies.forEach(n => rows.push(["Target Company",n.label,n.stage||"",n.confidence||"",n.talentDensity||"",n.poachability||"",n.likelyProfile||"",(n.poachabilitySignals||[]).join(" | "),n.whyRelevant||"",(n.tags||[]).join(", ")]));
    mapData.adjacent.forEach(n => rows.push(["Adjacent Pool",n.label,"","","","","","","",(n.tags||[]).join(", ")]));
    mapData.wildcards.forEach(n => rows.push(["Wildcard Bet",n.label,"","","","","","","",(n.tags||[]).join(", ")]));
    mapData.titles.forEach(n => rows.push(["Target Title",n.label,"",n.confidence||"","","","","","",(n.tags||[]).join(", ")]));
    const csv = rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(",")).join("\n");
    const blob = new Blob([csv],{type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url; a.download="SourcingCompass_"+form.role.replace(/\s+/g,"_")+".csv";
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
              <input className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                placeholder="e.g. Staff Engineer" value={form.role} onChange={e => set("role",e.target.value)}/>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Hiring Company</label>
              <input className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                placeholder="e.g. Atlan" value={form.company} onChange={e => set("company",e.target.value)}/>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Location</label>
              <input className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                placeholder="e.g. North America" value={form.location} onChange={e => set("location",e.target.value)}/>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Seniority</label>
              <select className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                value={form.seniority} onChange={e => set("seniority",e.target.value)}>
                {["Junior","Mid","Senior","Staff","Principal","Director","VP"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Must-Have Skills</label>
            <TagInput placeholder="Type skill, press , or Enter" tags={form.skills} onChange={v => set("skills",v)}/>
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Preferred Industries</label>
            <TagInput placeholder="e.g. Fintech, Data" tags={form.industries} onChange={v => set("industries",v)}/>
          </div>
          <div>
            <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Exclusions</label>
            <TagInput placeholder="Companies or industries to skip" tags={form.exclusions} onChange={v => set("exclusions",v)}/>
          </div>
          <div>
            <button type="button" onClick={() => setShowJD(v => !v)}
              className="text-[10px] text-sky-500 hover:text-sky-300 tracking-widest uppercase">
              {showJD ? "Hide" : "Paste"} Job Description
            </button>
            {showJD && (
              <div className="mt-2 space-y-2">
                <textarea ref={jdRef} rows={6}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 resize-none"
                  placeholder="Paste your JD here..."/>
                <button type="button" onClick={parseJD} disabled={parsing}
                  className="w-full py-2 rounded text-xs font-bold tracking-widest uppercase bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40">
                  {parsing ? "Parsing..." : "Parse JD — Auto-fill Fields"}
                </button>
              </div>
            )}
          </div>
          <div className="text-[9px] text-slate-600 bg-slate-800/50 border border-slate-700 rounded px-3 py-2">
            AI-generated results. Verify companies before sourcing.
          </div>
          {error && <div className="text-[11px] text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">{error}</div>}
          <button type="button" onClick={generate} disabled={loading}
            className="w-full py-2.5 rounded text-xs font-bold tracking-widest uppercase bg-sky-500 hover:bg-sky-400 text-slate-900 disabled:opacity-50"
            style={{boxShadow:loading?"none":"0 0 12px #38bdf855"}}>
            {loading ? "Generating..." : "Generate Map"}
          </button>
        </div>
        <div className="px-5 py-4 border-t border-slate-700/50 space-y-2">
          <div className="text-[9px] text-slate-600 tracking-widests uppercase mb-2">Legend</div>
          {Object.entries(CAT).map(([k,s]) => (
            <div key={k} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:s.dot}}/>
              <span className="text-[10px] text-slate-500">{s.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <div className="w-4 border-t border-dashed border-sky-400"/>
            <span className="text-[10px] text-slate-500">Hover companies for context</span>
          </div>
        </div>
      </div>
      <div className="flex-1 relative overflow-y-auto">
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
                className="flex-shrink-0 py-2 px-3 rounded text-xs font-bold tracking-widest uppercase bg-emerald-600 hover:bg-emerald-500 text-white">
                CSV
              </button>
            </div>
            <ResultTabs mapData={mapData}/>
          </div>
        )}
      </div>
      <Chatbot/>
    </div>
  );
}
