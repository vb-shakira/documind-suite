import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { runIngest, runQuery } from "./rag/graph.server";
import { collectionStats, storeBackend } from "./rag/store.server";

const IngestInput = z.object({
  sessionId: z.string().min(1),
  fileName: z.string().min(1),
  fileType: z.enum(["pdf", "csv", "txt"]),
  content: z.string().min(1),
});

const QueryInput = z.object({
  sessionId: z.string().min(1),
  question: z.string().min(1),
});

export const ingestDocument = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => IngestInput.parse(input))
  .handler(async ({ data }) => {
    const result = await runIngest(data);
    const stats = await collectionStats(data.sessionId);
    return { ...result, backend: storeBackend(), totalChunks: stats.chunkCount };
  });

export const askQuestion = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => QueryInput.parse(input))
  .handler(async ({ data }) => runQuery(data));
