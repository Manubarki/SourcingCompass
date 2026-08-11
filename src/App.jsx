import { useState, useRef, useEffect } from "react";

// ─── Client-side JSON repair for truncated LLM responses ─────────────────────
function repairJSON(raw) {
  const s = raw.indexOf("{");
  if (s === -1) return raw;
  const e = raw.lastIndexOf("}");
  let clean = e !== -1 ? raw.slice(s, e + 1) : raw.slice(s);
  clean = clean
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .replace(/,\s*([}\]])/g, "$1");
  try { JSON.parse(clean); return clean; } catch {}
  function tryCloseFrom(str) {
    let trimmed = str.replace(/,\s*$/, "");
    let inStr = false, esc = false, opens = 0, openSq = 0;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\' && inStr) { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') opens++; else if (ch === '}') opens--;
      if (ch === '[') openSq++; else if (ch === ']') openSq--;
    }
    if (inStr) return null;
    const closed = trimmed + "]".repeat(Math.max(0, openSq)) + "}".repeat(Math.max(0, opens));
    try { JSON.parse(closed); return closed; } catch { return null; }
  }
  let result = tryCloseFrom(clean);
  if (result) return result;
  let inStr = false, esc = false, lastSafeComma = -1, depth = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    else if (ch === ',' && depth > 0) lastSafeComma = i;
  }
  if (lastSafeComma === -1) return raw;
  result = tryCloseFrom(clean.slice(0, lastSafeComma));
  if (result) return result;
  return raw;
}

const DOC_CONTEXT = `SourcingCompass is a talent intelligence tool that answers "where do people like this actually work?" — generating an AI-powered map of the talent landscape for any role in under 30 seconds. It now covers the full workflow: Intake Agent → Market Mapping → Sourcing → Market Report.

MODE TOGGLE (top of sidebar):
- Quick Search — the original manual form (Role, Company, Location, Seniority, Skills, Industries, Exclusions).
- Intake Agent — a chat-driven agent that interviews the hiring manager one question at a time (team/why open, must-haves, nice-to-haves, dealbreakers, comp range, success metrics, culture, interview process), then generates a structured ICP + full job description. Finalizing auto-fills the Quick Search form.

RESULT TABS:
0. ICP & JD (pink, only after running Intake Agent) — the synthesized Ideal Candidate Profile fields plus the full generated job description, with copy/download actions.
1. Target Companies (blue) — Real companies employing people with your exact skills. Each card shows: Relevance (skill match 0-100), Talent Density, Poachability, Poachability Category (Layoffs/Restructuring/Acquisition/Funding Stress/Hiring Freeze/Stock Decline/Growth Stall), Salary Range (estimated comp band), Level Equivalent (that company's internal level for the searched seniority), Stage badge, "Why Relevant" tooltip on hover. A "⟳ Enrich with Crustdata" button overlays real headcount-growth/funding signals when CRUSTDATA_API_KEY is configured — enriched cards get a green "✓ Verified" badge.
2. Adjacent Talent Pools (purple) — Companies with transferable skills, not direct competitors.
3. Wildcard Bets (orange) — Surprising non-obvious tech companies with strong skill overlap.
4. Target Titles (green) — Exact job titles as they appear across companies.
5. Sourcing (teal, "NEW") — X-ray boolean search strings, PLUS a "Find Candidates" live search that pulls real LinkedIn profiles (Serper) merged with real Crustdata people-search results, PLUS a "Push to Clay" button that sends candidate rows to a Clay table webhook for further enrichment.

SCORES EXPLAINED:
- Relevance: 90+ = very close match. 60-70 = good overlap. Below 60 = stretch.
- High relevance ≠ best target. A 70% relevance + 85% poachability company often beats 95% relevance + 30% poachability.
- Talent Density: how concentrated relevant talent is.
- Poachability signals: [Confirmed] = specific reported fact. [Signal] = inferred pattern. Crustdata-enriched signals are real headcount/funding data, not AI guesses.
- Salary Range / Level Equivalent are AI-estimated (levels.fyi-style) unless Crustdata enrichment is shown.

MARKET REPORT (artifact):
"Create Report" button next to Export CSV opens a printable/shareable one-pager — ICP summary, full company table with salary/level/poachability, adjacent pools, wildcards, target titles. Use "Print / Save as PDF".

JD PARSER (Quick Search only):
Paste any job description → auto-extracts role title, seniority, key skills.

CSV EXPORT:
Downloads all sections including salary range, level, and poachability category as a spreadsheet.

COMPANY MEMORY:
Grounded in 2000+ verified ML/AI/Data ecosystem companies from the MAD Firstmark landscape.

TIPS:
- Run the Intake Agent first if you don't already have a tight brief — it produces a sharper map than guessing at fields
- Add specific skills for much better results
- High poachability + moderate relevance = often the best sourcing target
- Enrich with Crustdata before writing outreach — real signals beat AI guesses

BUILT BY: Manu Barki, Talent Partner at Atlan. Stack: React + Vite + Express on Railway, Claude Sonnet via LiteLLM proxy.`;



// ─── Category config ──────────────────────────────────────────────────────────
const CAT = {
  companies: { dot:"#4d64d8", label:"Target Companies",     desc:"Direct sourcing targets — companies where your ideal candidate likely works today" },
  adjacent:  { dot:"#9b6ef5", label:"Adjacent Talent Pools", desc:"Companies with transferable skills — not obvious, but highly relevant" },
  wildcards: { dot:"#f6720d", label:"Wildcard Bets",         desc:"Unconventional bets — surprising sources most recruiters never think to check" },
  titles:    { dot:"#1da882", label:"Target Titles",          desc:"Exact LinkedIn search terms — copy these directly into your search" },
};

// ─── Tag input ────────────────────────────────────────────────────────────────
function TagInput({ placeholder, tags, onChange }) {
  const [input, setInput] = useState("");
  const ref = useRef(null);
  function handleKey(e) {
    if ((e.key === "," || e.key === "Enter") && input.trim()) {
      e.preventDefault(); onChange([...tags, input.trim().replace(/,$/, "")]); setInput("");
    } else if (e.key === "Backspace" && !input && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }
  function handlePaste(e) {
    e.preventDefault();
    const parts = e.clipboardData.getData("text").split(/[,\n]+/).map(t=>t.trim()).filter(Boolean);
    if (parts.length > 1) onChange([...tags, ...parts]); else setInput(parts[0] || "");
  }
  return (
    <div className="w-full min-h-[40px] bg-sidebar-input border border-white/10 rounded-md px-2.5 py-1.5 flex flex-wrap gap-1.5 cursor-text focus-within:border-sidebar-accent/50 transition-colors"
      onClick={() => ref.current?.focus()}>
      {tags.map((t, i) => (
        <span key={i} className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-md font-medium" style={{background:"rgba(29,168,130,0.15)",border:"1px solid rgba(29,168,130,0.35)",color:"#24c9a0"}}>
          {t}
          <button type="button" onClick={e=>{e.stopPropagation();onChange(tags.filter((_,j)=>j!==i))}}
            style={{color:"rgba(36,201,160,0.6)",background:"none",border:"none",cursor:"pointer",padding:0,lineHeight:1}} className="leading-none ml-0.5">×</button>
        </span>
      ))}
      <input ref={ref} className="sidebar-input bg-transparent outline-none flex-1 min-w-[80px]"
        style={{fontSize:"13px",color:"#bfc8d6"}} placeholder={tags.length?"":placeholder} value={input}
        onChange={e=>setInput(e.target.value)} onKeyDown={handleKey} onPaste={handlePaste}/>
    </div>
  );
}

// ─── Score bar ────────────────────────────────────────────────────────────────
function scoreColor(value) {
  if (value >= 80) return { color:"#16a34a", track:"rgba(22,163,74,0.12)" };  // green — high
  if (value >= 60) return { color:"#d97706", track:"rgba(217,119,6,0.12)"  };  // amber — medium
  return              { color:"#dc2626", track:"rgba(220,38,38,0.12)"  };       // red — low
}

function Bar({ label, value }) {
  const { color, track } = scoreColor(value ?? 0);
  return (
    <div style={{marginTop:"10px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
        <span style={{fontSize:"13px",color:"#6b7280",fontWeight:500,fontFamily:"Inter,sans-serif"}}>{label}</span>
        <span style={{fontSize:"13px",fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color}}>{value}</span>
      </div>
      <div style={{width:"100%",height:"6px",borderRadius:"999px",background:track}}>
        <div style={{height:"100%",borderRadius:"999px",background:color,width:`${(value??0)}%`,transition:"width 0.7s ease"}}/>
      </div>
    </div>
  );
}

// ─── Company card ─────────────────────────────────────────────────────────────
const NAME_COLORS = ["#2563eb","#7c3aed","#0891b2","#059669","#dc2626","#d97706","#db2777","#4f46e5"];
function nameColor(label) {
  let h = 0;
  for(let i=0;i<label.length;i++) h = (h*31 + label.charCodeAt(i)) & 0xffff;
  return NAME_COLORS[h % NAME_COLORS.length];
}

function CompanyCard({ node }) {
  const [hov, setHov] = useState(false);
  const color = nameColor(node.label||"");
  return (
    <div style={{
        position:"relative", background:"#ffffff", border:"1px solid #e5e7eb",
        borderRadius:"10px", padding:"16px", cursor:"default",
        boxShadow: hov ? "0 8px 24px rgba(77,100,216,0.12)" : "0 1px 3px rgba(0,0,0,0.06)",
        transition:"box-shadow .15s, border-color .15s",
        borderColor: hov ? "#d2d8f8" : "#e5e7eb",
        overflow:"visible", zIndex: hov ? 10 : 1,
      }}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"8px",marginBottom:"4px"}}>
        <div style={{fontSize:"15px",fontWeight:700,color,fontFamily:"Inter,sans-serif",letterSpacing:"-0.01em"}}>{node.label}</div>
        <div style={{display:"flex",alignItems:"center",gap:"5px",flexShrink:0}}>
          {node.crustdataEnriched && (
            <span title="Verified via Crustdata" style={{fontSize:"10px",padding:"2px 7px",borderRadius:"999px",background:"#ecfdf5",color:"#059669",border:"1px solid #a7f3d0",fontWeight:600,whiteSpace:"nowrap",fontFamily:"Inter,sans-serif"}}>✓ Verified</span>
          )}
          {node.stage && (
            <span style={{fontSize:"10px",padding:"2px 8px",borderRadius:"999px",background:"#f3f4f6",color:"#6b7280",border:"1px solid #e5e7eb",fontWeight:500,whiteSpace:"nowrap",fontFamily:"Inter,sans-serif"}}>{node.stage}</span>
          )}
        </div>
      </div>
      {node.sub && <div style={{fontSize:"13px",color:"#6b7280",marginBottom:"10px",fontFamily:"Inter,sans-serif"}}>{node.sub}</div>}
      {(node.salaryRange || node.levelEquivalent) && (
        <div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginBottom:"10px"}}>
          {node.salaryRange && (
            <span style={{fontSize:"11px",padding:"3px 9px",borderRadius:"5px",fontWeight:600,background:"#f0fdf4",color:"#16a34a",border:"1px solid #bbf7d0",fontFamily:"Inter,sans-serif"}}>💰 {node.salaryRange}</span>
          )}
          {node.levelEquivalent && (
            <span style={{fontSize:"11px",padding:"3px 9px",borderRadius:"5px",fontWeight:600,background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe",fontFamily:"Inter,sans-serif"}}>{node.levelEquivalent}</span>
          )}
        </div>
      )}
      {node.poachabilityCategory?.length > 0 && (
        <div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginBottom:"10px"}}>
          {node.poachabilityCategory.map(cat=>(
            <span key={cat} style={{fontSize:"10px",padding:"2px 8px",borderRadius:"5px",fontWeight:600,background:"#fff7ed",color:"#c2410c",border:"1px solid #fed7aa",fontFamily:"Inter,sans-serif"}}>{cat}</span>
          ))}
        </div>
      )}
      {node.tags && (
        <div style={{display:"flex",flexWrap:"wrap",gap:"5px",marginBottom:"10px"}}>
          {node.tags.map(t=>(
            <span key={t} style={{fontSize:"11px",padding:"3px 9px",borderRadius:"5px",fontWeight:500,background:"#eff2fe",color:"#4d64d8",border:"1px solid #d2d8f8",fontFamily:"Inter,sans-serif"}}>{t}</span>
          ))}
        </div>
      )}
      <Bar label="Relevance" value={node.confidence??0}/>
      <Bar label="Talent Density" value={node.talentDensity??0}/>
      <Bar label="Poachability" value={node.poachability??0}/>
      {node.likelyProfile && (
        <div style={{marginTop:"12px",paddingTop:"12px",borderTop:"1px solid #f3f4f6"}}>
          <div style={{fontSize:"10px",color:"#9ca3af",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"4px",fontFamily:"Inter,sans-serif"}}>Likely Profile</div>
          <div style={{fontSize:"12px",color:"#6b7280",lineHeight:1.5,fontFamily:"Inter,sans-serif"}}>{node.likelyProfile}</div>
        </div>
      )}
      {node.poachabilitySignals?.length > 0 && (
        <div style={{marginTop:"10px",paddingTop:"10px",borderTop:"1px solid #f3f4f6"}}>
          <div style={{fontSize:"10px",color:"#9ca3af",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"8px",fontFamily:"Inter,sans-serif"}}>Signals</div>
          {node.poachabilitySignals.map((sig,i)=>{
            const isConfirmed = sig.toLowerCase().startsWith("[confirmed]");
            const isSignal    = sig.toLowerCase().startsWith("[signal]");
            const text = sig.replace(/^\[(confirmed|signal)\]\s*/i,"").trim();
            return (
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:"7px",marginTop:"6px"}}>
                {isConfirmed && (
                  <span style={{
                    fontSize:"10px",fontWeight:700,padding:"1px 6px",borderRadius:"4px",
                    background:"#dcfce7",color:"#15803d",border:"1px solid #bbf7d0",
                    flexShrink:0,whiteSpace:"nowrap",marginTop:"1px",fontFamily:"Inter,sans-serif",
                  }}>✓ Confirmed</span>
                )}
                {isSignal && (
                  <span style={{
                    fontSize:"10px",fontWeight:700,padding:"1px 6px",borderRadius:"4px",
                    background:"#fef3c7",color:"#92400e",border:"1px solid #fde68a",
                    flexShrink:0,whiteSpace:"nowrap",marginTop:"1px",fontFamily:"Inter,sans-serif",
                  }}>~ Inferred</span>
                )}
                {!isConfirmed && !isSignal && (
                  <span style={{color:"#d1d5db",fontSize:"12px",flexShrink:0,marginTop:"1px"}}>›</span>
                )}
                <span style={{fontSize:"12px",color:"#6b7280",lineHeight:1.4,fontFamily:"Inter,sans-serif"}}>{text}</span>
              </div>
            );
          })}
        </div>
      )}
      {node.whyRelevant && hov && (
        <div style={{
          position:"absolute", top:"8px", left:"calc(100% + 12px)",
          width:"220px", zIndex:100, pointerEvents:"none",
        }}>
          <div style={{
            background:"#ffffff", border:"1px solid #d2d8f8",
            borderLeft:"3px solid #4d64d8", borderRadius:"10px",
            padding:"12px", boxShadow:"0 8px 24px rgba(77,100,216,0.15)",
          }}>
            <div style={{fontSize:"10px",color:"#4d64d8",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"6px",fontFamily:"Inter,sans-serif"}}>Why relevant</div>
            <div style={{fontSize:"12px",color:"#374151",lineHeight:1.5,fontFamily:"Inter,sans-serif"}}>{node.whyRelevant}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Simple card ──────────────────────────────────────────────────────────────
function SimpleCard({ node, cat }) {
  const s = CAT[cat];
  const tagStyles = {
    adjacent: "bg-purple-50 text-purple-700 border-purple-200",
    wildcards: "bg-orange-50 text-orange-700 border-orange-200",
    titles:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return (
    <div className="bg-card border border-border rounded-lg p-4 transition-all duration-200 hover:shadow-card-hover animate-fade-in">
      <div style={{fontSize:"15px",fontWeight:700,color:nameColor(node.label||""),fontFamily:"Inter,sans-serif",marginBottom:"4px"}}>{node.label}</div>
      {node.sub && <div className="text-sm text-muted-foreground mb-2">{node.sub}</div>}
      {node.tags && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {node.tags.map(t=>(
            <span key={t} className={`text-xs px-2.5 py-0.5 rounded-md font-medium border ${tagStyles[cat]||"bg-secondary text-muted-foreground border-border"}`}>{t}</span>
          ))}
        </div>
      )}
      {cat==="titles" && node.confidence != null && (
        <Bar label="Confidence" value={node.confidence}/>
      )}
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────
function Section({ cat, nodes, extra }) {
  const s = CAT[cat];
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:s.dot}}/>
        <span className="text-xs font-semibold text-foreground tracking-widest uppercase">{s.label}</span>
        <div className="flex-1 h-px bg-border"/>
        <span className="text-xs text-muted-foreground">{nodes.length} results</span>
        {extra}
      </div>
      <p className="text-xs text-muted-foreground mb-4 ml-4">{s.desc}</p>
      <div className="grid grid-cols-3 gap-3" style={{overflow:"visible"}}>
        {nodes.map(n => cat==="companies"
          ? <CompanyCard key={n.id} node={n}/>
          : <SimpleCard key={n.id} node={n} cat={cat}/>
        )}
      </div>
    </div>
  );
}

// ─── Live candidate search + Push to Clay ────────────────────────────────────
function CandidateSearch({ mapData, form }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [candidates, setCandidates] = useState(null);
  const [meta, setMeta] = useState(null);
  const [clayStatus, setClayStatus] = useState(null);
  const [clayLoading, setClayLoading] = useState(false);
  const [clayUrl, setClayUrl] = useState("");

  async function findCandidates() {
    setLoading(true); setError(null); setCandidates(null);
    try {
      const r = await fetch("/api/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companies: (mapData.companies||[]).map(c=>c.label),
          role: form.role, skills: form.skills||[], seniority: form.seniority, location: form.location,
        }),
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setCandidates(data.candidates||[]);
      setMeta({ crustdataUsed: data.crustdataUsed, serperUsed: data.serperUsed });
    } catch(e) { setError(e.message); }
    setLoading(false);
  }

  async function pushToClay() {
    if (!candidates?.length) return;
    setClayLoading(true); setClayStatus(null);
    try {
      const rows = candidates.map(c => ({
        name: c.name, title: c.currentTitle, company: c.currentCompany,
        linkedin_url: c.linkedinUrl, email: c.email || "", role_sourced_for: form.role,
      }));
      const r = await fetch("/api/clay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, ...(clayUrl.trim() ? { webhookUrl: clayUrl.trim() } : {}) }),
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setClayStatus({ ok: true, message: `Sent ${data.delivered}/${data.sent} rows to Clay for enrichment.` });
    } catch(e) { setClayStatus({ ok: false, message: e.message }); }
    setClayLoading(false);
  }

  return (
    <div style={{marginTop:"24px",paddingTop:"20px",borderTop:"1px solid #f3f4f6"}}>
      <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px"}}>
        <div style={{width:"8px",height:"8px",borderRadius:"50%",background:"#4d64d8",boxShadow:"0 0 0 3px rgba(77,100,216,0.15)"}}/>
        <span style={{fontSize:"11px",fontWeight:600,color:"#374151",textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"Inter,sans-serif"}}>Live Candidates</span>
        <div style={{flex:1,height:"1px",background:"#f3f4f6"}}/>
      </div>
      <p style={{fontSize:"12px",color:"#9ca3af",marginBottom:"16px",fontFamily:"Inter,sans-serif"}}>
        Searches real LinkedIn profiles at your target companies via Google X-ray (Serper), merged with Crustdata people search when configured.
      </p>

      {!candidates && !loading && (
        <button type="button" onClick={findCandidates}
          style={{display:"flex",alignItems:"center",gap:"8px",padding:"10px 20px",borderRadius:"8px",
            background:"#4d64d8",color:"#fff",border:"none",cursor:"pointer",fontSize:"13px",
            fontWeight:600,fontFamily:"Inter,sans-serif",boxShadow:"0 2px 8px rgba(77,100,216,0.3)"}}>
          Find Candidates
        </button>
      )}

      {loading && (
        <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"16px",background:"#f5f7ff",borderRadius:"10px",border:"1px solid #d2d8f8"}}>
          <div style={{width:"16px",height:"16px",border:"2px solid #4d64d8",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0}}/>
          <span style={{fontSize:"13px",color:"#4d64d8",fontFamily:"Inter,sans-serif",fontWeight:500}}>Searching LinkedIn + Crustdata for matching candidates…</span>
        </div>
      )}

      {error && (
        <div style={{padding:"12px 14px",background:"#fef2f2",borderRadius:"8px",border:"1px solid #fecaca"}}>
          <span style={{fontSize:"12px",color:"#dc2626",fontFamily:"Inter,sans-serif"}}>{error}</span>
        </div>
      )}

      {candidates && (
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px",flexWrap:"wrap",gap:"8px"}}>
            <span style={{fontSize:"12px",color:"#6b7280",fontFamily:"Inter,sans-serif"}}>
              {candidates.length} candidates found
              {meta && ` · ${[meta.serperUsed&&"Serper",meta.crustdataUsed&&"Crustdata"].filter(Boolean).join(" + ")}`}
            </span>
            <div style={{display:"flex",gap:"6px",alignItems:"center",flexWrap:"wrap"}}>
              <input value={clayUrl} onChange={e=>setClayUrl(e.target.value)} placeholder="Clay webhook URL (optional, uses env default)"
                style={{fontSize:"11px",padding:"6px 10px",borderRadius:"6px",border:"1px solid #e5e7eb",width:"260px",fontFamily:"Inter,sans-serif"}}/>
              <button type="button" onClick={pushToClay} disabled={clayLoading || !candidates.length}
                style={{padding:"6px 12px",borderRadius:"6px",fontSize:"11px",fontWeight:600,border:"1px solid #4d64d8",background:"#eff2fe",color:"#4d64d8",cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap",opacity:clayLoading?0.6:1}}>
                {clayLoading ? "Sending…" : "Push to Clay"}
              </button>
              <button type="button" onClick={findCandidates}
                style={{padding:"6px 12px",borderRadius:"6px",fontSize:"11px",fontWeight:600,border:"1px solid #e5e7eb",background:"#fff",color:"#6b7280",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>
                ↻ Refresh
              </button>
            </div>
          </div>
          {clayStatus && (
            <div style={{marginBottom:"12px",padding:"8px 12px",borderRadius:"7px",fontSize:"12px",fontFamily:"Inter,sans-serif",
              background: clayStatus.ok ? "#f0fdf4" : "#fef2f2", color: clayStatus.ok ? "#16a34a" : "#dc2626",
              border: `1px solid ${clayStatus.ok ? "#bbf7d0" : "#fecaca"}`}}>
              {clayStatus.message}
            </div>
          )}
          {candidates.length === 0 && (
            <div style={{fontSize:"12px",color:"#9ca3af",fontFamily:"Inter,sans-serif"}}>No candidates matched your filters — try widening seniority or removing a must-have skill.</div>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
            {candidates.map((c,i)=>(
              <a key={i} href={c.linkedinUrl} target="_blank" rel="noreferrer"
                style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"10px",background:"#fff",border:"1px solid #e5e7eb",borderRadius:"8px",padding:"10px 12px",textDecoration:"none"}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:"13px",fontWeight:600,color:"#111827",fontFamily:"Inter,sans-serif"}}>{c.name}</div>
                  <div style={{fontSize:"12px",color:"#6b7280",fontFamily:"Inter,sans-serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.currentTitle}{c.currentCompany?` · ${c.currentCompany}`:""}</div>
                </div>
                <span style={{fontSize:"10px",fontWeight:700,padding:"2px 8px",borderRadius:"999px",flexShrink:0,
                  background: c.source==="crustdata" ? "#ecfdf5" : "#eff6ff",
                  color: c.source==="crustdata" ? "#059669" : "#2563eb",
                  border: `1px solid ${c.source==="crustdata" ? "#a7f3d0" : "#bfdbfe"}`}}>
                  {c.source==="crustdata" ? "Crustdata" : "LinkedIn"}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sourcing tab: X-Ray Builder + live candidates ───────────────────────────
function SourcingTab({ mapData, form }) {
  const [copied, setCopied]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState(null);

  async function generate() {
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await fetch("/api/xray", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role:      form.role,
          skills:    form.skills || [],
          seniority: form.seniority,
          location:  form.location,
          companies: (mapData.companies||[]).map(c=>c.label),
          adjacent:  (mapData.adjacent ||[]).map(c=>c.label),
          wildcards: (mapData.wildcards||[]).map(c=>c.label),
        }),
      });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch(e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function copy(text, id) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  function openGoogle(q) {
    window.open("https://www.google.com/search?q=" + encodeURIComponent(q), "_blank");
  }

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px"}}>
        <div style={{width:"8px",height:"8px",borderRadius:"50%",background:"#0891b2",boxShadow:"0 0 0 3px rgba(8,145,178,0.15)"}}/>
        <span style={{fontSize:"11px",fontWeight:600,color:"#374151",textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"Inter,sans-serif"}}>AI X-Ray Search Strings</span>
        <div style={{flex:1,height:"1px",background:"#f3f4f6"}}/>
      </div>
      <p style={{fontSize:"12px",color:"#9ca3af",marginBottom:"20px",fontFamily:"Inter,sans-serif"}}>
        AI researches your skills ecosystem — finds alternative keywords, related tech, and community terms — then generates intelligent boolean strings.
      </p>

      {/* Generate button */}
      {!result && !loading && (
        <button type="button" onClick={generate}
          style={{display:"flex",alignItems:"center",gap:"8px",padding:"10px 20px",borderRadius:"8px",
            background:"#0891b2",color:"#fff",border:"none",cursor:"pointer",fontSize:"13px",
            fontWeight:600,fontFamily:"Inter,sans-serif",marginBottom:"20px",
            boxShadow:"0 2px 8px rgba(8,145,178,0.3)"}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          Generate X-Ray Strings
        </button>
      )}

      {/* Loading */}
      {loading && (
        <div style={{display:"flex",alignItems:"center",gap:"10px",padding:"16px",background:"#f0fdff",borderRadius:"10px",border:"1px solid #a5f3fc",marginBottom:"20px"}}>
          <div style={{width:"16px",height:"16px",border:"2px solid #0891b2",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0}}/>
          <span style={{fontSize:"13px",color:"#0891b2",fontFamily:"Inter,sans-serif",fontWeight:500}}>AI is researching your skills ecosystem and generating boolean strings...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{padding:"12px 14px",background:"#fef2f2",borderRadius:"8px",border:"1px solid #fecaca",marginBottom:"16px"}}>
          <span style={{fontSize:"12px",color:"#dc2626",fontFamily:"Inter,sans-serif"}}>{error}</span>
        </div>
      )}

      {/* Results */}
      {result && (
        <div>
          {/* Strategy */}
          {result.strategy && (
            <div style={{marginBottom:"20px",padding:"14px 16px",background:"#f0fdff",borderRadius:"10px",border:"1px solid #a5f3fc",borderLeft:"3px solid #0891b2"}}>
              <div style={{fontSize:"10px",fontWeight:600,color:"#0891b2",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:"6px",fontFamily:"Inter,sans-serif"}}>
                💡 Search Strategy
              </div>
              <p style={{fontSize:"13px",color:"#374151",lineHeight:1.6,fontFamily:"Inter,sans-serif",margin:0}}>{result.strategy}</p>
            </div>
          )}

          {/* Strings */}
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            {(result.strings||[]).map((s, i) => (
              <div key={i} style={{background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:"10px",padding:"14px",borderLeft:"3px solid #0891b2"}}>
                <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"10px"}}>
                  <span style={{fontSize:"11px",fontWeight:700,padding:"2px 8px",borderRadius:"4px",
                    background:"#f0fdff",color:"#0891b2",border:"1px solid #a5f3fc",fontFamily:"Inter,sans-serif"}}>
                    {i+1}
                  </span>
                  <span style={{fontSize:"13px",fontWeight:600,color:"#111827",fontFamily:"Inter,sans-serif"}}>{s.label}</span>
                </div>
                <div style={{display:"flex",alignItems:"flex-start",gap:"8px",background:"#f8fafc",borderRadius:"7px",padding:"10px 12px",border:"1px solid #e5e7eb"}}>
                  <span style={{flex:1,fontSize:"12px",color:"#374151",fontFamily:"'JetBrains Mono',monospace",wordBreak:"break-all",lineHeight:1.6}}>{s.query}</span>
                  <div style={{display:"flex",gap:"5px",flexShrink:0,marginTop:"2px"}}>
                    <button type="button" onClick={()=>copy(s.query, i)}
                      style={{padding:"5px 10px",borderRadius:"6px",fontSize:"11px",fontWeight:600,
                        border:"1px solid #e5e7eb",cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap",
                        background: copied===i ? "#f0fdf9" : "#ffffff",
                        color:      copied===i ? "#1da882" : "#6b7280"}}>
                      {copied===i ? "✓ Copied" : "Copy"}
                    </button>
                    <button type="button" onClick={()=>openGoogle(s.query)}
                      style={{padding:"5px 10px",borderRadius:"6px",fontSize:"11px",fontWeight:600,
                        border:"1px solid #0891b2",background:"#0891b2",color:"#fff",
                        cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>
                      Search ↗
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Regenerate */}
          <button type="button" onClick={generate}
            style={{marginTop:"16px",display:"flex",alignItems:"center",gap:"6px",padding:"8px 16px",
              borderRadius:"7px",background:"#f0fdff",color:"#0891b2",border:"1px solid #a5f3fc",
              cursor:"pointer",fontSize:"12px",fontWeight:600,fontFamily:"Inter,sans-serif"}}>
            ↻ Regenerate
          </button>
        </div>
      )}

      <CandidateSearch mapData={mapData} form={form}/>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id:"icp",       label:"ICP & JD",   dot:"#f34d77" },
  { id:"companies", label:"Companies",  dot:"#4d64d8", count:d=>d.companies?.length },
  { id:"adjacent",  label:"Adjacent",   dot:"#9b6ef5", count:d=>d.adjacent?.length  },
  { id:"wildcards", label:"Wildcards",  dot:"#f6720d", count:d=>d.wildcards?.length  },
  { id:"titles",    label:"Titles",     dot:"#1da882", count:d=>d.titles?.length     },
  { id:"sourcing",  label:"Sourcing",   dot:"#0891b2", isNew:true },
];

function ResultTabs({ mapData, form, icp, jobDescription, onEnrich, enriching }) {
  const [active, setActive] = useState(icp ? "icp" : "companies");
  const nodes = {companies:mapData.companies,adjacent:mapData.adjacent,wildcards:mapData.wildcards,titles:mapData.titles};
  const visibleTabs = TABS.filter(t => t.id!=="icp" || icp);
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"24px",flexWrap:"wrap"}}>
        {visibleTabs.map(t=>{
          const isActive = active===t.id;
          return (
          <button key={t.id} type="button" onClick={()=>setActive(t.id)}
            style={{
              display:"flex",alignItems:"center",gap:"6px",
              padding:"7px 16px",
              fontSize:"13px",fontWeight: isActive ? 600 : 500,
              cursor:"pointer",
              borderRadius:"999px",
              color: isActive ? "#ffffff" : "#6b7280",
              background: isActive ? t.dot : "#f3f4f6",
              border: isActive ? `1.5px solid ${t.dot}` : "1.5px solid #e5e7eb",
              outline:"none",
              boxShadow: isActive ? `0 2px 8px ${t.dot}66` : "none",
              transition:"background .15s, color .15s, box-shadow .15s",
              fontFamily:"Inter,sans-serif",
              whiteSpace:"nowrap",
            }}>
            <div style={{
              width:"6px",height:"6px",borderRadius:"50%",flexShrink:0,
              background: isActive ? "rgba(255,255,255,0.8)" : t.dot,
            }}/>
            {t.label}
            {t.count && mapData && (
              <span style={{
                fontSize:"11px",fontWeight:700,
                color: isActive ? "#ffffff" : t.dot,
                background: isActive ? "rgba(255,255,255,0.22)" : t.dot+"18",
                padding:"1px 6px",borderRadius:"999px",marginLeft:"2px",
              }}>{t.count(mapData)}</span>
            )}
            {t.isNew && (
              <span style={{
                fontSize:"9px",padding:"2px 6px",borderRadius:"4px",
                background: isActive ? "rgba(255,255,255,0.25)" : "#fddbe4",
                color: isActive ? "#fff" : "#f34d77",
                border: isActive ? "none" : "1px solid #f894ad",
                fontWeight:700,marginLeft:"2px",
              }}>NEW</span>
            )}
          </button>
        );})}
      </div>
      {active==="icp" ? <ICPPanel icp={icp} jobDescription={jobDescription}/>
        : active==="sourcing" ? <SourcingTab mapData={mapData} form={form}/>
        : <Section cat={active} nodes={nodes[active]}
            extra={active==="companies" ? (
              <button type="button" onClick={onEnrich} disabled={enriching}
                style={{fontSize:"11px",fontWeight:600,padding:"4px 10px",borderRadius:"999px",border:"1px solid #a7f3d0",background:"#ecfdf5",color:"#059669",cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap",opacity:enriching?0.6:1}}>
                {enriching ? "Enriching…" : "⟳ Enrich with Crustdata"}
              </button>
            ) : null}/>
      }
    </div>
  );
}

// ─── Loading screen ───────────────────────────────────────────────────────────
function LoadingScreen() {
  const [step,setStep]=useState(0);
  const steps=TABS.filter(t=>t.id!=="candidates" && t.id!=="icp");
  useEffect(()=>{const iv=setInterval(()=>setStep(s=>(s+1)%steps.length),900);return()=>clearInterval(iv);},[]);
  return (
    <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"28px"}}>

      {/* Rotating compass */}
      <div style={{position:"relative",width:"80px",height:"80px"}}>
        {/* Outer ring — static */}
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" style={{position:"absolute",inset:0}}>
          <circle cx="40" cy="40" r="36" stroke="#e5e7eb" strokeWidth="1.5"/>
          <circle cx="40" cy="40" r="28" stroke="#e5e7eb" strokeWidth="0.5" opacity="0.5"/>
          {/* Cardinal ticks */}
          {[0,90,180,270].map(deg=>(
            <line key={deg}
              x1={40 + 33*Math.sin(deg*Math.PI/180)}
              y1={40 - 33*Math.cos(deg*Math.PI/180)}
              x2={40 + 36*Math.sin(deg*Math.PI/180)}
              y2={40 - 36*Math.cos(deg*Math.PI/180)}
              stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
          ))}
        </svg>

        {/* Needle — rotating */}
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none"
          style={{position:"absolute",inset:0,animation:"compassSpin 2s ease-in-out infinite"}}>
          {/* North needle — blue */}
          <polygon points="40,10 37,40 40,36 43,40" fill="#4d64d8"/>
          {/* South needle — grey */}
          <polygon points="40,70 37,40 40,44 43,40" fill="#d1d5db"/>
          {/* Center pivot */}
          <circle cx="40" cy="40" r="4" fill="#ffffff" stroke="#4d64d8" strokeWidth="2"/>
          <circle cx="40" cy="40" r="1.5" fill="#4d64d8"/>
        </svg>
      </div>

      {/* Steps */}
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:"11px",color:"#9ca3af",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:"14px",fontFamily:"Inter,sans-serif"}}>Mapping talent</div>
        {steps.map((t,i)=>(
          <div key={t.id} style={{
            display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",
            marginBottom:"6px",
            opacity: i===step ? 1 : 0.2,
            transition:"opacity 0.3s ease",
          }}>
            <div style={{width:"6px",height:"6px",borderRadius:"50%",background:t.dot,flexShrink:0,
              boxShadow: i===step ? `0 0 6px ${t.dot}` : "none",
              transition:"box-shadow 0.3s ease"}}/>
            <span style={{
              fontSize:"13px",fontWeight: i===step ? 600 : 400,
              color: i===step ? t.dot : "#9ca3af",
              fontFamily:"Inter,sans-serif",
              transition:"color 0.3s ease",
            }}>{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Chatbot ──────────────────────────────────────────────────────────────────
function Chatbot({ mapData, form }) {
  const [open,setOpen]=useState(false);
  const [messages,setMessages]=useState([{role:"assistant",text:"Hey! I'm Compass — ask me anything about how this tool works."}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const bottomRef=useRef(null);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);

  async function send() {
    const q=input.trim(); if(!q||loading) return;
    setInput(""); setMessages(m=>[...m,{role:"user",text:q}]); setLoading(true);
    try {
      const history=messages.map(m=>({role:m.role==="assistant"?"assistant":"user",content:m.text}));
      // Build live map context so chatbot can explain specific cards
      let mapContext = "";
      if (mapData) {
        const co = (mapData.companies||[]).map(c=>`  - ${c.label} (Relevance:${c.confidence}, Density:${c.talentDensity}, Poachability:${c.poachability}, Stage:${c.stage||"?"}) — ${c.whyRelevant||""} Signals: ${(c.poachabilitySignals||[]).join("; ")}`).join("\n");
        const adj = (mapData.adjacent||[]).map(c=>`  - ${c.label}: ${c.sub||""}`).join("\n");
        const wc  = (mapData.wildcards||[]).map(c=>`  - ${c.label}: ${c.sub||""}`).join("\n");
        const ti  = (mapData.titles||[]).map(t=>`  - ${t.label}`).join("\n");
        mapContext = `\n\nCURRENT MAP (role: ${form?.role||"?"}, seniority: ${form?.seniority||"?"}, location: ${form?.location||"?"}, skills: ${(form?.skills||[]).join(", ")||"none"}):
TARGET COMPANIES:\n${co||"  none"}
ADJACENT POOLS:\n${adj||"  none"}
WILDCARDS:\n${wc||"  none"}
TARGET TITLES:\n${ti||"  none"}
Use this data to give specific, contextual answers about the current map.`;
      }

      const res=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({messages:[{role:"user",content:"You are Compass, an expert guide embedded inside SourcingCompass. Answer in 2-4 sentences. Be specific — reference actual companies, scores, and signals from the current map when relevant.\n\nDOCS:\n"+DOC_CONTEXT+mapContext+"\n\nHistory:\n"+history.map(h=>h.role+": "+h.content).join("\n")+"\n\nQ: "+q}]})});
      const data=await res.json();
      const text=data.content?.map(b=>b.text||"").join("").trim()||"Couldn't get a response.";
      setMessages(m=>[...m,{role:"assistant",text}]);
    } catch {setMessages(m=>[...m,{role:"assistant",text:"Something went wrong."}]);}
    setLoading(false);
  }

  return (
    <>
      {/* Floating trigger button — always visible */}
      <button type="button" onClick={()=>setOpen(v=>!v)}
        style={{
          position:"fixed",bottom:"20px",right:"20px",zIndex:1000,
          width:"48px",height:"48px",borderRadius:"50%",
          background: open ? "#374151" : "#4d64d8",
          border:"none",cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",
          boxShadow:"0 4px 16px rgba(77,100,216,0.45)",
          transition:"all .2s",fontFamily:"Inter,sans-serif",
          color:"#ffffff",fontSize:"20px",fontWeight:600,
        }}>
        {open ? "×" : "✦"}
      </button>

      {/* Chat panel — positioned above button, won't overlap content */}
      {open && (
        <div style={{
          position:"fixed",bottom:"78px",right:"20px",zIndex:999,
          width:"300px",height:"420px",
          background:"#ffffff",
          border:"1px solid #e5e7eb",
          borderRadius:"14px",
          boxShadow:"0 16px 48px rgba(0,0,0,0.15)",
          display:"flex",flexDirection:"column",
          overflow:"hidden",
          fontFamily:"Inter,sans-serif",
        }}>
          {/* Header */}
          <div style={{padding:"12px 16px",borderBottom:"1px solid #f3f4f6",display:"flex",alignItems:"center",gap:"10px",background:"#fafafa"}}>
            <div style={{width:"32px",height:"32px",borderRadius:"50%",background:"#4d64d8",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:"12px",fontWeight:700,flexShrink:0}}>C</div>
            <div>
              <div style={{fontSize:"13px",fontWeight:600,color:"#111827"}}>Compass</div>
              <div style={{fontSize:"11px",color:"#9ca3af"}}>{loading?"Thinking...":"SourcingCompass guide"}</div>
            </div>
          </div>

          {/* Messages */}
          <div style={{flex:1,overflowY:"auto",padding:"12px",display:"flex",flexDirection:"column",gap:"8px"}}>
            {messages.map((m,i)=>(
              <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                <div style={{
                  maxWidth:"82%",borderRadius:"12px",padding:"8px 12px",
                  fontSize:"12px",lineHeight:1.5,
                  background: m.role==="user" ? "#4d64d8" : "#f3f4f6",
                  color: m.role==="user" ? "#ffffff" : "#374151",
                }}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{display:"flex",justifyContent:"flex-start"}}>
                <div style={{background:"#f3f4f6",borderRadius:"12px",padding:"10px 14px",display:"flex",gap:"4px",alignItems:"center"}}>
                  {[0,1,2].map(i=><div key={i} className="sc-spinner" style={{width:"6px",height:"6px",borderRadius:"50%",background:"#4d64d8",animation:`bounce ${0.6+i*0.1}s ease-in-out infinite alternate`}}/>)}
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Input */}
          <div style={{padding:"10px 12px",borderTop:"1px solid #f3f4f6",display:"flex",gap:"8px",background:"#fafafa"}}>
            <input
              style={{flex:1,background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:"8px",padding:"7px 12px",fontSize:"12px",color:"#111827",outline:"none",fontFamily:"Inter,sans-serif"}}
              placeholder="Ask anything..." value={input}
              onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}/>
            <button type="button" onClick={send} disabled={loading||!input.trim()}
              style={{padding:"7px 12px",borderRadius:"8px",background:"#4d64d8",color:"#fff",border:"none",cursor:"pointer",fontSize:"12px",fontWeight:600,opacity:loading||!input.trim()?0.3:1,fontFamily:"Inter,sans-serif"}}>→</button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── ICP & JD panel (results tab) ────────────────────────────────────────────
function ChipList({ items, tone }) {
  const tones = {
    green:  {bg:"#f0fdf4",color:"#16a34a",border:"#bbf7d0"},
    blue:   {bg:"#eff6ff",color:"#2563eb",border:"#bfdbfe"},
    red:    {bg:"#fef2f2",color:"#dc2626",border:"#fecaca"},
  };
  const c = tones[tone]||tones.blue;
  if (!items?.length) return <span style={{fontSize:"12px",color:"#9ca3af",fontFamily:"Inter,sans-serif"}}>None captured</span>;
  return (
    <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
      {items.map((t,i)=>(
        <span key={i} style={{fontSize:"12px",padding:"4px 10px",borderRadius:"6px",fontWeight:500,background:c.bg,color:c.color,border:`1px solid ${c.border}`,fontFamily:"Inter,sans-serif"}}>{t}</span>
      ))}
    </div>
  );
}

function ICPField({ label, children }) {
  return (
    <div style={{marginBottom:"18px"}}>
      <div style={{fontSize:"10px",color:"#9ca3af",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"8px",fontFamily:"Inter,sans-serif"}}>{label}</div>
      {children}
    </div>
  );
}

function ICPPanel({ icp, jobDescription }) {
  const [copied, setCopied] = useState(false);
  if (!icp) return <div style={{fontSize:"13px",color:"#9ca3af",fontFamily:"Inter,sans-serif"}}>No ICP yet — run the Intake Agent from the sidebar to generate one.</div>;

  function copyJD() {
    navigator.clipboard.writeText(jobDescription||"");
    setCopied(true); setTimeout(()=>setCopied(false), 2000);
  }
  function downloadJD() {
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([jobDescription||""],{type:"text/markdown"}));
    a.download=(icp.role||"job_description").replace(/\s+/g,"_")+".md"; a.click();
  }

  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"32px"}}>
      <div>
        {icp.summary && (
          <div style={{marginBottom:"20px",padding:"14px 16px",background:"#fff7f9",borderRadius:"10px",border:"1px solid #fbcfe1",borderLeft:"3px solid #f34d77"}}>
            <p style={{fontSize:"13px",color:"#374151",lineHeight:1.6,fontFamily:"Inter,sans-serif",margin:0}}>{icp.summary}</p>
          </div>
        )}
        <ICPField label="Team & Why Open"><p style={{fontSize:"13px",color:"#374151",lineHeight:1.6,fontFamily:"Inter,sans-serif",margin:0}}>{icp.teamContext||"Not captured"}</p></ICPField>
        <ICPField label="Must-Haves"><ChipList items={icp.mustHaves} tone="green"/></ICPField>
        <ICPField label="Nice-to-Haves"><ChipList items={icp.niceToHaves} tone="blue"/></ICPField>
        <ICPField label="Dealbreakers"><ChipList items={icp.dealbreakers} tone="red"/></ICPField>
        <ICPField label="Comp Range"><p style={{fontSize:"13px",color:"#374151",fontFamily:"Inter,sans-serif",margin:0,fontWeight:600}}>{icp.compRange||"Not captured"}</p></ICPField>
        <ICPField label="Success Metrics (6-12mo)"><p style={{fontSize:"13px",color:"#374151",lineHeight:1.6,fontFamily:"Inter,sans-serif",margin:0}}>{icp.successMetrics||"Not captured"}</p></ICPField>
        <ICPField label="Culture Notes"><p style={{fontSize:"13px",color:"#374151",lineHeight:1.6,fontFamily:"Inter,sans-serif",margin:0}}>{icp.cultureNotes||"Not captured"}</p></ICPField>
        <ICPField label="Interview Process"><p style={{fontSize:"13px",color:"#374151",lineHeight:1.6,fontFamily:"Inter,sans-serif",margin:0}}>{icp.interviewProcess||"Not captured"}</p></ICPField>
      </div>
      <div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"10px"}}>
          <div style={{fontSize:"10px",color:"#9ca3af",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"Inter,sans-serif"}}>Job Description</div>
          <div style={{display:"flex",gap:"6px"}}>
            <button type="button" onClick={copyJD} style={{fontSize:"11px",fontWeight:600,padding:"5px 10px",borderRadius:"6px",border:"1px solid #e5e7eb",background: copied?"#f0fdf9":"#fff",color: copied?"#1da882":"#6b7280",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>{copied?"✓ Copied":"Copy"}</button>
            <button type="button" onClick={downloadJD} style={{fontSize:"11px",fontWeight:600,padding:"5px 10px",borderRadius:"6px",border:"1px solid #4d64d8",background:"#eff2fe",color:"#4d64d8",cursor:"pointer",fontFamily:"Inter,sans-serif"}}>Download .md</button>
          </div>
        </div>
        <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:"10px",padding:"18px",fontSize:"13px",color:"#374151",lineHeight:1.7,fontFamily:"Inter,sans-serif",whiteSpace:"pre-wrap",maxHeight:"640px",overflowY:"auto"}}>
          {jobDescription || "No job description generated yet."}
        </div>
      </div>
    </div>
  );
}

// ─── ICP landing — shown before a market map has been generated ─────────────
function ICPLanding({ icp, jobDescription, onGenerateMap, loading }) {
  return (
    <div className="relative z-10 p-8" style={{maxWidth:"920px",margin:"0 auto"}}>
      <div style={{marginBottom:"20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"16px"}}>
        <div>
          <div style={{fontSize:"11px",fontWeight:700,color:"#f34d77",textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"Inter,sans-serif",marginBottom:"6px"}}>Intake complete</div>
          <h1 style={{fontSize:"22px",fontWeight:700,color:"#111827",fontFamily:"Inter,sans-serif"}}>{icp.role || "Ideal Candidate Profile"}</h1>
        </div>
        <button type="button" onClick={onGenerateMap} disabled={loading}
          style={{flexShrink:0,display:"flex",alignItems:"center",gap:"8px",padding:"11px 20px",borderRadius:"8px",fontSize:"14px",fontWeight:600,color:"white",border:"none",cursor:"pointer",background:"#4d64d8",boxShadow:"0 4px 12px rgba(77,100,216,0.4)",fontFamily:"Inter,sans-serif",opacity:loading?0.6:1}}>
          {loading ? "Mapping…" : "Generate Market Map →"}
        </button>
      </div>
      <ICPPanel icp={icp} jobDescription={jobDescription}/>
    </div>
  );
}

// ─── Intake Agent — conversational chat that builds the ICP ─────────────────
function IntakeChat({ transcript, onSend, onFinalize, loading, ready, finalizing, error }) {
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [transcript, loading]);

  function submit() {
    const text = input.trim();
    if (!text || loading || finalizing) return;
    setInput("");
    onSend(text);
  }

  return (
    <div className="relative z-10" style={{maxWidth:"680px",margin:"0 auto",padding:"32px 24px",display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{marginBottom:"16px"}}>
        <div style={{fontSize:"11px",fontWeight:700,color:"#4d64d8",textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"Inter,sans-serif",marginBottom:"6px"}}>Intake Agent</div>
        <h1 style={{fontSize:"20px",fontWeight:700,color:"#111827",fontFamily:"Inter,sans-serif"}}>Let's build your ICP</h1>
        <p style={{fontSize:"13px",color:"#9ca3af",marginTop:"4px",fontFamily:"Inter,sans-serif"}}>Answer like you would on a real intake call — the agent asks one question at a time, then synthesizes an ICP and job description.</p>
      </div>

      <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:"12px",paddingBottom:"16px",minHeight:"320px"}}>
        {transcript.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent: m.role==="user"?"flex-end":"flex-start"}}>
            <div style={{maxWidth:"80%",borderRadius:"14px",padding:"10px 14px",fontSize:"13px",lineHeight:1.6,fontFamily:"Inter,sans-serif",
              background: m.role==="user" ? "#4d64d8" : "#ffffff",
              color: m.role==="user" ? "#ffffff" : "#374151",
              border: m.role==="user" ? "none" : "1px solid #e5e7eb"}}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{display:"flex",justifyContent:"flex-start"}}>
            <div style={{background:"#ffffff",border:"1px solid #e5e7eb",borderRadius:"14px",padding:"10px 14px",display:"flex",gap:"4px",alignItems:"center"}}>
              {[0,1,2].map(i=><div key={i} style={{width:"6px",height:"6px",borderRadius:"50%",background:"#4d64d8",animation:`bounce ${0.6+i*0.1}s ease-in-out infinite alternate`}}/>)}
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {error && <div style={{fontSize:"12px",color:"#dc2626",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:"8px",padding:"8px 12px",marginBottom:"10px",fontFamily:"Inter,sans-serif"}}>{error}</div>}

      {ready && (
        <div style={{marginBottom:"10px",padding:"10px 14px",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:"8px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"10px"}}>
          <span style={{fontSize:"12px",color:"#16a34a",fontFamily:"Inter,sans-serif",fontWeight:500}}>Enough to build a solid ICP — wrap up whenever you're ready.</span>
          <button type="button" onClick={onFinalize} disabled={finalizing}
            style={{flexShrink:0,padding:"7px 14px",borderRadius:"7px",fontSize:"12px",fontWeight:600,border:"none",background:"#16a34a",color:"#fff",cursor:"pointer",fontFamily:"Inter,sans-serif",opacity:finalizing?0.6:1}}>
            {finalizing ? "Generating ICP…" : "Generate ICP & JD"}
          </button>
        </div>
      )}

      <div style={{display:"flex",gap:"8px"}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}
          placeholder="Type your answer…" disabled={loading||finalizing}
          style={{flex:1,padding:"11px 14px",borderRadius:"8px",border:"1px solid #e5e7eb",fontSize:"13px",fontFamily:"Inter,sans-serif",outline:"none"}}/>
        <button type="button" onClick={submit} disabled={loading||finalizing||!input.trim()}
          style={{padding:"11px 18px",borderRadius:"8px",background:"#4d64d8",color:"#fff",border:"none",cursor:"pointer",fontSize:"13px",fontWeight:600,fontFamily:"Inter,sans-serif",opacity:(loading||finalizing||!input.trim())?0.4:1}}>
          Send
        </button>
      </div>
      {!ready && (
        <button type="button" onClick={onFinalize} disabled={finalizing || transcript.length<2}
          style={{marginTop:"10px",alignSelf:"flex-start",fontSize:"11px",fontWeight:600,color:"#9ca3af",background:"none",border:"none",cursor:transcript.length<2?"default":"pointer",fontFamily:"Inter,sans-serif",textDecoration:transcript.length<2?"none":"underline"}}>
          {finalizing ? "Generating ICP…" : "Wrap up early & generate ICP anyway"}
        </button>
      )}
    </div>
  );
}

// ─── Market Report — printable/shareable artifact ────────────────────────────
function MarketReport({ mapData, form, icp, onClose }) {
  const today = new Date().toLocaleDateString(undefined, { year:"numeric", month:"long", day:"numeric" });
  const th = {textAlign:"left",fontSize:"10px",color:"#9ca3af",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",padding:"8px 10px",borderBottom:"1px solid #e5e7eb",fontFamily:"Inter,sans-serif"};
  const td = {fontSize:"12px",color:"#374151",padding:"10px 10px",borderBottom:"1px solid #f3f4f6",verticalAlign:"top",fontFamily:"Inter,sans-serif"};

  return (
    <div style={{position:"fixed",inset:0,zIndex:2000,background:"#f0f4f8",overflowY:"auto"}}>
      <style>{`
        @media print {
          .report-no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>
      <div className="report-no-print" style={{position:"sticky",top:0,zIndex:10,background:"#111827",padding:"12px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{color:"#fff",fontSize:"13px",fontWeight:600,fontFamily:"Inter,sans-serif"}}>Market Report — preview</span>
        <div style={{display:"flex",gap:"8px"}}>
          <button type="button" onClick={()=>window.print()} style={{padding:"8px 16px",borderRadius:"7px",background:"#4d64d8",color:"#fff",border:"none",cursor:"pointer",fontSize:"12px",fontWeight:600,fontFamily:"Inter,sans-serif"}}>Print / Save as PDF</button>
          <button type="button" onClick={onClose} style={{padding:"8px 16px",borderRadius:"7px",background:"transparent",color:"#fff",border:"1px solid rgba(255,255,255,0.3)",cursor:"pointer",fontSize:"12px",fontWeight:600,fontFamily:"Inter,sans-serif"}}>Close</button>
        </div>
      </div>

      <div style={{maxWidth:"960px",margin:"0 auto",background:"#fff",padding:"48px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>
        <div style={{borderBottom:"2px solid #111827",paddingBottom:"20px",marginBottom:"28px"}}>
          <div style={{fontSize:"11px",fontWeight:700,color:"#4d64d8",textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"Inter,sans-serif",marginBottom:"8px"}}>Market Mapping Report</div>
          <h1 style={{fontSize:"26px",fontWeight:700,color:"#111827",fontFamily:"Inter,sans-serif",marginBottom:"6px"}}>{form.role || "Talent Map"}</h1>
          <p style={{fontSize:"13px",color:"#6b7280",fontFamily:"Inter,sans-serif"}}>
            {[form.seniority, form.location, form.company && `Hiring for ${form.company}`].filter(Boolean).join(" · ")} · Generated {today}
          </p>
        </div>

        {icp && (
          <div style={{marginBottom:"32px"}}>
            <h2 style={{fontSize:"14px",fontWeight:700,color:"#111827",fontFamily:"Inter,sans-serif",marginBottom:"10px",textTransform:"uppercase",letterSpacing:"0.06em"}}>Ideal Candidate Profile</h2>
            {icp.summary && <p style={{fontSize:"13px",color:"#374151",lineHeight:1.7,fontFamily:"Inter,sans-serif",marginBottom:"12px"}}>{icp.summary}</p>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px",fontSize:"12px",fontFamily:"Inter,sans-serif"}}>
              <div><strong>Must-haves:</strong> {(icp.mustHaves||[]).join(", ")||"—"}</div>
              <div><strong>Nice-to-haves:</strong> {(icp.niceToHaves||[]).join(", ")||"—"}</div>
              <div><strong>Comp range:</strong> {icp.compRange||"—"}</div>
              <div><strong>Dealbreakers:</strong> {(icp.dealbreakers||[]).join(", ")||"—"}</div>
            </div>
          </div>
        )}

        <div style={{marginBottom:"32px"}}>
          <h2 style={{fontSize:"14px",fontWeight:700,color:"#111827",fontFamily:"Inter,sans-serif",marginBottom:"10px",textTransform:"uppercase",letterSpacing:"0.06em"}}>Target Companies — Salary, Level & Poachability</h2>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>
              <th style={th}>Company</th><th style={th}>Stage</th><th style={th}>Salary Band</th><th style={th}>Level</th>
              <th style={th}>Relevance</th><th style={th}>Poachability</th><th style={th}>Category</th><th style={th}>Signals</th>
            </tr></thead>
            <tbody>
              {(mapData.companies||[]).map(c=>(
                <tr key={c.id}>
                  <td style={{...td,fontWeight:600,color:"#111827"}}>{c.label}{c.crustdataEnriched && <span style={{color:"#059669",fontWeight:700}}> ✓</span>}</td>
                  <td style={td}>{c.stage||"—"}</td>
                  <td style={td}>{c.salaryRange||"—"}</td>
                  <td style={td}>{c.levelEquivalent||"—"}</td>
                  <td style={td}>{c.confidence ?? "—"}</td>
                  <td style={td}>{c.poachability ?? "—"}</td>
                  <td style={td}>{(c.poachabilityCategory||[]).join(", ")||"—"}</td>
                  <td style={{...td,maxWidth:"220px"}}>{(c.poachabilitySignals||[]).map(s=>s.replace(/^\[(confirmed|signal)\]\s*/i,"")).join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"32px",marginBottom:"32px"}}>
          <div>
            <h2 style={{fontSize:"14px",fontWeight:700,color:"#111827",fontFamily:"Inter,sans-serif",marginBottom:"10px",textTransform:"uppercase",letterSpacing:"0.06em"}}>Adjacent Talent Pools</h2>
            <ul style={{fontSize:"12px",color:"#374151",fontFamily:"Inter,sans-serif",lineHeight:1.8,paddingLeft:"18px",margin:0}}>
              {(mapData.adjacent||[]).map(n=><li key={n.id}><strong>{n.label}</strong> — {n.sub}</li>)}
            </ul>
          </div>
          <div>
            <h2 style={{fontSize:"14px",fontWeight:700,color:"#111827",fontFamily:"Inter,sans-serif",marginBottom:"10px",textTransform:"uppercase",letterSpacing:"0.06em"}}>Wildcard Bets</h2>
            <ul style={{fontSize:"12px",color:"#374151",fontFamily:"Inter,sans-serif",lineHeight:1.8,paddingLeft:"18px",margin:0}}>
              {(mapData.wildcards||[]).map(n=><li key={n.id}><strong>{n.label}</strong> — {n.sub}</li>)}
            </ul>
          </div>
        </div>

        <div>
          <h2 style={{fontSize:"14px",fontWeight:700,color:"#111827",fontFamily:"Inter,sans-serif",marginBottom:"10px",textTransform:"uppercase",letterSpacing:"0.06em"}}>Target Titles</h2>
          <div style={{display:"flex",flexWrap:"wrap",gap:"8px"}}>
            {(mapData.titles||[]).map(t=>(
              <span key={t.id} style={{fontSize:"12px",padding:"5px 12px",borderRadius:"6px",background:"#eff2fe",color:"#4d64d8",border:"1px solid #d2d8f8",fontFamily:"Inter,sans-serif"}}>{t.label}</span>
            ))}
          </div>
        </div>

        <p style={{marginTop:"40px",paddingTop:"16px",borderTop:"1px solid #f3f4f6",fontSize:"10px",color:"#9ca3af",fontFamily:"Inter,sans-serif"}}>
          Generated by SourcingCompass · AI-generated market intelligence{mapData.companies?.some(c=>c.crustdataEnriched) ? ", partially verified via Crustdata" : ""} · verify before acting.
        </p>
      </div>
    </div>
  );
}

// ─── Prompt builder ───────────────────────────────────────────────────────────
function buildPrompt(form, icp) {
  const icpContext = icp ? [
    "",
    "ICP CONTEXT (from hiring-manager intake interview — use to sharpen every field below):",
    "Team/why open: "+(icp.teamContext||"n/a"),
    "Must-haves: "+((icp.mustHaves||[]).join(", ")||"n/a"),
    "Nice-to-haves: "+((icp.niceToHaves||[]).join(", ")||"n/a"),
    "Dealbreakers: "+((icp.dealbreakers||[]).join(", ")||"n/a"),
    "Comp range: "+(icp.compRange||"n/a"),
  ] : [];
  return [
    "You are a talent intelligence system. Return ONLY compact single-line JSON. No newlines inside JSON. No markdown. No backticks. No explanation.",
    "Role: "+form.role+" | Hiring Company: "+form.company+" | Location: "+form.location+" | Seniority: "+form.seniority+" | Skills: "+form.skills.join(", "),
    "Industries: "+(form.industries.join(", ")||"Any")+" | Exclusions: "+(form.exclusions.join(", ")||"None"),
    ...icpContext,
    "",
    "CRITICAL: Tailor ALL output to the specific role above. Companies, profiles, signals, titles must match the ROLE and SKILLS — not generic engineering.",
    "",
    "RULES:",
    "1. companies — Prefer companies from the REFERENCE LIST below, but you may use other well-known companies if more relevant to the ROLE. NOT open source projects/frameworks/tools. Pick 6. Describe each from the perspective of the searched ROLE.",
    "2. adjacent — 4 real companies with transferable skills for THIS specific role.",
    "3. wildcards — 3 surprising companies for THIS role. BANNED: Airbnb, Netflix, Uber, Meta, Google, Amazon, Apple, Microsoft, Stripe.",
    "4. titles — 5 real LinkedIn job titles for THIS role. Include seniority + functional variants. Combine similar with OR syntax.",
    "5. salaryRange and levelEquivalent MUST reflect the specific LOCATION given above, not a default US market — see salaryRange rule below.",
    "",
    "KEEP ALL STRING VALUES UNDER 100 CHARACTERS. Be concise.",
    "poachabilitySignals: exactly 2 signals, prefix [Confirmed] or [Signal]. Max 80 chars each.",
    "poachabilityCategory: 1-2 short tags from this exact set: Layoffs, Restructuring, Acquisition, Funding Stress, Hiring Freeze, Stock Decline, Growth Stall. Pick whichever best explains the poachability score.",
    "likelyProfile: 1 sentence describing who works in THIS ROLE there. Max 80 chars.",
    "whyRelevant: 1 sentence on why this company is a good source for THIS ROLE. Max 80 chars.",
    "sub in adjacent/wildcards: 1 sentence on skill overlap for THIS ROLE. Max 100 chars.",
    "salaryRange: realistic total-comp band for THIS role/seniority AT THIS company, LOCALIZED to the LOCATION given above — use that market's typical pay level and currency symbol (e.g. £ for United Kingdom, € for Europe, ₹ for India, C$ for Canada, A$ for Australia, S$ for Singapore, $ only for United States). Do NOT default to US-dollar bands for a non-US location — a UK/India/etc. band must differ from the US figure for the same role and company. Base on public levels/comp data knowledge (levels.fyi-style, localized). Max 40 chars.",
    "levelEquivalent: THIS company's internal level name/number equivalent to the searched seniority, e.g. 'L5 / Staff' or 'IC4'. Max 24 chars.",
    "",
    'RETURN EXACTLY THIS COMPACT JSON STRUCTURE (single line, no newlines). The example uses placeholder values, including a placeholder currency symbol — replace with real data localized to the LOCATION given above:',
    '{"companies":[{"id":"c1","label":"COMPANY_NAME","sub":"What they do","tags":["tag1","tag2"],"confidence":85,"stage":"Public","talentDensity":80,"poachability":70,"salaryRange":"[LOCAL_CURRENCY]165k-195k + equity","levelEquivalent":"L5 / Staff","likelyProfile":"Who works in this role there.","poachabilitySignals":["[Confirmed] Specific recent event.","[Signal] Inferred trend."],"poachabilityCategory":["Layoffs"],"whyRelevant":"Why source from here for this role."}],"adjacent":[{"id":"a1","label":"COMPANY_NAME","sub":"Why skills transfer to this role.","tags":["tag"]}],"wildcards":[{"id":"w1","label":"COMPANY_NAME","sub":"Surprising skill overlap for this role.","tags":["tag"]}],"titles":[{"id":"t1","label":"Exact LinkedIn Title","confidence":90},{"id":"t2","label":"\\"Title Variant A\\" OR \\"Title Variant B\\"","confidence":85}]}',
    "Output ONLY the JSON object. Single line. No whitespace between keys. Start with { end with }.",
  ].join("\n");
}

const EMPTY={companies:[],adjacent:[],wildcards:[],titles:[]};
const LOCATIONS=["United States","Canada","India","United Kingdom","Europe","Australia","Singapore"];

// ─── Resizable sidebar ────────────────────────────────────────────────────────
function ResizableSidebar({children}) {
  const [width,setWidth]=useState(280);
  const dragging=useRef(false); const startX=useRef(0); const startW=useRef(0);
  function onMouseDown(e){dragging.current=true;startX.current=e.clientX;startW.current=width;document.body.style.cursor="col-resize";document.body.style.userSelect="none";}
  useEffect(()=>{
    function onMouseMove(e){if(!dragging.current)return;setWidth(Math.min(480,Math.max(220,startW.current+(e.clientX-startX.current))));}
    function onMouseUp(){if(!dragging.current)return;dragging.current=false;document.body.style.cursor="";document.body.style.userSelect="";}
    window.addEventListener("mousemove",onMouseMove); window.addEventListener("mouseup",onMouseUp);
    return()=>{window.removeEventListener("mousemove",onMouseMove);window.removeEventListener("mouseup",onMouseUp);};
  },[]);
  return (
    <div style={{width,flexShrink:0,position:"relative",background:"#1a1f3c",borderRight:"1px solid #2d3461"}} className="flex flex-col z-10">
      {children}
      <div onMouseDown={onMouseDown} className="absolute top-0 right-0 w-1 h-full cursor-col-resize group z-20">
        <div className="absolute top-0 right-0 w-1 h-full transition-all group-hover:bg-sidebar-accent/30"/>
      </div>
    </div>
  );
}

// ─── Main app ─────────────────────────────────────────────────────────────────
export default function TalentMap() {
  const [form,setForm]=useState({role:"",company:"",location:"United States",seniority:"Senior",skills:[],industries:[],exclusions:[]});
  const [mapData,setMapData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [parsing,setParsing]=useState(false);
  const [error,setError]=useState("");
  const [generated,setGenerated]=useState(false);
  const [showJD,setShowJD]=useState(false);
  const jdRef=useRef(null);
  const generateAbortRef=useRef(null);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const allNodes=mapData?[...mapData.companies,...mapData.adjacent,...mapData.wildcards,...mapData.titles]:[];

  // ── Intake Agent ──
  const [mode,setMode]=useState("quick"); // "quick" | "intake"
  const [icp,setIcp]=useState(null);
  const [jobDescription,setJobDescription]=useState("");
  const [intakeTranscript,setIntakeTranscript]=useState([]);
  const [intakeLoading,setIntakeLoading]=useState(false);
  const [intakeReady,setIntakeReady]=useState(false);
  const [finalizing,setFinalizing]=useState(false);
  const [intakeError,setIntakeError]=useState("");
  const [showReport,setShowReport]=useState(false);
  const [enriching,setEnriching]=useState(false);

  async function sendIntakeTurn(userText) {
    const next = userText ? [...intakeTranscript, {role:"user",content:userText}] : intakeTranscript;
    if (userText) setIntakeTranscript(next);
    setIntakeLoading(true); setIntakeError("");
    try {
      const res=await fetch("/api/intake",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({transcript:next, phase:"chat"})});
      const data=await res.json();
      if(data.error) throw new Error(data.error);
      setIntakeTranscript(t=>[...t,{role:"assistant",content:data.reply}]);
      if(data.readyToFinalize) setIntakeReady(true);
    } catch(e){ setIntakeError(e.message); }
    setIntakeLoading(false);
  }

  useEffect(()=>{
    if (mode==="intake" && intakeTranscript.length===0 && !intakeLoading) sendIntakeTurn(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function finalizeIntake() {
    if (!intakeTranscript.length) return;
    setFinalizing(true); setIntakeError("");
    try {
      const res=await fetch("/api/intake",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({transcript:intakeTranscript, phase:"finalize"})});
      const data=await res.json();
      if(data.error) throw new Error(data.error);
      setIcp(data.icp); setJobDescription(data.jobDescription||"");
      setForm(f=>({...f,
        role: data.icp?.role || f.role,
        seniority: data.icp?.seniority || f.seniority,
        location: data.icp?.location || f.location,
        skills: data.icp?.mustHaves?.length ? data.icp.mustHaves : f.skills,
      }));
      setMode("quick");
    } catch(e){ setIntakeError("Finalize failed: "+e.message); }
    setFinalizing(false);
  }

  async function enrichCompanies() {
    if (!mapData?.companies?.length) return;
    setEnriching(true); setError("");
    try {
      const res=await fetch("/api/enrich",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({companies:mapData.companies.map(c=>c.label)})});
      const data=await res.json();
      if(data.error) throw new Error(data.error);
      if(!data.enriched?.length){ setError(data.message||"No Crustdata matches found for these companies."); setEnriching(false); return; }
      setMapData(md=>({
        ...md,
        companies: md.companies.map(c=>{
          const hit = data.enriched.find(e=>e.company.toLowerCase()===c.label.toLowerCase());
          if(!hit || !hit.signals?.length) return c;
          return { ...c, crustdataEnriched:true, poachabilitySignals:[...hit.signals, ...(c.poachabilitySignals||[])].slice(0,4) };
        }),
      }));
    } catch(e){ setError("Enrich failed: "+e.message); }
    setEnriching(false);
  }

  async function parseJD() {
    const txt=jdRef.current?.value||""; if(!txt.trim()) return;
    setParsing(true); setError("");
    try {
      const res=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({messages:[{role:"user",content:'Extract from JD, return ONLY raw JSON: {"role":"title","seniority":"Senior/Staff/etc","skills":["s1"]} JD: '+txt.slice(0,2000)}]})});
      const data=await res.json();
      const raw=data.content?.map(b=>b.text||"").join("").trim();
      const clean=repairJSON(raw.replace(/```json|```/g,"").trim());
      const parsed=JSON.parse(clean);
      setForm(f=>({...f,role:parsed.role||f.role,seniority:parsed.seniority||f.seniority,skills:parsed.skills?.length?parsed.skills:f.skills}));
      setShowJD(false);
    } catch(e){setError("JD parse failed: "+e.message);}
    setParsing(false);
  }

  function stopGenerate(){if(generateAbortRef.current)generateAbortRef.current.abort();setLoading(false);}

  async function generate() {
    if(!form.role.trim()){setError("Role title is required.");return;}
    if(generateAbortRef.current) generateAbortRef.current.abort();
    generateAbortRef.current=new AbortController();
    setError(""); setLoading(true); setMapData(null);
    try {
      const res=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},
        signal:generateAbortRef.current.signal,
        body:JSON.stringify({messages:[{role:"user",content:buildPrompt(form, icp)}]})});
      const data=await res.json();
      if(!res.ok){setError("API error "+res.status+": "+JSON.stringify(data));setLoading(false);return;}
      const raw=data.content?.map(b=>b.text||"").join("").trim();
      const cleaned=repairJSON(raw.replace(/```json|```/g,"").trim());
      const parsed=JSON.parse(cleaned);
      setMapData({...EMPTY,...parsed}); setGenerated(true);
    } catch(e){if(e.name!=="AbortError")setError("Error: "+e.message);}
    setLoading(false);
  }

  function exportCSV() {
    const rows=[["Section","Company/Title","Stage","Relevance","Density","Poachability","Salary Range","Level","Poachability Category","Profile","Signals","Why","Tags"]];
    mapData.companies.forEach(n=>rows.push(["Target",n.label,n.stage||"",n.confidence||"",n.talentDensity||"",n.poachability||"",n.salaryRange||"",n.levelEquivalent||"",(n.poachabilityCategory||[]).join(", "),n.likelyProfile||"",(n.poachabilitySignals||[]).join(" | "),n.whyRelevant||"",(n.tags||[]).join(", ")]));
    mapData.adjacent.forEach(n=>rows.push(["Adjacent",n.label,"","","","","","","","","","",(n.tags||[]).join(", ")]));
    mapData.wildcards.forEach(n=>rows.push(["Wildcard",n.label,"","","","","","","","","","",(n.tags||[]).join(", ")]));
    mapData.titles.forEach(n=>rows.push(["Title",n.label,"",n.confidence||"","","","","","","","","",(n.tags||[]).join(", ")]));
    const csv=rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(",")).join("\n");
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download="SourcingCompass_"+form.role.replace(/\s+/g,"_")+".csv"; a.click();
  }

  const inputCls = "sidebar-input w-full rounded-md px-3 py-2 text-sm focus:outline-none transition-colors";
  const inputStyle = {background:"#1e2449",border:"1px solid #2d3461",color:"#bfc8d6"};
  const labelCls = ""; const labelStyle = {display:"block",fontSize:"12px",fontWeight:500,color:"#8892b0",marginBottom:"6px",letterSpacing:"0.02em",fontFamily:"Inter,sans-serif"};

  return (
    <>
    <style>{`
      .sidebar-input::placeholder { color: #4a5a8a !important; opacity: 1; }
      .sidebar-input { color: #bfc8d6 !important; }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .sc-spinner { animation: spin 0.8s linear infinite; }
      @keyframes bounce { from { transform: translateY(0); opacity: 0.4; } to { transform: translateY(-4px); opacity: 1; } }
      @keyframes compassSpin {
        0%   { transform: rotate(0deg); }
        20%  { transform: rotate(200deg); }
        40%  { transform: rotate(170deg); }
        60%  { transform: rotate(365deg); }
        80%  { transform: rotate(350deg); }
        100% { transform: rotate(360deg); }
      }
    `}</style>
    <div className="flex h-screen overflow-hidden" style={{background:"#f0f4f8"}}>

      {/* ── Sidebar ── */}
      <ResizableSidebar>

        {/* Header */}
        <div className="px-5 pt-5 pb-4" style={{borderBottom:"1px solid #2d3461"}}>
          <div className="flex items-center gap-3">
            {/* Logo — teal rounded square with compass arrow, matching screenshot */}
            <div className="flex-shrink-0" style={{width:"40px",height:"40px",borderRadius:"10px",background:"#132d35",border:"1.5px solid rgba(36,201,160,0.5)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Outer circle */}
                <circle cx="12" cy="12" r="9" stroke="#24c9a0" strokeWidth="1.5" fill="none"/>
                {/* Inner circle */}
                <circle cx="12" cy="12" r="5.5" stroke="#24c9a0" strokeWidth="1" fill="none" opacity="0.5"/>
                {/* Compass needle — pointing top-right */}
                <polygon points="12,4.5 10.5,12 12,11 13.5,12" fill="#24c9a0"/>
                <polygon points="12,19.5 10.5,12 12,13 13.5,12" fill="rgba(36,201,160,0.35)"/>
                <circle cx="12" cy="12" r="1.5" fill="#132d35" stroke="#24c9a0" strokeWidth="1"/>
              </svg>
            </div>
            <div>
              <div className="text-[15px] font-bold text-white leading-tight tracking-tight">SourcingCompass</div>
              <div className="text-[10px] font-semibold tracking-[0.15em] uppercase mt-0.5" style={{color:"#24c9a0"}}>Talent Intelligence</div>
            </div>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="px-5 pt-4 flex gap-1.5">
          {[["quick","Quick Search"],["intake","Intake Agent"]].map(([id,label])=>(
            <button key={id} type="button" onClick={()=>setMode(id)}
              style={{flex:1,padding:"7px 10px",borderRadius:"7px",fontSize:"11px",fontWeight:600,cursor:"pointer",fontFamily:"Inter,sans-serif",
                background: mode===id ? "#24c9a0" : "transparent",
                color: mode===id ? "#0b1a17" : "#8892b0",
                border: mode===id ? "1px solid #24c9a0" : "1px solid #2d3461"}}>
              {label}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {mode==="intake" && (
            <div style={{fontSize:"11px",color:"#8892b0",background:"#1e2449",border:"1px solid #2d3461",borderRadius:"7px",padding:"10px 12px",lineHeight:1.5,fontFamily:"Inter,sans-serif"}}>
              The Intake Agent is running in the main panel →. Once you generate an ICP, this form auto-fills and you can jump to sourcing.
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelCls} style={labelStyle}>Role Title</label>
              <input className={inputCls} style={inputStyle} placeholder="e.g. Staff Engineer" value={form.role} onChange={e=>set("role",e.target.value)}/></div>
            <div><label className={labelCls} style={labelStyle}>Company</label>
              <input className={inputCls} style={inputStyle} placeholder="e.g. Atlan" value={form.company} onChange={e=>set("company",e.target.value)}/></div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelCls} style={labelStyle}>Location</label>
              <select className={inputCls} style={inputStyle} value={form.location} onChange={e=>set("location",e.target.value)}>
                {LOCATIONS.map(l=><option key={l}>{l}</option>)}
              </select></div>
            <div><label className={labelCls} style={labelStyle}>Seniority</label>
              <select className={inputCls} style={inputStyle} value={form.seniority} onChange={e=>set("seniority",e.target.value)}>
                {["Intern","Junior","Mid-Level","Senior","Lead","Staff","Principal","Manager","Senior Manager","Director","Senior Director","VP","SVP","C-Level"].map(s=><option key={s}>{s}</option>)}
              </select></div>
          </div>

          <div><label className={labelCls} style={labelStyle}>Must-Have Skills</label>
            <TagInput placeholder="Type skill, press , or Enter" tags={form.skills} onChange={v=>set("skills",v)}/></div>

          <div><label className={labelCls} style={labelStyle}>Industries</label>
            <TagInput placeholder="e.g. Fintech, Data" tags={form.industries} onChange={v=>set("industries",v)}/></div>

          <div><label className={labelCls} style={labelStyle}>Exclusions</label>
            <TagInput placeholder="Companies to skip" tags={form.exclusions} onChange={v=>set("exclusions",v)}/></div>

          <button type="button" onClick={()=>setShowJD(v=>!v)}
            className="text-xs font-medium text-left transition-colors" style={{color:"#24c9a0"}}>
            + {showJD?"Hide":"Paste"} Job Description
          </button>
          {showJD && (
            <div className="flex flex-col gap-2">
              <textarea ref={jdRef} rows={5} className={inputCls+" resize-none"} style={inputStyle} placeholder="Paste JD here..."/>
              <button type="button" onClick={parseJD} disabled={parsing}
                className="w-full py-2 rounded-md text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-40 transition-all">
                {parsing?"Parsing...":"Parse JD — auto-fill fields"}
              </button>
            </div>
          )}

          <p style={{fontSize:"11px",color:"#4a5a8a"}}>AI-generated · verify before sourcing</p>

          {error && <div style={{fontSize:"11px",color:"#f87171",background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:"6px",padding:"8px 10px",fontFamily:"Inter,sans-serif"}}>{error}</div>}

          {!loading ? (
            <button type="button" onClick={generate}
              style={{width:"100%",padding:"11px 16px",borderRadius:"8px",fontSize:"14px",fontWeight:600,color:"white",border:"none",cursor:"pointer",background:"#4d64d8",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",boxShadow:"0 4px 12px rgba(77,100,216,0.4)",fontFamily:"Inter,sans-serif"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
              Generate Map
            </button>
          ) : (
            <div style={{display:"flex",gap:"8px"}}>
              <div style={{flex:1,padding:"11px",borderRadius:"8px",fontSize:"12px",fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",background:"#1e2449",color:"#4a5a8a",fontFamily:"Inter,sans-serif"}}>
                <div className="sc-spinner" style={{width:"14px",height:"14px",border:"2px solid #24c9a0",borderTopColor:"transparent",borderRadius:"50%"}}/>
                Generating...
              </div>
              <button type="button" onClick={stopGenerate}
                style={{display:"flex",alignItems:"center",gap:"6px",padding:"8px 14px",borderRadius:"8px",fontSize:"11px",fontWeight:600,border:"1px solid rgba(239,68,68,0.4)",color:"#f87171",background:"none",cursor:"pointer",fontFamily:"Inter,sans-serif",flexShrink:0}}>
                <div style={{width:"6px",height:"6px",borderRadius:"2px",background:"#ef4444"}}/>Stop
              </button>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="px-5 py-4 flex flex-col gap-1.5" style={{borderTop:"1px solid #2d3461"}}>
          <div style={{fontSize:"10px",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",color:"#4a5a8a",marginBottom:"8px"}}>Legend</div>
          {Object.entries(CAT).map(([k,s])=>(
            <div key={k} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:s.dot}}/>
              <span style={{fontSize:"11px",color:"#8892b0"}}>{s.label}</span>
            </div>
          ))}
        </div>
      </ResizableSidebar>

      {/* ── Canvas ── */}
      <div className="flex-1 relative overflow-y-auto min-w-0" style={{background:"#f0f4f8",overflowX:"visible"}}>
        {mode==="intake" && !loading && (
          <IntakeChat transcript={intakeTranscript} onSend={sendIntakeTurn} onFinalize={finalizeIntake}
            loading={intakeLoading} ready={intakeReady} finalizing={finalizing} error={intakeError}/>
        )}

        {mode==="quick" && !generated && !loading && icp && (
          <ICPLanding icp={icp} jobDescription={jobDescription} onGenerateMap={generate} loading={loading}/>
        )}

        {mode==="quick" && !generated && !loading && !icp && (
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",textAlign:"center",padding:"0 32px"}}>
            <div style={{width:"80px",height:"80px",borderRadius:"20px",background:"#ffffff",border:"1px solid #e5e7eb",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:"20px",boxShadow:"0 4px 16px rgba(77,100,216,0.1)"}}>
              <svg width="44" height="44" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="14" r="12" stroke="#4d64d8" strokeWidth="1.2" opacity="0.3"/>
                <circle cx="14" cy="14" r="8" stroke="#4d64d8" strokeWidth="0.8" opacity="0.15"/>
                <polygon points="14,3 12,14 14,12.5 16,14" fill="#4d64d8"/>
                <polygon points="14,25 12,14 14,15.5 16,14" fill="#d1d5db"/>
                <circle cx="14" cy="14" r="2" fill="white" stroke="#4d64d8" strokeWidth="1.5"/>
                <line x1="14" y1="1" x2="14" y2="3" stroke="#4d64d8" strokeWidth="1" strokeLinecap="round"/>
                <line x1="14" y1="25" x2="14" y2="27" stroke="#d1d5db" strokeWidth="1" strokeLinecap="round"/>
                <line x1="1" y1="14" x2="3" y2="14" stroke="#d1d5db" strokeWidth="1" strokeLinecap="round"/>
                <line x1="25" y1="14" x2="27" y2="14" stroke="#d1d5db" strokeWidth="1" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{fontSize:"16px",fontWeight:600,color:"#111827",marginBottom:"8px",fontFamily:"Inter,sans-serif"}}>Configure your search</div>
            <div style={{fontSize:"13px",color:"#9ca3af",maxWidth:"260px",lineHeight:1.5,fontFamily:"Inter,sans-serif"}}>Fill in the role, skills, and location — or run the Intake Agent — then generate a talent map</div>
          </div>
        )}

        {loading && <LoadingScreen/>}

        {mode==="quick" && mapData && !loading && (
          <div className="relative z-10 p-8">
            <div style={{marginBottom:"20px",paddingBottom:"18px",borderBottom:"1px solid #e5e7eb",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"16px"}}>
              <div>
                <h1 style={{fontSize:"22px",fontWeight:700,color:"#111827",lineHeight:1.2,letterSpacing:"-0.02em",fontFamily:"Inter,sans-serif"}}>
                  {(form.role||"Talent Map").split(" ").map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(" ")}
                  {form.seniority && <span style={{color:"#9ca3af",fontWeight:400,margin:"0 8px",fontSize:"20px"}}>·</span>}
                  {form.seniority && <span style={{color:"#9ca3af",fontWeight:400,fontSize:"20px"}}>{form.seniority}</span>}
                </h1>
                <p style={{fontSize:"13px",color:"#9ca3af",marginTop:"4px",fontFamily:"Inter,sans-serif"}}>
                  {[form.company,form.location].filter(Boolean).join(" · ")} · {allNodes.length} nodes mapped
                </p>
              </div>
              <div style={{display:"flex",gap:"8px",flexShrink:0}}>
                <button type="button" onClick={()=>setShowReport(true)}
                  style={{display:"flex",alignItems:"center",gap:"7px",padding:"9px 18px",borderRadius:"8px",fontSize:"13px",fontWeight:600,border:"1.5px solid #f34d77",color:"#f34d77",background:"#fff5f7",cursor:"pointer",fontFamily:"Inter,sans-serif",whiteSpace:"nowrap"}}>
                  Create Report
                </button>
                <button type="button" onClick={exportCSV}
                  style={{display:"flex",alignItems:"center",gap:"7px",padding:"9px 18px",borderRadius:"8px",fontSize:"13px",fontWeight:600,border:"1.5px solid #4d64d8",color:"#4d64d8",background:"#f5f7ff",cursor:"pointer",fontFamily:"Inter,sans-serif",transition:"all .15s",whiteSpace:"nowrap"}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Export CSV
                </button>
              </div>
            </div>
            <ResultTabs mapData={mapData} form={form} icp={icp} jobDescription={jobDescription} onEnrich={enrichCompanies} enriching={enriching}/>
          </div>
        )}
      </div>

      <Chatbot mapData={mapData} form={form}/>
      {showReport && mapData && <MarketReport mapData={mapData} form={form} icp={icp} onClose={()=>setShowReport(false)}/>}
    </div>
    </>
  );
}
