export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const prompt = body.messages?.[0]?.content || "";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://sourcing-compass.vercel.app",
        "X-Title": "SourcingCompass",
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct:free",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    const rawText = await response.text();
    let data;
    try { data = JSON.parse(rawText); }
    catch { return res.status(500).json({ error: `Non-JSON response: ${rawText.slice(0, 300)}` }); }

    if (!response.ok) {
      return res.status(500).json({ error: data?.error?.message || JSON.stringify(data) });
    }

    const text = data.choices?.[0]?.message?.content || "{}";
    res.status(200).json({ content: [{ type: "text", text }] });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
