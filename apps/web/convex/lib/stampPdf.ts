import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// The signed copy of a company's own PDF: the file exactly as uploaded, with
// one page added at the end saying who signed it, when, the signature, and
// the original file's fingerprint (so the untouched original can be matched).

export interface StampInput {
  title: string;
  reference: string;
  company?: string;
  signerName?: string;
  signedAt: string;
  acknowledgedAt?: string;
  signature?: string;
  fileName?: string;
  sha256?: string;
}

/** Reads a signature data URL (PNG or JPEG) into bytes and its kind. */
function signatureBytes(dataUrl: string | undefined): { bytes: Uint8Array; kind: "png" | "jpg" } | null {
  const match = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl ?? "");
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, kind: match[1].toLowerCase() === "png" ? "png" : "jpg" };
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "long", timeStyle: "short" }) + " Central";

/** The PDF with a signature page added at the end. */
export async function stampSignature(pdf: ArrayBuffer | Uint8Array, input: StampInput): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  const ink = rgb(0.07, 0.09, 0.15);
  const muted = rgb(0.42, 0.45, 0.5);
  let y = 730;
  const line = (text: string, opts: { size?: number; bold?: boolean; color?: typeof ink } = {}) => {
    page.drawText(text, { x: 56, y, size: opts.size ?? 11, font: opts.bold ? bold : font, color: opts.color ?? ink, maxWidth: 500 });
    y -= (opts.size ?? 11) + 10;
  };

  line("Signature page", { size: 20, bold: true });
  line(`${input.title} · ${input.reference}`, { color: muted });
  if (input.company) line(`From ${input.company}`, { color: muted });
  y -= 12;
  line(`Signed by: ${input.signerName ?? "the client"}`, { bold: true });
  line(`Signed: ${when(input.signedAt)}`);
  if (input.acknowledgedAt) line(`Confirmed they read this document: ${when(input.acknowledgedAt)}`);
  y -= 8;

  const sig = signatureBytes(input.signature);
  const image = sig ? await (sig.kind === "png" ? doc.embedPng(sig.bytes) : doc.embedJpg(sig.bytes)).catch(() => null) : null;
  if (!image) line("Signature on file in Webb Leads.", { color: muted });
  if (image) {
    const scale = Math.min(300 / image.width, 100 / image.height, 1);
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawRectangle({ x: 52, y: y - h - 8, width: w + 8, height: h + 12, borderColor: rgb(0.85, 0.86, 0.88), borderWidth: 1 });
    page.drawImage(image, { x: 56, y: y - h - 2, width: w, height: h });
    y -= h + 28;
  }

  line("This page was added by Webb Leads when the document was signed. The pages before it are the", { size: 9, color: muted });
  line("document exactly as uploaded; its original file can be matched by this fingerprint:", { size: 9, color: muted });
  if (input.fileName) line(input.fileName, { size: 9, color: muted });
  if (input.sha256) line(`SHA-256 ${input.sha256}`, { size: 8, color: muted });
  return await doc.save();
}
