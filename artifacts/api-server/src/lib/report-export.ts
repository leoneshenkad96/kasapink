import { wibDateKey } from "./business-date";

export type ReportTable = {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  decimalColumns?: string[];
  summary?: Array<{ label: string; value: string }>;
  orientation?: "portrait" | "landscape";
  columnWeights?: number[];
  currencyColumns?: string[];
  note?: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function escapePdf(value: string): string {
  // PDF Helvetica + WinAnsi supports basic Indonesian text, Latin accents and typographic punctuation.
  const special: Record<string, number> = { "€": 128, "‚":130, "ƒ":131, "„":132, "…":133, "†":134, "‡":135, "ˆ":136, "‰":137, "Š":138, "‹":139, "Œ":140, "Ž":142, "‘":145, "’":146, "“":147, "”":148, "•":149, "–":150, "—":151, "˜":152, "™":153, "š":154, "›":155, "œ":156, "ž":158, "Ÿ":159 };
  return Array.from(value).map((character) => {
    if (character === "\\" || character === "(" || character === ")") return "\\" + character;
    const n = character.codePointAt(0) ?? 32;
    if (n >= 32 && n <= 126) return character;
    const code = special[character] ?? (n >= 160 && n <= 255 ? n : undefined);
    if (code !== undefined) return "\\" + code.toString(8).padStart(3, "0");
    const latin = character.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    return /^[\x20-\x7e]$/.test(latin) ? latin : "?";
  }).join("");
}

export function toCsv(table: ReportTable): string {
  const decimalIndexes = new Set((table.currencyColumns ?? table.decimalColumns ?? []).map((column) => table.columns.indexOf(column)).filter((index) => index >= 0));
  return [table.columns, ...table.rows].map((row, rowIndex) => row.map((value, columnIndex) => {
    const formatted = rowIndex > 0 && decimalIndexes.has(columnIndex) && typeof value === "number" ? value.toFixed(2) : String(value);
    const safeValue = typeof value === "string" && /^[=+\-@\t\r]/.test(formatted) ? `'${formatted}` : formatted;
    return `"${safeValue.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
}

export function toExcelHtml(table: ReportTable): string {
  // Legacy Excel-compatible HTML (.xls). Numeric money cells remain numbers with exactly
  // two decimal places, matching the CSV dataset and the displayed PDF money values.
  const decimals = new Set((table.currencyColumns ?? table.decimalColumns ?? []).map(col => table.columns.indexOf(col)).filter(index => index >= 0));
  const cell = (value: string | number, index: number) => {
    const numeric = typeof value === "number";
    const formatted = numeric && decimals.has(index) ? value.toFixed(2) : String(value ?? "");
    const excelFormat = numeric && decimals.has(index) ? ' style="mso-number-format:&quot;0.00&quot;"' : "";
    return `<td${excelFormat}>${escapeHtml(formatted)}</td>`;
  };
  const header = `<tr>${table.columns.map(v => `<th>${escapeHtml(v)}</th>`).join("")}</tr>`;
  const dataRows = table.rows.map(values => `<tr>${values.map((v,i)=>cell(v,i)).join("")}</tr>`).join("");
  const summary = table.summary?.length ? `<section class="summary">${table.summary.map(x=>`<p><strong>${escapeHtml(x.label)}:</strong> ${escapeHtml(x.value)}</p>`).join("")}</section>` : "";
  const note = table.note ? `<p class="note">${escapeHtml(table.note)}</p>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(table.title)}</title><style>body{font-family:Arial,sans-serif;color:#40372B}table{border-collapse:collapse}th,td{border:1px solid #C9B990;padding:6px 9px}th{background:#ECE7D1}h1{color:#655942}.summary{background:#ECE7D1;padding:8px;margin:12px 0}.note{color:#655942}</style></head><body><h1>${escapeHtml(table.title)}</h1><p>${escapeHtml(table.subtitle ?? "")}</p>${summary}${note}<table>${header}${dataRows}</table></body></html>`;
}

const pdfText = (text: string, x: number, y: number, size = 9, bold = false, color = "0.25 0.22 0.17") => `BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${x} ${y} Td (${escapePdf(text)}) Tj ET`;

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
  const pageWidth = table.orientation === "landscape" ? 842 : 595;
  const pageHeight = table.orientation === "landscape" ? 595 : 842;
  const topY = pageHeight - 126;
  const footerLimit = 60;
  const left = 36;
  const usableWidth = pageWidth - left * 2;
  const weights = table.columnWeights?.length === table.columns.length ? table.columnWeights : table.columns.map((name) => /Nama|Item|Keterangan|Kategori/i.test(name) ? 1.6 : 1);
  const weightSum = weights.reduce((a,b)=>a+b,0) || 1;
  const colWidths = weights.map(w=>usableWidth*w/weightSum);
  const colXs = colWidths.map((_,i)=>left+colWidths.slice(0,i).reduce((a,b)=>a+b,0));
  const decimalIndexes = new Set((table.decimalColumns ?? []).map((column) => table.columns.indexOf(column)).filter((index) => index >= 0));
  const maxCharactersAt = (index: number) => Math.max(4, Math.floor((colWidths[index] - 10) / (7 * 0.52)));
  const headerLines = table.columns.map((column) => wrapPdfLines(column, maxCharactersAt(table.columns.indexOf(column))));
  const headerHeight = Math.max(22, 10 + Math.max(...headerLines.map((lines) => lines.length)) * 9);
  const preparedRows = table.rows.map((row) => {
    const cells = row.map((value, index) => {
      const formatted = value === "" || value === null || value === undefined ? "-" : decimalIndexes.has(index) && typeof value === "number"
        ? `Rp ${value.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : String(value);
      return wrapPdfLines(formatted, maxCharactersAt(index));
    });
    return { cells, height: Math.max(20, 10 + Math.max(...cells.map((lines) => lines.length)) * 9) };
  });
  const chunks: typeof preparedRows[] = [[]];
  let pageIndex = 0;
  const noteHeight = table.note ? (wrapPdfLines(table.note, Math.floor(usableWidth/4.4)).length * 10 + 17) : 0;
  let remainingHeight = (topY - (table.summary?.length ? 72 : 0) - noteHeight - footerLimit) - headerHeight;
  for (const row of preparedRows) {
    if (chunks[pageIndex].length && row.height > remainingHeight) {
      pageIndex += 1;
      chunks.push([]);
      remainingHeight = topY - headerHeight - footerLimit;
    }
    chunks[pageIndex].push(row);
    remainingHeight -= row.height;
  }
  const pages = chunks.map((rows, pageIndex) => {
    const commands: string[] = ["q", "0.54 0.46 0.31 rg", `0 ${pageHeight-100} ${pageWidth} 100 re f`, "Q"];
    // Option C header: permanent left-aligned Unified Core logomark, no tile or border.
    // The mark is 34pt wide and 42pt high, centered at x=57, y=pageHeight-50.
    const cx = left + 21, cy = pageHeight - 50;
    const petal = (x: number, y: number, color: string) => {
      commands.push("q", color + " rg",
        (x-5)+" "+y+" m "+x+" "+(y+8)+" l "+(x+5)+" "+y+" l "+x+" "+(y-8)+" l h f", "Q");
    };
    petal(cx,cy+12,"0.95 0.88 0.72");
    petal(cx-12,cy,"0.75 0.79 0.69");
    petal(cx+12,cy,"0.98 0.96 0.88");
    petal(cx,cy-12,"0.85 0.79 0.63");
    commands.push("q","0.98 0.96 0.88 rg",(cx-2.5)+" "+(cy-2.5)+" 5 5 re f","Q");

    const textLeft = left + 64;
    commands.push(pdfText("KASAPINK  /  CATATAN USAHA", textLeft, pageHeight - 20, 9, true, "1 1 1"));
    commands.push(pdfText(table.title, textLeft, pageHeight - 46, 18, true, "1 1 1"));
    commands.push(pdfText(table.subtitle ?? "Laporan operasional Kasapink ERP", textLeft, pageHeight - 68, 9, false, "0.97 0.96 0.91"));
    const metaX = pageWidth - left - 139;
    commands.push(pdfText("Dicetak " + wibDateKey() + " WIB", metaX, pageHeight - 20, 8, false, "1 1 1"));
    commands.push(pdfText("Halaman " + (pageIndex+1) + " dari " + chunks.length, metaX, pageHeight - 83, 8, false, "0.97 0.96 0.91"));

    let y = topY;
    if (pageIndex === 0 && table.summary?.length) {
      const gap = 8;
      const cardWidth = (usableWidth - gap * (table.summary.length - 1)) / table.summary.length;
      table.summary.forEach((item, index) => {
        const x = left + index * (cardWidth + gap);
        commands.push("q", "0.93 0.91 0.82 rg", `${x} ${y - 48} ${cardWidth} 48 re f`, "Q");
        commands.push(pdfText(item.label.toUpperCase(), x + 9, y - 17, 7, true, "0.40 0.35 0.26"));
        commands.push(pdfText(item.value, x + 9, y - 36, 11, true));
      });
      y -= 72;
    }
    if (pageIndex === 0 && table.note) {
      const noteLines = wrapPdfLines(table.note, Math.floor(usableWidth/4.4));
      commands.push("q","0.97 0.96 0.92 rg", `${left} ${y-noteHeight} ${usableWidth} ${noteHeight} re f`, "Q");
      noteLines.forEach((note,i)=>commands.push(pdfText(note,left+8,y-14-i*10,8,false,"0.25 0.22 0.17")));
      y -= noteHeight + 4;
    }

    commands.push("q", "0.85 0.81 0.65 rg", `${left} ${y - headerHeight} ${usableWidth} ${headerHeight} re f`, "Q");
    headerLines.forEach((lines, index) => lines.forEach((line, lineIndex) => commands.push(pdfText(line, colXs[index] + 5, y - 13 - lineIndex * 9, 7, true))));
    y -= headerHeight;
    rows.forEach((row, rowIndex) => {
      if (rowIndex % 2 === 1) commands.push("q", "0.97 0.96 0.91 rg", `${left} ${y - row.height} ${usableWidth} ${row.height} re f`, "Q");
      row.cells.forEach((lines, index) => lines.forEach((line, lineIndex) => {
        const isNumeric = decimalIndexes.has(index) || (typeof table.rows[0]?.[index] === "number" && !/ID|Ref/i.test(table.columns[index]));
        const x = isNumeric ? Math.max(colXs[index]+5, colXs[index]+colWidths[index]-7-line.length*3.65) : colXs[index]+5;
        commands.push(pdfText(line, x, y-12-lineIndex*9, 7));
      }));
      commands.push("q", "0.79 0.73 0.56 RG", "0.3 w", `${left} ${y - row.height} m ${left + usableWidth} ${y - row.height} l S`, "Q");
      y -= row.height;
    });
    commands.push(pdfText("Kasapink ERP  |  Laporan dibuat otomatis dari data sistem", left, 24, 7, false, "0.40 0.35 0.26"));
    return commands.join("\n");
  });

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  const pageIds: number[] = [];
  pages.forEach((content) => {
    const pageId = objects.length + 1;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
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
