/**
 * pdfjs-dist ships no types for its worker entry. It is only imported so the
 * build traces the file and `lib/parsing/pdf.ts` can register it as
 * `globalThis.pdfjsWorker`; nothing reads its exports directly.
 */
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown
}
