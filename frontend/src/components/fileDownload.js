/**
 * Clean & formatted download utility
 * Formats: TXT, DOCX, PPTX, PDF
 */

import { Document, Packer, Paragraph } from "docx";
import PptxGenJS from "pptxgenjs";
import jsPDF from "jspdf";

/* =========================
   PARSE CONTENT
========================= */
const parseContent = (text) => {
  return String(text)
    .split("\n")
    .map((line) => {
      let type = "paragraph";
      let content = line;

      // 1. Detect Markdown Headings (e.g. # Heading)
      if (/^#{1,6}\s/.test(content)) {
        type = "heading";
        content = content.replace(/^#{1,6}\s+/, "");
      } 
      // 2. Detect Heuristic Headings (Short line ending in colon)
      else if (content.trim().endsWith(":") && content.trim().length < 80) {
        type = "heading";
      }

      // 3. Clean Markdown Symbols (*, **, `, links)
      content = content
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/`([^`]*)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/^-{3,}$/gm, "")
        .replace(/[^\x20-\x7E\n]/g, "")
        .trim();

      return { type, text: content };
    })
    .filter((item) => item.text);
};

/* =========================
   DROPBOX DOWNLOAD UTILITY
========================= */
export const downloadFromDropbox = (dropboxUrl) => {
  if (!dropboxUrl) {
    alert("Invalid Dropbox URL");
    return;
  }

  // Convert share link to direct download
  let downloadUrl = dropboxUrl;
  
  // Remove any trailing parameters first
  downloadUrl = downloadUrl.split("?")[0];
  
  // Replace dl=0 with dl=1 for direct download
  if (downloadUrl.includes("dl=0")) {
    downloadUrl = downloadUrl.replace("dl=0", "dl=1");
  } else if (!downloadUrl.includes("dl=")) {
    // If no dl parameter, add it
    downloadUrl += "?dl=1";
  }

  // Open in new window and download
  window.location.href = downloadUrl;
};

/* =========================
   MAIN EXPORT
========================= */
export const downloadFile = async (content, format = "pdf") => {
  if (!content || !String(content).trim()) {
    alert("No content to download");
    return;
  }

  const parsed = parseContent(content);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");

  switch (format) {
    case "txt":
      downloadTxt(parsed, `response_${ts}.txt`);
      break;

    case "doc":
    case "docx":
      await downloadDocx(parsed, `response_${ts}.docx`);
      break;

    case "ppt":
    case "pptx":
      downloadPptx(parsed, `response_${ts}.pptx`);
      break;

    case "pdf":
      downloadPdf(parsed, `response_${ts}.pdf`);
      break;

    default:
      alert("Unsupported format");
  }
};

/* =========================
   TXT
========================= */
const downloadTxt = (parsed, filename) => {
  const text = parsed.map((i) => i.text).join("\n\n");
  saveBlob(new Blob([text], { type: "text/plain" }), filename);
};

/* =========================
   DOCX
========================= */
const downloadDocx = async (parsed, filename) => {
  const paragraphs = parsed.map(
    (item) =>
      new Paragraph({
        text: item.text,
        bold: item.type === "heading",
        spacing: { after: item.type === "heading" ? 300 : 200 },
      })
  );

  const doc = new Document({
    sections: [{ children: paragraphs }],
  });

  const blob = await Packer.toBlob(doc);
  saveBlob(blob, filename);
};

/* =========================
   PPTX (MULTI-SLIDE)
========================= */
const downloadPptx = (parsed, filename) => {
  const pptx = new PptxGenJS();
  const MAX_CHARS = 650;

  let buffer = "";
  let slides = [];

  parsed.forEach((item) => {
    if ((buffer + item.text).length > MAX_CHARS) {
      slides.push(buffer.trim());
      buffer = item.text + "\n";
    } else {
      buffer += item.text + "\n";
    }
  });

  if (buffer.trim()) slides.push(buffer.trim());

  slides.forEach((text, i) => {
    const slide = pptx.addSlide();
    slide.addText(text, {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 5,
      fontSize: 18,
      wrap: true,
    });

    slide.addText(`Slide ${i + 1}`, {
      x: 8,
      y: 6.8,
      fontSize: 10,
      color: "999999",
    });
  });

  pptx.writeFile(filename);
};

/* =========================
   PDF (ABSOLUTE FIX)
========================= */
const downloadPdf = (parsed, filename) => {
  const pdf = new jsPDF("p", "mm", "a4");

  const margin = 15;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  let y = 20;

  parsed.forEach((item) => {
    // EXTRA SAFETY STRIP (PDF ONLY)
    const safeText = item.text
      .replace(/\*\*/g, "")
      .replace(/[^\x20-\x7E\n]/g, "");

    pdf.setFont("Helvetica", item.type === "heading" ? "bold" : "normal");

    const lines = pdf.splitTextToSize(safeText, width);

    lines.forEach((line) => {
      if (y > 280) {
        pdf.addPage();
        y = 20;
      }
      pdf.text(line, margin, y);
      y += item.type === "heading" ? 9 : 7;
    });

    y += 4;
  });

  pdf.save(filename);
};

/* =========================
   HELPER
========================= */
const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
export async function forceDownload(url, filename = "file.pdf") {
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include", // keep if auth/cookies are used
    });

    if (!response.ok) {
      throw new Error("Failed to download file");
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    // cleanup
    a.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error("❌ Force download failed:", err);
    alert("Failed to download file");
  }
}