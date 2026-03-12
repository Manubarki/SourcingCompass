import { useState, useRef, useEffect } from "react";

const GRID_SIZE = 40;

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

function LaserLines({ nodes, activeNode, containerRef }) {
  const [lines, setLines] = useState([]);
  useEffect(() => {
    if (!activeNode || !containerRef.current) { setLines([]); return; }
    const container = containerRef.current.getBoundingClientRect();
    const sourceEl = document.getElementById(`node-${activeNode.id}`);
    if (!sourceEl) return;
    const src = sourceEl.getBoundingClientRect();
    const sx = src.left - container.left + src.width / 2;
    const sy = src.top - container.top + src.height / 2;
    const newLines = nodes
      .filter(n => n.id !== activeNode.id && activeNode.connections?.includes(n.id))
      .map(n => {
        const el = document.getElementById(`node-${n.id}`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x1: sx, y1: sy, x2: r.left - container.left + r.width/2, y2: r.top - container.top + r.height/2, id: n.id };
      }).filter(Boolean);
    setLines(newLines);
  }, [activeNode, nodes, containerRef]);
  if (!lines.length) return null;
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{zIndex:10}}>
      {lines.map(l => (
        <g key={l.id}>
          <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#f97316" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.9">
            <animate attributeName="stroke-dashoffset" from="0" to="-18" dur="0.4s" repeatCount="indefinite"/>
          </line>
          <circle cx={l.x2} cy={l.y2} r="4" fill="#f97316" opacity="0.8"/>
        </g>
      ))}
    </svg>
  );
}

const CATEGORY_STYLES = {
  companies:{ bg:"bg-sky-900/80", border:"border-sky-400", text:"text-sky-300", badge:"bg-sky-400/20 text-sky-300", dot:"#38bdf8" },
  adjacent: { bg:"bg-violet-900/80", border:"border-violet-400", text:"text-violet-300", badge:"bg-violet-400/20 text-violet-300", dot:"#a78bfa" },
  wildcards:{ bg:"bg-orange-900/80", border:"border-orange-400", text:"text-orange-300", badge:"bg-orange-400/20 text-orange-300", dot:"#fb923c" },
  titles:   { bg:"bg-emerald-900/80", border:"border-emerald-400", text:"text-emerald-300", badge:"bg-emerald-400/20 text-emerald-300", dot:"#34d399" },
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

function TagInput({ placeholder, tags, onChange }) {
  const [input, setInput] = useState("");
  function handleKey(e) {
    if ((e.key === "," || e.key === "Enter") && input.trim()) {
      e.preventDefault();
      onChange([...tags, input.trim().replace(/,$/, "")]);
      setInput("");
    } else if (e.key === "Backspace" && !input && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }
  function removeTag(i) { onChange(tags.filter((_, idx) => idx !== i)); }
  return (
    <div
      className="w-full min-h-[38px] bg-slate-800 border border-slate-600 rounded px-2 py-1.5 flex flex-wrap gap-1 focus-within:border-sky-500 transition-colors cursor-text"
      onClick={e => e.currentTarget.querySelector("input").focus()}
    >
      {tags.map((t, i) => (
        <span key={i} className="flex items-center gap-1 bg-sky-900/60 border border-sky-700 text-sky-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
          {t}
          <button onClick={() => removeTag(i)} className="text-sky-500 hover:text-sky-200 leading-none">×</button>
        </span>
      ))}
      <input
        className="bg-transparent text-xs text-slate-200 placeholder-slate-600 outline-none flex-1 min-w-[80px]"
        placeholder={tags.length ? "" : placeholder}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
      />
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
          <div className="text-[9px] text-yellow-600 tracking-widests uppercase mb-1">Poachability Signals</div>
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

function NodeCard({ node, category, onHover, isActive }) {
  const s = CATEGORY_STYLES[category];
  return (
    <div
      id={`node-${node.id}`}
      onMouseEnter={() => onHover(node)}
      onMouseLeave={() => onHover(null)}
      className={`relative rounded border ${s.bg} ${s.border} p-3 cursor-pointer transition-all duration-200 select-none ${isActive ? "shadow-lg scale-105 z-20" : "hover:shadow-md"}`}
      style={{ boxShadow: isActive ? `0 0 16px 2px ${s.dot}55` : undefined }}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className={`text-xs font-bold tracking-widest uppercase ${s.text}`}>{node.label}</div>
        {node.stage && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono whitespace-nowrap flex-shrink-0 ${STAGE_STYLES[node.stage] || "bg-slate-800 text-slate-400 border-slate-600"}`}>
            {node.stage}
          </span>
        )}
      </div>
      {node.sub && <div className="text-xs text-slate-400">{node.sub}</div>}
      {node.tags && (
        <div className="flex flex-wrap gap-1 mt-2">
          {node.tags.map(t => (
            <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${s.badge}`}>{t}</span>
          ))}
        </div>
      )}
      {category === "companies" && <CompanyScores node={node}/>}
      {category === "titles" && node.confidence != null && (
        <div className="mt-2">
          <ScoreBar label="Match Confidence" value={node.confidence} color={node.confidence >= 80 ? "#34d399" : node.confidence >= 60 ? "#facc15" : "#f87171"}/>
        </div>
      )}
      {node.connections?.length > 0 && (
        <div className="absolute bottom-1.5 right-2 text-[9px] text-slate-500 font-mono">{node.connections.length} links</div>
      )}
    </div>
  );
}

function Section({ title, category, nodes, onHover, activeNode }) {
  const s = CATEGORY_STYLES[category];
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full" style={{background:s.dot, boxShadow:`0 0 6px ${s.dot}`}}/>
        <span className={`text-xs font-bold tracking-[0.2em] uppercase ${s.text}`}>{title}</span>
        <div className="flex-1 border-t border-dashed" style={{borderColor:s.dot+"44"}}/>
        <span className="text-[10px] font-mono text-slate-500">{nodes.length} nodes</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {nodes.map(n => (
          <NodeCard key={n.id} node={n} category={category} onHover={onHover} isActive={activeNode?.id === n.id}/>
        ))}
      </div>
    </div>
  );
}

function buildPrompt(form) {
  return `You are a talent intelligence system. Return a structured talent map as JSON only — no markdown, no explanation, no backticks.

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
    "id": "c1",
    "label": "Company Name",
    "sub": "Industry · Size",
    "tags": ["tag1", "tag2"],
    "connections": ["w1"],
    "confidence": 85,
    "stage": "Series B",
    "talentDensity": 78,
    "poachability": 65,
    "likelyProfile": "One sentence describing the typical engineer background.",
    "poachabilitySignals": ["[Signal] First reason", "[Confirmed] Second reason"]
  }],
  "adjacent": [{ "id": "a1", "label": "Company Name", "sub": "Why their talent is transferable", "tags": ["tag1"], "connections": ["c1"] }],
  "wildcards": [{ "id": "w1", "label": "Real Company Name", "sub": "Specific reason why their engineers are a surprising but valid match", "tags": ["overlap"], "connections": ["c1", "a1"] }],
  "titles": [{ "id": "t1", "label": "Job Title", "sub": "Common at these orgs", "tags": ["variant"], "connections": [], "confidence": 90 }]
}

Rules:
- 6-8 companies (mix of established AND 3-4 notable startups)
- CRITICAL: Only include real companies that actually exist. Do NOT invent or combine company names.
- NEVER include "${form.company}" in target companies
- adjacent = 4-5 specific COMPANIES (not job titles) whose engineers have transferable skills
- wildcards = 3-4 unconventional companies with surprising talent overlap
- titles = 5-7 target job titles
- confidence = relevance 0-100
- talentDensity = concentration of relevant engineers 0-100
- poachability = likelihood to move 0-100
- poachabilitySignals = exactly 2-3 strings prefixed [Signal] or [Confirmed]
- likelyProfile = 1 sentence max
- stage = one of: Public / Late Stage / Series C+ / Series B / Series A / Seed / Enterprise
- Return ONLY raw valid JSON. No markdown. No backticks.`;
}

const EMPTY = { companies:[], adjacent:[], wildcards:[], titles:[] };

export default function TalentMap() {
  const [form, setForm] = useState({
    role: "", company: "", location: "", seniority: "",
    skills: [], industries: [], exclusions: []
  });
  const [mapData, setMapData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeNode, setActiveNode] = useState(null);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState(false);
  const mapRef = useRef(null);
  const allNodes = mapData ? [...mapData.companies, ...mapData.adjacent, ...mapData.wildcards, ...mapData.titles] : [];

  async function generate() {
    if (!form.role.trim()) { setError("Role is required."); return; }
    setError(""); setLoading(true); setMapData(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 3000,
          messages: [{ role: "user", content: buildPrompt(form) }]
        })
      });
      const data = await res.json();
      if (!res.ok) { setError(`API error ${res.status}: ${JSON.stringify(data)}`); setLoading(false); return; }
      const raw = data.content?.map(b => b.text || "").join("").trim();
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setMapData({ ...EMPTY, ...parsed });
      setGenerated(true);
    } catch(e) {
      setError(`Error: ${e.message}`);
    }
    setLoading(false);
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
                <option value="">Select level</option>
                {["Junior","Mid","Senior","Staff","Principal","Director","VP"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Must-Have Skills</label>
            <TagInput placeholder="Type a skill, press , or Enter" tags={form.skills} onChange={v => set("skills", v)}/>
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Preferred Industries</label>
            <TagInput placeholder="e.g. Fintech, Data → press , or Enter" tags={form.industries} onChange={v => set("industries", v)}/>
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Exclusions</label>
            <TagInput placeholder="Companies or industries to skip" tags={form.exclusions} onChange={v => set("exclusions", v)}/>
          </div>

          {error && <div className="text-[11px] text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">{error}</div>}

          <button onClick={generate} disabled={loading}
            className="w-full py-2.5 rounded text-xs font-bold tracking-widest uppercase bg-sky-500 hover:bg-sky-400 text-slate-900 disabled:opacity-50 transition-all"
            style={{boxShadow: loading ? "none" : "0 0 12px #38bdf855"}}>
            {loading ? "Generating..." : "Generate Map"}
          </button>
        </div>

        <div className="px-5 py-4 border-t border-slate-700/50 space-y-2">
          <div className="text-[9px] text-slate-600 tracking-widest uppercase mb-2">Legend</div>
          {Object.entries(CATEGORY_STYLES).map(([k, s]) => (
            <div key={k} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:s.dot}}/>
              <span className="text-[10px] text-slate-500">
                {k==="companies" ? "Target Companies" : k==="adjacent" ? "Adjacent Pools" : k==="wildcards" ? "Wildcard Bets" : "Target Titles"}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <div className="w-4 border-t border-dashed border-orange-400"/>
            <span className="text-[10px] text-slate-500">Hover = laser links</span>
          </div>
        </div>
      </div>

      {/* RIGHT MAP */}
      <div className="flex-1 relative overflow-y-auto" ref={mapRef}>
        <BlueprintGrid/>
        <LaserLines nodes={allNodes} activeNode={activeNode} containerRef={mapRef}/>
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
            <div className="mb-8 pb-4 border-b border-slate-700/50">
              <div className="text-slate-300 text-sm font-bold tracking-widest uppercase">{form.role} · {form.seniority}</div>
              <div className="text-slate-500 text-xs mt-1">{[form.company, form.location].filter(Boolean).join(" · ")}</div>
              <div className="text-[10px] text-slate-600 mt-2">{allNodes.length} nodes mapped · hover to reveal connections</div>
            </div>
            <Section title="Target Companies" category="companies" nodes={mapData.companies} onHover={setActiveNode} activeNode={activeNode}/>
            <Section title="Adjacent Talent Pools" category="adjacent" nodes={mapData.adjacent} onHover={setActiveNode} activeNode={activeNode}/>
            <Section title="Wildcard Bets" category="wildcards" nodes={mapData.wildcards} onHover={setActiveNode} activeNode={activeNode}/>
            <Section title="Target Titles" category="titles" nodes={mapData.titles} onHover={setActiveNode} activeNode={activeNode}/>
          </div>
        )}
      </div>
    </div>
  );
}
