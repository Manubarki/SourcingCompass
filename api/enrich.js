import { crustdataEnrichCompany, hasCrustdata } from "./_helpers.js";

// ─── Real-data company enrichment (Crustdata) ────────────────────────────────
// Overlays actual headcount-growth / funding signals on top of the AI-generated
// market map so poachability isn't purely an LLM guess. Degrades gracefully —
// any company Crustdata can't resolve just gets skipped, never throws.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body) body = {};

  const { companies } = body;
  if (!companies?.length) return res.status(400).json({ error: "companies[] is required" });

  if (!hasCrustdata()) {
    return res.status(200).json({ enriched: [], configured: false, message: "CRUSTDATA_API_KEY not configured — showing AI-estimated signals only." });
  }

  try {
    const results = await Promise.all(companies.slice(0, 12).map(c => crustdataEnrichCompany(c)));
    const enriched = results.filter(Boolean);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json({ enriched, configured: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
