const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export const EMBEDDING_MODEL = "google/gemini-embedding-001";
export const CHAT_MODEL = "google/gemini-3.7-flash";

function apiKey() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this app.");
  return key;
}

async function gatewayFetch(path: string, body: unknown) {
  const res = await fetch(`${GATEWAY}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Lovable-API-Key": apiKey(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("AI rate limit reached. Please retry in a moment.");
    if (res.status === 402)
      throw new Error("AI credits exhausted. Add credits in Lovable to continue.");
    if (res.status === 403) throw new Error("AI access is blocked by workspace policy.");
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return res.json();
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  const batchSize = 32;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const json = (await gatewayFetch("/embeddings", {
      model: EMBEDDING_MODEL,
      input: batch,
    })) as { data: { embedding: number[] }[] };
    out.push(...json.data.map((d) => d.embedding));
  }
  return out;
}

export async function chatComplete(system: string, user: string): Promise<string> {
  const json = (await gatewayFetch("/chat/completions", {
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  })) as { choices: { message: { content: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}
