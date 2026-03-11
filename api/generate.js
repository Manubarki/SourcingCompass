export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const key = process.env.GROQ_API_KEY;

  // Debug: check if key is being read
  if (!key) return res.status(500).json({ error: "GROQ_API_KEY is undefined in environment" });
  if (!key.startsWith("gsk_")) return res.status(500).json({ error: `Key format wrong, starts with: ${key.slice(0,6)}` });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const prompt = body.messages?.[0]?.content || "";

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 3000,
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data?.error?.message || "Groq error" });

    const text = data.choices?.[0]?.message?.content || "{}";
    res.status(200).json({ content: [{ type: "text", text }] });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
