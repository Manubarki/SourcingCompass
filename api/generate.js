export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  // 1. Ensure method is POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Next.js automatically parses JSON if the Content-Type header is correct, 
    // but this fallback ensures safety.
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    
    // 2. SUPPORT CHAT HISTORY: Pass the entire messages array instead of just the first message.
    // If you only pass the first message, the LLM will forget the context of the conversation.
    const messages = body.messages;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "A valid messages array is required." });
    }

    // 3. API Call to Litellm proxy
    const response = await fetch("https://llmproxy.atlan.dev/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.LITELLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: "Claude 3.5 Sonnet", // Ensure this exactly matches your proxy's model alias
        messages: messages,         // Send the full conversation history
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    const rawText = await response.text();
    let data;
    
    try { 
      data = JSON.parse(rawText); 
    } catch { 
      // 4. Fallback for bad gateway or HTML error pages from proxy
      return res.status(502).json({ error: `Invalid response from proxy: ${rawText.slice(0, 300)}` }); 
    }

    if (!response.ok) {
      // 5. Pass along the actual HTTP status code (e.g., 401, 429) rather than forcing a 500
      return res.status(response.status).json({ 
        error: data?.error?.message || "An error occurred with the LLM provider" 
      });
    }

    const text = data.choices?.[0]?.message?.content || "";
    
    // 6. Return standardized successful response
    return res.status(200).json({ content: [{ type: "text", text }] });

  } catch (err) {
    // 7. Log the actual error for server debugging, but return a safe message to the client
    console.error("LLM Generation API Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
