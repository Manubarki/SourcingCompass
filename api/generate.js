import { getMemory, getRelevant, callLLM, repairJSON } from "./_helpers.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Parse body
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body) body = {};

  try {
    const prompt = body.messages?.[0]?.content || "";
    const role = prompt.match(/Role:\s*(.+)/)?.[1]?.split("|")[0]?.trim() || "";
    const skills = (prompt.match(/Skills:\s*(.+)/)?.[1]?.split("|")[0] || "").split(",").map(s=>s.trim());
    const industries = (prompt.match(/Industries:\s*(.+)/)?.[1]?.split("|")[0] || "").split(",").map(s=>s.trim());

    const companies = await getMemory();
    const companyList = companies.length > 0
      ? "\n\nVERIFIED COMPANY LIST — for Target Companies ONLY use companies from this list. Adjacent and Wildcards may go beyond this list but must still be real, active companies:\n" + getRelevant(companies, role, skills, industries)
      : "";

    const SYSTEM_JSON = "You output ONLY valid compact single-line JSON. No newlines inside the JSON. No markdown. No backticks. No explanation before or after. Every string value must be concise (under 120 chars).";
    const raw = await callLLM(prompt + companyList, 8192, SYSTEM_JSON);
    const text = repairJSON(raw);

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json({ content: [{ type: "text", text }] });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
}
