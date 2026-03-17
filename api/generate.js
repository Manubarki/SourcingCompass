export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const prompt = body.messages?.[0]?.content || "";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4000,
      }),
    });

    const rawText = await response.text();
    let data;
    try { data = JSON.parse(rawText); }
    catch { return res.status(500).json({ error: `Non-JSON: ${rawText.slice(0, 300)}` }); }

    if (!response.ok) {
      return res.status(500).json({ error: data?.error?.message || JSON.stringify(data) });
    }

    const text = data.content?.map(b => b.text || "").join("").trim() || "{}";
    res.status(200).json({ content: [{ type: "text", text }] });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
