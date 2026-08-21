import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { CSVLoader } from "@langchain/community/document_loaders/fs/csv";
import { TextLoader } from "@langchain/classic/document_loaders/fs/text";
import type { Document } from "@langchain/core/documents";

import { chatComplete, embedTexts } from "./gateway.server";
import { addChunks, queryChunks, type ChunkRecord, type RetrievedChunk } from "./store.server";

export type TraceEntry = { node: string; detail: string; ms: number };

/* ---------------------------------- Ingestion graph --------------------------------- */

const IngestState = Annotation.Root({
  sessionId: Annotation<string>,
  fileName: Annotation<string>,
  fileType: Annotation<string>,
  content: Annotation<string>,
  docs: Annotation<Document[]>({ reducer: (_, b) => b, default: () => [] }),
  chunks: Annotation<Document[]>({ reducer: (_, b) => b, default: () => [] }),
  vectors: Annotation<number[][]>({ reducer: (_, b) => b, default: () => [] }),
  trace: Annotation<TraceEntry[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
});

function trace(node: string, detail: string, start: number): TraceEntry[] {
  return [{ node, detail, ms: Date.now() - start }];
}

const ingestGraph = new StateGraph(IngestState)
  .addNode("document_loader", async (state) => {
    const t = Date.now();
    const blob = new Blob([state.content], { type: "text/plain" });
    const loader =
      state.fileType === "csv" ? new CSVLoader(blob) : new TextLoader(blob);
    const docs = await loader.load();
    return {
      docs,
      trace: trace(
        "document_loader",
        `${state.fileType.toUpperCase()} loader produced ${docs.length} document(s)`,
        t,
      ),
    };
  })
  .addNode("chunking", async (state) => {
    const t = Date.now();
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 150 });
    const chunks = await splitter.splitDocuments(state.docs);
    return { chunks, trace: trace("chunking", `Split into ${chunks.length} chunks`, t) };
  })
  .addNode("embed", async (state) => {
    const t = Date.now();
    const embeddings = await embedTexts(state.chunks.map((c) => c.pageContent));
    return {
      vectors: embeddings,
      trace: trace("embeddings", `Embedded ${embeddings.length} chunks`, t),
    };
  })
  .addNode("chromadb", async (state) => {
    const t = Date.now();
    const records: ChunkRecord[] = state.chunks.map((chunk, i) => ({
      id: `${state.fileName}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      text: chunk.pageContent,
      embedding: state.vectors[i] ?? [],
      metadata: { source: state.fileName, fileType: state.fileType, chunkIndex: i },
    }));
    await addChunks(state.sessionId, records);
    return { trace: trace("chromadb", `Stored ${records.length} vectors`, t) };
  })
  .addEdge(START, "document_loader")
  .addEdge("document_loader", "chunking")
  .addEdge("chunking", "embed")
  .addEdge("embed", "chromadb")
  .addEdge("chromadb", END)
  .compile();

export async function runIngest(input: {
  sessionId: string;
  fileName: string;
  fileType: string;
  content: string;
}) {
  const result = await ingestGraph.invoke(input);
  return { chunkCount: result.chunks.length, trace: result.trace };
}

/* ----------------------------------- Query graph ------------------------------------ */

const QueryState = Annotation.Root({
  sessionId: Annotation<string>,
  question: Annotation<string>,
  queryEmbedding: Annotation<number[]>({ reducer: (_, b) => b, default: () => [] }),
  retrieved: Annotation<RetrievedChunk[]>({ reducer: (_, b) => b, default: () => [] }),
  answer: Annotation<string>({ reducer: (_, b) => b, default: () => "" }),
  trace: Annotation<TraceEntry[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
});

const queryGraph = new StateGraph(QueryState)
  .addNode("embeddings", async (state) => {
    const t = Date.now();
    const [embedding] = await embedTexts([state.question]);
    return {
      queryEmbedding: embedding ?? [],
      trace: trace("embeddings", "Embedded the question", t),
    };
  })
  .addNode("retriever", async (state) => {
    const t = Date.now();
    const retrieved = await queryChunks(state.sessionId, state.queryEmbedding, 5);
    return {
      retrieved,
      trace: trace("retriever", `Retrieved ${retrieved.length} relevant chunks`, t),
    };
  })
  .addNode("llm", async (state) => {
    const t = Date.now();
    if (state.retrieved.length === 0) {
      return {
        answer: "I couldn't find anything relevant in the uploaded documents.",
        trace: trace("llm", "Skipped generation — no context", t),
      };
    }
    const context = state.retrieved
      .map((c, i) => `[${i + 1}] (source: ${c.metadata.source})\n${c.text}`)
      .join("\n\n");
    const answer = await chatComplete(
      "You answer strictly from the provided document context. Cite sources inline as [1], [2]. If the context does not contain the answer, say so plainly.",
      `Context:\n${context}\n\nQuestion: ${state.question}`,
    );
    return { answer, trace: trace("llm", "Generated grounded answer", t) };
  })
  .addEdge(START, "embeddings")
  .addEdge("embeddings", "retriever")
  .addEdge("retriever", "llm")
  .addEdge("llm", END)
  .compile();

export async function runQuery(input: { sessionId: string; question: string }) {
  const result = await queryGraph.invoke(input);
  return { answer: result.answer, sources: result.retrieved, trace: result.trace };
}
