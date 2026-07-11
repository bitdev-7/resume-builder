/**
 * Minimal typings for pdf-parse's inner library entry point.
 * We import "pdf-parse/lib/pdf-parse.js" directly rather than the package root
 * because pdf-parse's index.js runs a debug file-read on import when it thinks
 * it is the main module, which throws in some runtimes.
 */
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: string;
  }
  function pdfParse(dataBuffer: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}
