import { useState, useRef } from "react";

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
    if (newTags.length) onChange([...tags, ...newTags]);
  }
  return (
    <div
      className="w-full min-h-[38px] bg-slate-800 border border-slate-600 rounded px-2 py-1.5 flex flex-wrap gap-1 focus-within:border-sky-500 transition-colors cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((t, i) => (
        <span key={i} className="flex items-center gap-1 bg-sky-900/60 border border-sky-700 text-sky-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
          {t}
          <button type="button" onClick={e => { e.stopPropagation(); onChange(tags.filter((_, idx) => idx !== i)); }} className="text-sky-500 hover:text-sky-200 leading-none">×</button>
        </span>
      ))}
      <input
        ref={inputRef}
        className="bg-transparent text-xs text-slate-200 placeholder-slate-600 outline-none flex-1 min-w-[80px]"
        placeholder={tags.length ? "" : placeholder}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
        onPaste={handlePaste}
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
    <div
      className="absolute top-0 left-full z-50 pl-2 pointer-events-none"
      style={{
        width: "220px",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0px)" : "translateX(-12px)",
        transition: "opacity 0.25s ease, transform 0.25s ease",
      }}
    >
      <div className="bg-slate-800 border border-sky-500/40 rounded-lg p-3 shadow-xl" style={{borderLeft:"3px solid #38bdf8"}}>
        {node.whyRelevant && (
          <div className="mb-2">
            <div className="text-[9px] text-sky-400 tracking-widest uppercase mb-1">Why relevant</div>
            <div className="text-[11px] text-slate-300 leading-relaxed">{node.whyRelevant}</div>
          </div>
        )}
        {node.searchTitles?.length > 0 && (
          <div>
            <div className="text-[9px] text-sky-400 tracking-widest uppercase mb-1">Search on LinkedIn</div>
            <div className="flex flex-col gap-1 mt-1">
              {node.searchTitles.map((t, i) => (
                <span key={i}
                  className="text-[10px] bg-sky-900/60 border border-sky-700/60 text-sky-300 px-1.5 py-0.5 rounded font-mono cursor-pointer hover:bg-sky-800/60"
                  onClick={() => window.open(`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(t)}`, "_blank")}
                  style={{pointerEvents:"all"}}
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
    <div
      id={`node-${node.id}`}
      className={`relative rounded border ${s.bg} ${s.border} p-3 transition-all duration-200 select-none overflow-visible ${hovered ? "shadow-lg z-20" : "hover:shadow-md"}`}
      style={{ boxShadow: hovered ? `0 0 16px 2px ${s.dot}55` : undefined }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
      {hasTooltip && <HoverTooltip node={node} visible={hovered}/>}
    </div>
  );
}

function SectionHeader({ category, count }) {
  const s = CATEGORY_STYLES[category];
  const descriptions = {
    companies: "Direct sourcing targets — companies where your ideal candidate likely works today",
    adjacent:  "Companies with transferable skills — not obvious, but highly relevant",
    wildcards: "Unconventional bets — surprising sources most recruiters never think to check",
    titles:    "Exact LinkedIn search terms — copy these directly into your search",
  };
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full" style={{background:s.dot, boxShadow:`0 0 6px ${s.dot}`}}/>
        <span className={`text-xs font-bold tracking-[0.2em] uppercase ${s.text}`}>{s.label}</span>
        <div className="flex-1 border-t border-dashed" style={{borderColor:s.dot+"44"}}/>
        <span className="text-[10px] font-mono text-slate-500">{count} nodes</span>
      </div>
      <div className="text-[10px] text-slate-600 ml-4">{descriptions[category]}</div>
    </div>
  );
}

function Section({ category, nodes }) {
  return (
    <div className="mb-8">
      <SectionHeader category={category} count={nodes.length}/>
      <div className="grid grid-cols-2 gap-2">
        {nodes.map(n => <NodeCard key={n.id} node={n} category={category}/>)}
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
${form.jd ? `Job Description: ${form.jd.slice(0, 1000)}` : ""}

Return this exact JSON structure:
{
  "companies": [{
    "id": "c1", "label": "Company Name", "sub": "Industry · Size",
    "tags": ["tag1"], "connections": [], "confidence": 85, "stage": "Series B",
    "talentDensity": 78, "poachability": 65,
    "likelyProfile": "One sentence describing the typical engineer background.",
    "poachabilitySignals": ["[Signal] First reason", "[Confirmed] Second reason"],
    "whyRelevant": "1-2 sentences explaining why this company is a good source for this specific role.",
    "searchTitles": ["Exact Title 1", "Exact Title 2", "Exact Title 3"]
  }],
  "adjacent": [{ "id": "a1", "label": "Company Name", "sub": "Why their talent is transferable", "tags": ["tag1"], "connections": [] }],
  "wildcards": [{ "id": "w1", "label": "Real Company Name", "sub": "Specific non-obvious reason their engineers are a great match", "tags": ["overlap"], "connections": [] }],
  "titles": [{ "id": "t1", "label": "Exact Job Title", "sub": "Which companies commonly use this title", "tags": ["variant"], "connections": [], "confidence": 90 }]
}

Rules:
- 6-8 companies (mix of established AND 3-4 notable startups)
- NEVER include "${form.company}" in target companies
- CRITICAL: Only include real companies that actually exist. Do NOT invent or combine company names.
- adjacent = 4-5 specific COMPANIES (not job titles) whose engineers have transferable skills
- wildcards = 3-4 unconventional REAL companies with a specific non-obvious reason
- titles = 5-7 EXACT job titles as they appear on real job postings
- whyRelevant = 1-2 sentences specific to this role
- searchTitles = 2-3 exact LinkedIn search titles that work best at this specific company
- confidence = relevance 0-100, talentDensity = 0-100, poachability = 0-100
- poachabilitySignals = exactly 2-3 strings prefixed [Signal] or [Confirmed]
- likelyProfile = 1 sentence max
- stage = one of: Public / Late Stage / Series C+ / Series B / Series A / Seed / Enterprise
- Return ONLY raw valid JSON. No markdown. No backticks.`;
}

const EMPTY = { companies:[], adjacent:[], wildcards:[], titles:[] };

export default function TalentMap() {
  const [form, setForm] = useState({
    role:"", company:"", location:"", seniority:"Senior",
    skills:[], industries:[], exclusions:[], jd:""
  });
  const [mapData, setMapData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState(false);
  const [showJD, setShowJD] = useState(false);
  const mapRef = useRef(null);
  const allNodes = mapData ? [...mapData.companies, ...mapData.adjacent, ...mapData.wildcards, ...mapData.titles] : [];

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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

  function exportCSV() {
    const rows = [["Section","Company/Title","Stage","Relevance","Talent Density","Poachability","Likely Profile","Poachability Signals","Why Relevant","Search Titles","Tags"]];
    mapData.companies.forEach(n => rows.push(["Target Company",n.label,n.stage||"",n.confidence||"",n.talentDensity||"",n.poachability||"",n.likelyProfile||"",(n.poachabilitySignals||[]).join(" | "),n.whyRelevant||"",(n.searchTitles||[]).join(" | "),(n.tags||[]).join(", ")]));
    mapData.adjacent.forEach(n => rows.push(["Adjacent Pool",n.label,"","","","","","",n.sub||"","",(n.tags||[]).join(", ")]));
    mapData.wildcards.forEach(n => rows.push(["Wildcard Bet",n.label,"","","","","","",n.sub||"","",(n.tags||[]).join(", ")]));
    mapData.titles.forEach(n => rows.push(["Target Title",n.label,"",n.confidence||"","","","","",n.sub||"","",(n.tags||[]).join(", ")]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SourcingCompass_${form.role.replace(/\s+/g,"_")}_${form.company||"export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
          {/* Role + Company */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Role Title</label>
              <input
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
                placeholder="e.g. Staff Engineer"
                value={form.role}
                onChange={e => set("role", e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Hiring Company</label>
              <input
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
                placeholder="e.g. Atlan"
                value={form.company}
                onChange={e => set("company", e.target.value)}
              />
            </div>
          </div>

          {/* Location + Seniority */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Location</label>
              <input
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors"
                placeholder="e.g. North America"
                value={form.location}
                onChange={e => set("location", e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Seniority</label>
              <select
                className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                value={form.seniority}
                onChange={e => set("seniority", e.target.value)}
              >
                {["Junior","Mid","Senior","Staff","Principal","Director","VP"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Skills */}
          <div>
            <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Must-Have Skills</label>
            <TagInput placeholder="Type skill, press , or Enter" tags={form.skills} onChange={v => set("skills", v)}/>
          </div>

          {/* Industries */}
          <div>
            <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Preferred Industries</label>
            <TagInput placeholder="e.g. Fintech, Data" tags={form.industries} onChange={v => set("industries", v)}/>
          </div>

          {/* Exclusions */}
          <div>
            <label className="block text-[10px] text-slate-400 tracking-widest uppercase mb-1">Exclusions</label>
            <TagInput placeholder="Companies or industries to skip" tags={form.exclusions} onChange={v => set("exclusions", v)}/>
          </div>

          {/* JD paste toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowJD(v => !v)}
              className="text-[10px] text-sky-500 hover:text-sky-300 tracking-widest uppercase transition-colors"
            >
              {showJD ? "▾ Hide" : "▸ Paste"} Job Description (optional)
            </button>
            {showJD && (
              <textarea
                rows={5}
                className="w-full mt-2 bg-slate-800 border border-slate-600 rounded px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 resize-none transition-colors"
                placeholder="Paste JD here — AI will extract skills and context automatically..."
                value={form.jd}
                onChange={e => set("jd", e.target.value)}
              />
            )}
          </div>

          {/* AI disclaimer */}
          <div className="text-[9px] text-slate-600 bg-slate-800/50 border border-slate-700 rounded px-3 py-2 leading-relaxed">
            ⚠ AI-generated results. Verify companies before sourcing.
          </div>

          {error && <div className="text-[11px] text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">{error}</div>}

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={loading}
              className="flex-1 py-2.5 rounded text-xs font-bold tracking-widest uppercase bg-sky-500 hover:bg-sky-400 text-slate-900 disabled:opacity-50 transition-all"
              style={{boxShadow: loading ? "none" : "0 0 12px #38bdf855"}}
            >
              {loading ? "Generating..." : "Generate Map"}
            </button>
            {mapData && !loading && (
              <button
                type="button"
                onClick={exportCSV}
                className="py-2.5 px-3 rounded text-xs font-bold tracking-widest uppercase bg-emerald-600 hover:bg-emerald-500 text-white transition-all"
                title="Export to CSV"
              >
                ↓ CSV
              </button>
            )}          </div>
        </div>

        {/* Legend */}
        <div className="px-5 py-4 border-t border-slate-700/50 space-y-2">
          <div className="text-[9px] text-slate-600 tracking-widest uppercase mb-2">Legend</div>
          {Object.entries(CATEGORY_STYLES).map(([k, s]) => (
            <div key={k} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:s.dot}}/>
              <span className="text-[10px] text-slate-500">{s.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <div className="w-4 border-t border-dashed border-sky-400"/>
            <span className="text-[10px] text-slate-500">Hover companies for LinkedIn tips</span>
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
                <div className="text-slate-500 text-xs mt-1">{[form.company, form.location].filter(Boolean).join(" · ")}</div>
                <div className="text-[10px] text-slate-600 mt-2">{allNodes.length} nodes mapped · hover companies for LinkedIn search tips</div>
              </div>
              <button
                type="button"
                onClick={exportCSV}
                className="flex-shrink-0 py-2 px-3 rounded text-xs font-bold tracking-widest uppercase bg-emerald-600 hover:bg-emerald-500 text-white transition-all"
                title="Export to CSV"
              >
                ↓ CSV
              </button>
            </div>
            <Section category="companies" nodes={mapData.companies}/>
            <Section category="adjacent" nodes={mapData.adjacent}/>
            <Section category="wildcards" nodes={mapData.wildcards}/>
            <Section category="titles" nodes={mapData.titles}/>
          </div>
        )}
      </div>
    </div>
  );
}
