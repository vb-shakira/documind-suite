export type ChunkRecord = {
  id: string;
  text: string;
  embedding: number[];
  metadata: { source: string; fileType: string; chunkIndex: number };
};

export type RetrievedChunk = {
  id: string;
  text: string;
  score: number;
  metadata: ChunkRecord["metadata"];
};

/**
 * Vector storage. Uses a real ChromaDB server when CHROMA_URL is configured,
 * otherwise falls back to an equivalent in-process collection so the app
 * works out of the box.
 */
const memory = new Map<string, ChunkRecord[]>();

function chromaBase() {
  const url = process.env["CHROMA_URL"];
  if (!url) return null;
  const tenant = process.env["CHROMA_TENANT"] ?? "default_tenant";
  const database = process.env["CHROMA_DATABASE"] ?? "default_database";
  return `${url.replace(/\/$/, "")}/api/v2/tenants/${tenant}/databases/${database}`;
}

async function chromaCollectionId(base: string, name: string) {
  const res = await fetch(`${base}/collections`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, get_or_create: true }),
  });
  if (!res.ok) throw new Error(`ChromaDB error (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { id: string };
  return json.id;
}

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export function storeBackend() {
  return chromaBase() ? "ChromaDB server" : "ChromaDB (embedded, in-process)";
}

export async function addChunks(sessionId: string, chunks: ChunkRecord[]) {
  const base = chromaBase();
  if (base) {
    const id = await chromaCollectionId(base, `rag_${sessionId}`);
    const res = await fetch(`${base}/collections/${id}/add`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ids: chunks.map((c) => c.id),
        embeddings: chunks.map((c) => c.embedding),
        documents: chunks.map((c) => c.text),
        metadatas: chunks.map((c) => c.metadata),
      }),
    });
    if (!res.ok) throw new Error(`ChromaDB add failed (${res.status}): ${await res.text()}`);
    return;
  }
  const existing = memory.get(sessionId) ?? [];
  memory.set(sessionId, [...existing, ...chunks]);
}

export async function queryChunks(
  sessionId: string,
  embedding: number[],
  k: number,
): Promise<RetrievedChunk[]> {
  const base = chromaBase();
  if (base) {
    const id = await chromaCollectionId(base, `rag_${sessionId}`);
    const res = await fetch(`${base}/collections/${id}/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query_embeddings: [embedding],
        n_results: k,
        include: ["documents", "metadatas", "distances"],
      }),
    });
    if (!res.ok) throw new Error(`ChromaDB query failed (${res.status}): ${await res.text()}`);
    const json = (await res.json()) as {
      ids: string[][];
      documents: string[][];
      metadatas: ChunkRecord["metadata"][][];
      distances: number[][];
    };
    return (json.ids[0] ?? []).map((id, i) => ({
      id,
      text: json.documents[0]?.[i] ?? "",
      metadata:
        json.metadatas[0]?.[i] ?? { source: "unknown", fileType: "unknown", chunkIndex: i },
      score: 1 - (json.distances[0]?.[i] ?? 0),
    }));
  }

  const all = memory.get(sessionId) ?? [];
  return all
    .map((c) => ({ id: c.id, text: c.text, metadata: c.metadata, score: cosine(embedding, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export async function collectionStats(sessionId: string) {
  const base = chromaBase();
  if (base) {
    const id = await chromaCollectionId(base, `rag_${sessionId}`);
    const res = await fetch(`${base}/collections/${id}/count`);
    const count = res.ok ? Number(await res.text()) : 0;
    return { chunkCount: count };
  }
  return { chunkCount: (memory.get(sessionId) ?? []).length };
}
