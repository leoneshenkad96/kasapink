import { wibDateKey } from "./business-date";

export type ReportTable = {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  decimalColumns?: string[];
  summary?: Array<{ label: string; value: string }>;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function escapePdf(value: string): string {
  return value.normalize("NFKD").replace(/[^\x20-\x7E]/g, " ").replace(/\\/g, "\\\\").replace(/[()]/g, (character) => `\\${character}`);
}

export function toCsv(table: ReportTable): string {
  const decimalIndexes = new Set((table.decimalColumns ?? []).map((column) => table.columns.indexOf(column)).filter((index) => index >= 0));
  return [table.columns, ...table.rows].map((row, rowIndex) => row.map((value, columnIndex) => {
    const formatted = rowIndex > 0 && decimalIndexes.has(columnIndex) && typeof value === "number" ? value.toFixed(2) : String(value);
    const safeValue = typeof value === "string" && /^[=+\-@\t\r]/.test(formatted) ? `'${formatted}` : formatted;
    return `"${safeValue.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
}

export function toExcelHtml(table: ReportTable): string {
  const row = (values: Array<string | number>, header = false) => `<tr>${values.map((value) => header ? `<th>${escapeHtml(String(value))}</th>` : `<td>${escapeHtml(String(value))}</td>`).join("")}</tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(table.title)}</title><style>body{font-family:Arial,sans-serif;color:#613248}table{border-collapse:collapse}th,td{border:1px solid #f2bfd2;padding:6px 9px}th{background:#f8e7ed}</style></head><body><h1>${escapeHtml(table.title)}</h1><table>${row(table.columns, true)}${table.rows.map((values) => row(values)).join("")}</table></body></html>`;
}

const pdfText = (text: string, x: number, y: number, size = 9, bold = false, color = "0.38 0.20 0.28") => `BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${x} ${y} Td (${escapePdf(text)}) Tj ET`;

function wrapPdfLines(value: string, maxCharacters: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = "";
  const flush = () => { if (current) { lines.push(current); current = ""; } };
  for (const word of words) {
    if (word.length > maxCharacters) {
      flush();
      for (let offset = 0; offset < word.length; offset += maxCharacters) {
        const part = word.slice(offset, offset + maxCharacters);
        if (part.length === maxCharacters) lines.push(part);
        else current = part;
      }
      continue;
    }
    if (!current) current = word;
    else if (`${current} ${word}`.length <= maxCharacters) current += ` ${word}`;
    else { flush(); current = word; }
  }
  flush();
  return lines;
}

export function toPdf(table: ReportTable): Buffer {
  const pageWidth = 595;
  const left = 36;
  const usableWidth = pageWidth - left * 2;
  const columnWidth = usableWidth / Math.max(table.columns.length, 1);
  const decimalIndexes = new Set((table.decimalColumns ?? []).map((column) => table.columns.indexOf(column)).filter((index) => index >= 0));
  const maxCharacters = Math.max(4, Math.floor((columnWidth - 10) / (7 * 0.52)));
  const headerLines = table.columns.map((column) => wrapPdfLines(column, maxCharacters));
  const headerHeight = Math.max(22, 10 + Math.max(...headerLines.map((lines) => lines.length)) * 9);
  const preparedRows = table.rows.map((row) => {
    const cells = row.map((value, index) => {
      const formatted = decimalIndexes.has(index) && typeof value === "number"
        ? `Rp ${value.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : String(value);
      return wrapPdfLines(formatted, maxCharacters);
    });
    return { cells, height: Math.max(20, 10 + Math.max(...cells.map((lines) => lines.length)) * 9) };
  });
  const chunks: typeof preparedRows[] = [[]];
  let pageIndex = 0;
  let remainingHeight = (table.summary?.length ? 644 : 716) - headerHeight - 42;
  for (const row of preparedRows) {
    if (chunks[pageIndex].length && row.height > remainingHeight) {
      pageIndex += 1;
      chunks.push([]);
      remainingHeight = 716 - headerHeight - 42;
    }
    chunks[pageIndex].push(row);
    remainingHeight -= row.height;
  }
  const pages = chunks.map((rows, pageIndex) => {
    const commands: string[] = ["q", "0.38 0.20 0.28 rg", `0 742 ${pageWidth} 100 re f`, "Q"];
    commands.push(pdfText(table.title, left, 798, 21, true, "1 1 1"));
    commands.push(pdfText(table.subtitle ?? "Laporan operasional Kasapink ERP", left, 776, 9, false, "0.98 0.91 0.94"));
    commands.push(pdfText(`Dibuat ${wibDateKey()}  |  Halaman ${pageIndex + 1} dari ${chunks.length}`, left, 758, 8, false, "0.98 0.91 0.94"));

    let y = 716;
    if (pageIndex === 0 && table.summary?.length) {
      const gap = 8;
      const cardWidth = (usableWidth - gap * (table.summary.length - 1)) / table.summary.length;
      table.summary.forEach((item, index) => {
        const x = left + index * (cardWidth + gap);
        commands.push("q", "0.98 0.91 0.94 rg", `${x} ${y - 48} ${cardWidth} 48 re f`, "Q");
        commands.push(pdfText(item.label.toUpperCase(), x + 9, y - 17, 7, true, "0.55 0.38 0.45"));
        commands.push(pdfText(item.value, x + 9, y - 36, 11, true));
      });
      y -= 72;
    }

    commands.push("q", "0.95 0.75 0.82 rg", `${left} ${y - headerHeight} ${usableWidth} ${headerHeight} re f`, "Q");
    headerLines.forEach((lines, index) => lines.forEach((line, lineIndex) => commands.push(pdfText(line, left + index * columnWidth + 5, y - 13 - lineIndex * 9, 7, true))));
    y -= headerHeight;
    rows.forEach((row, rowIndex) => {
      if (rowIndex % 2 === 1) commands.push("q", "0.98 0.96 0.97 rg", `${left} ${y - row.height} ${usableWidth} ${row.height} re f`, "Q");
      row.cells.forEach((lines, index) => lines.forEach((line, lineIndex) => commands.push(pdfText(line, left + index * columnWidth + 5, y - 12 - lineIndex * 9, 7))));
      commands.push("q", "0.95 0.75 0.82 RG", "0.3 w", `${left} ${y - row.height} m ${left + usableWidth} ${y - row.height} l S`, "Q");
      y -= row.height;
    });
    commands.push(pdfText("Kasapink ERP  |  Laporan dibuat otomatis dari data sistem", left, 24, 7, false, "0.55 0.38 0.45"));
    return commands.join("\n");
  });

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  const pageIds: number[] = [];
  pages.forEach((content) => {
    const pageId = objects.length + 1;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
  });
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets[index + 1] = Buffer.byteLength(output, "utf8"); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output, "utf8");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, "utf8");
}
