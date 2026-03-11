export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    
    const messages = body.messages;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "A valid messages array is required." });
    }

    // 1. DISGUISE THE REQUEST: Add browser-like headers to bypass Cloudflare bot protection
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.LITELLM_API_KEY}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json"
    };

    const response = await fetch("https://llmproxy.atlan.dev/chat/completions", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: "Claude 3.5 Sonnet", 
        messages: messages,         
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    const rawText = await response.text();
    let data;
    
    try { 
      data = JSON.parse(rawText); 
    } catch { 
      // 2. DEBUGGING: Log the exact HTML to your terminal so we know why it's blocking you
      console.error("\n--- PROXY BLOCKED REQUEST ---");
      console.error("Status Code:", response.status);
      console.error("Full HTML Output:\n", rawText);
      console.error("-----------------------------\n");
      
      return res.status(502).json({ 
        error: "Proxy blocked the request. Check your server terminal/console for the full HTML error." 
      }); 
    }

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: data?.error?.message || "An error occurred with the LLM provider" 
      });
    }

    const text = data.choices?.[0]?.message?.content || "";
    return res.status(200).json({ content: [{ type: "text", text }] });

  } catch (err) {
    console.error("LLM Generation API Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
