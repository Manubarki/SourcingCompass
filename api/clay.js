import { pushToClay } from "./_helpers.js";

// ─── Push to Clay ─────────────────────────────────────────────────────────
// Clay's integration surface is an inbound webhook per table — there's no
// synchronous "search Clay" API. This sends target companies/candidates into
// the caller's Clay table so Clay's own enrichment waterfall can run on them;
// results show up in Clay, not back in this response.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body) body = {};

  const { rows, webhookUrl } = body;
  const url = webhookUrl || process.env.CLAY_WEBHOOK_URL;

  if (!url) return res.status(400).json({ error: "No Clay webhook URL configured. Set CLAY_WEBHOOK_URL or pass webhookUrl." });
  if (!rows?.length) return res.status(400).json({ error: "rows[] is required" });

  try {
    const result = await pushToClay(url, rows);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
