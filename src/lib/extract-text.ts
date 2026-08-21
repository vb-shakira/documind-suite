export type SupportedType = "pdf" | "csv" | "txt";

export function detectType(file: File): SupportedType | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".csv")) return "csv";
  if (name.endsWith(".txt") || name.endsWith(".md")) return "txt";
  return null;
}

/** Runs in the browser only (called from event handlers). */
export async function extractText(file: File, type: SupportedType): Promise<string> {
  if (type !== "pdf") return file.text();

  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(`[Page ${i}]\n${text}`);
  }
  return pages.join("\n\n");
}
