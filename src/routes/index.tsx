import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { FileText, Table2, FileType2, Send, Upload, Database, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { WorkflowGraph, type NodeId } from "@/components/WorkflowGraph";
import { askQuestion, ingestDocument } from "@/lib/rag.functions";
import { detectType, extractText, type SupportedType } from "@/lib/extract-text";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Multi-Document RAG — LangGraph + ChromaDB" },
      {
        name: "description",
        content:
          "Upload PDF, CSV and TXT files, then ask questions across them with a LangGraph RAG pipeline backed by ChromaDB.",
      },
      { property: "og:title", content: "Multi-Document RAG — LangGraph + ChromaDB" },
      {
        property: "og:description",
        content:
          "Upload PDF, CSV and TXT files, then ask questions across them with a LangGraph RAG pipeline backed by ChromaDB.",
      },
    ],
  }),
  component: RagApp,
});

type DocItem = { name: string; type: SupportedType; chunks: number };
type Source = { id: string; text: string; score: number; metadata: { source: string; chunkIndex: number } };
type Trace = { node: string; detail: string; ms: number };

const INGEST_PATH: NodeId[] = ["upload", "document_loader", "chunking", "embeddings", "chromadb"];
const QUERY_PATH: NodeId[] = ["retriever", "llm", "answer"];

const typeIcon: Record<SupportedType, typeof FileText> = {
  pdf: FileType2,
  csv: Table2,
  txt: FileText,
};

function RagApp() {
  const ingest = useServerFn(ingestDocument);
  const ask = useServerFn(askQuestion);
  const sessionIdRef = useRef<string>(Math.random().toString(36).slice(2));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [docs, setDocs] = useState<DocItem[]>([]);
  const [backend, setBackend] = useState<string | null>(null);
  const [activeNode, setActiveNode] = useState<NodeId | null>(null);
  const [completed, setCompleted] = useState<NodeId[]>([]);
  const [trace, setTrace] = useState<Trace[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runPath<T>(path: NodeId[], work: Promise<T>): Promise<T> {
    let i = 0;
    setActiveNode(path[0] ?? null);
    const timer = setInterval(() => {
      i = Math.min(i + 1, path.length - 1);
      setActiveNode(path[i] ?? null);
      setCompleted((prev) => [...new Set([...prev, ...path.slice(0, i)])]);
    }, 650);
    try {
      const result = await work;
      setCompleted((prev) => [...new Set([...prev, ...path])]);
      return result;
    } finally {
      clearInterval(timer);
      setActiveNode(null);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const type = detectType(file);
        if (!type) {
          setError(`Unsupported file: ${file.name}. Use PDF, CSV or TXT.`);
          continue;
        }
        const content = await extractText(file, type);
        setCompleted([]);
        const result = await runPath(
          INGEST_PATH,
          ingest({ data: { sessionId: sessionIdRef.current, fileName: file.name, fileType: type, content } }),
        );
        setBackend(result.backend);
        setTrace(result.trace);
        setDocs((prev) => [...prev, { name: file.name, type, chunks: result.chunkCount }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleAsk() {
    if (!question.trim() || busy) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    setSources([]);
    setCompleted(["upload", "document_loader", "chunking", "embeddings", "chromadb"]);
    try {
      const result = await runPath(
        QUERY_PATH,
        ask({ data: { sessionId: sessionIdRef.current, question: question.trim() } }),
      );
      setAnswer(result.answer);
      setSources(result.sources as Source[]);
      setTrace(result.trace);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <Database className="size-4" />
            </span>
            <div>
              <h1 className="font-display text-lg font-semibold tracking-tight text-foreground">
                Multi-Document RAG
              </h1>
              <p className="text-xs text-muted-foreground">
                LangChain loaders · ChromaDB vectors · LangGraph orchestration
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="gap-1.5 rounded-full px-3 py-1 font-normal">
            <span className="size-1.5 rounded-full bg-primary" />
            {backend ?? "ChromaDB ready"}
          </Badge>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <Card className="p-5 shadow-[var(--shadow-card)]">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            LangGraph workflow
          </h2>
          <WorkflowGraph activeNode={activeNode} completed={completed} />
          {trace.length > 0 && (
            <ul className="mt-4 space-y-1 rounded-lg border border-border/70 bg-muted/40 p-3 font-mono text-xs text-muted-foreground">
              {trace.map((t, i) => (
                <li key={i}>
                  <span className="text-foreground">{t.node}</span> · {t.detail} · {t.ms}ms
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Card className="h-fit p-5 shadow-[var(--shadow-card)]">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Documents
            </h2>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.csv,.txt,.md"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-4" />
              Upload PDF, CSV or TXT
            </Button>

            <ul className="mt-4 space-y-2">
              {docs.map((doc, i) => {
                const Icon = typeIcon[doc.type];
                return (
                  <li
                    key={`${doc.name}-${i}`}
                    className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <Icon className="size-4 shrink-0 text-primary" />
                    <span className="truncate text-foreground">{doc.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {doc.chunks} chunks
                    </span>
                  </li>
                );
              })}
              {docs.length === 0 && (
                <li className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  No documents indexed yet
                </li>
              )}
            </ul>
            {docs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 w-full text-muted-foreground"
                onClick={() => {
                  sessionIdRef.current = Math.random().toString(36).slice(2);
                  setDocs([]);
                  setAnswer(null);
                  setSources([]);
                  setTrace([]);
                  setCompleted([]);
                }}
              >
                <Trash2 className="size-4" />
                Reset collection
              </Button>
            )}
          </Card>

          <div className="space-y-6">
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-foreground">Ask across your documents</h2>
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Summarise the key risks mentioned across all uploaded files."
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAsk();
                }}
              />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">⌘/Ctrl + Enter to send</span>
                <Button onClick={handleAsk} disabled={busy || docs.length === 0 || !question.trim()}>
                  <Send className="size-4" />
                  Run RAG pipeline
                </Button>
              </div>
              {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            </Card>

            {answer && (
              <Card className="p-5">
                <h2 className="mb-3 text-sm font-semibold text-foreground">Answer</h2>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{answer}</p>
              </Card>
            )}

            {sources.length > 0 && (
              <Card className="p-5">
                <h2 className="mb-3 text-sm font-semibold text-foreground">
                  Retrieved chunks ({sources.length})
                </h2>
                <ul className="space-y-3">
                  {sources.map((s, i) => (
                    <li key={s.id} className="rounded-md border border-border bg-muted/40 p-3">
                      <div className="mb-1.5 flex items-center gap-2 text-xs">
                        <Badge variant="outline">[{i + 1}]</Badge>
                        <span className="truncate font-medium text-foreground">{s.metadata.source}</span>
                        <span className="ml-auto shrink-0 text-muted-foreground">
                          chunk #{s.metadata.chunkIndex} · score {s.score.toFixed(3)}
                        </span>
                      </div>
                      <p className="line-clamp-6 text-xs leading-relaxed text-muted-foreground">{s.text}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
