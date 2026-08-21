import { cn } from "@/lib/utils";
import { ArrowRight, Check, Loader2 } from "lucide-react";

export const WORKFLOW_NODES = [
  { id: "upload", label: "Document Upload" },
  { id: "document_loader", label: "Document Loader" },
  { id: "chunking", label: "Chunking" },
  { id: "embeddings", label: "Embeddings" },
  { id: "chromadb", label: "ChromaDB" },
  { id: "retriever", label: "Retriever" },
  { id: "llm", label: "LLM" },
  { id: "answer", label: "Answer" },
] as const;

export type NodeId = (typeof WORKFLOW_NODES)[number]["id"];

export function WorkflowGraph({
  activeNode,
  completed,
}: {
  activeNode: NodeId | null;
  completed: NodeId[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-y-3">
      {WORKFLOW_NODES.map((node, i) => {
        const isActive = activeNode === node.id;
        const isDone = completed.includes(node.id);
        return (
          <div key={node.id} className="flex items-center">
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all duration-300",
                isActive &&
                  "border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px_var(--ring-soft)]",
                !isActive && isDone && "border-accent bg-accent text-accent-foreground",
                !isActive && !isDone && "border-border bg-card text-muted-foreground",
              )}
            >
              {isActive ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : isDone ? (
                <Check className="size-3.5" />
              ) : (
                <span className="size-1.5 rounded-full bg-current opacity-50" />
              )}
              {node.label}
            </div>
            {i < WORKFLOW_NODES.length - 1 && (
              <ArrowRight
                className={cn(
                  "mx-1.5 size-4 shrink-0 transition-colors duration-300",
                  isDone ? "text-primary" : "text-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
