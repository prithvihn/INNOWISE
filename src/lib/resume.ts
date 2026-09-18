import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_RESUME_SIZE_MB = 10;

export function validateResumeFile(file: File): string | null {
  if (file.size > MAX_RESUME_SIZE_MB * 1024 * 1024) {
    return `File is too large. Maximum size is ${MAX_RESUME_SIZE_MB}MB.`;
  }
  const ext = file.name.split(".").pop()?.toLowerCase();
  const isPdf = file.type === "application/pdf" || ext === "pdf";
  const isTxt = file.type === "text/plain" || ext === "txt";
  if (!isPdf && !isTxt) {
    return "Unsupported file type. Please upload a PDF or TXT resume.";
  }
  return null;
}

export async function extractResumeText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (file.type === "text/plain" || ext === "txt") {
    return await file.text();
  }

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const chunks: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    chunks.push(pageText);
  }
  return chunks.join("\n");
}
