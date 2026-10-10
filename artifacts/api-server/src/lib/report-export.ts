export type ReportTable = { title: string; columns: string[]; rows: Array<Array<string | number>> };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function escapePdf(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/[()]/g, (character) => `\\${character}`);
}

export function toCsv(table: ReportTable): string {
  return [table.columns, ...table.rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

export function toExcelHtml(table: ReportTable): string {
  const row = (values: Array<string | number>, header = false) => `<tr>${values.map((value) => header ? `<th>${escapeHtml(String(value))}</th>` : `<td>${escapeHtml(String(value))}</td>`).join("")}</tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(table.title)}</title><style>body{font-family:Arial,sans-serif;color:#613248}table{border-collapse:collapse}th,td{border:1px solid #f2bfd2;padding:6px 9px}th{background:#f8e7ed}</style></head><body><h1>${escapeHtml(table.title)}</h1><table>${row(table.columns, true)}${table.rows.map((values) => row(values)).join("")}</table></body></html>`;
}

export function toPdf(table: ReportTable): Buffer {
  const lines = [table.title, `Dibuat: ${new Date().toISOString()}`, "", table.columns.join(" | "), ...table.rows.map((row) => row.join(" | "))];
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += 42) pages.push(lines.slice(index, index + 42));
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [" + pages.map((_, index) => `${5 + index * 2} 0 R`).join(" ") + `] /Count ${pages.length} >>`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  for (const page of pages) {
    const content = ["BT", "/F1 9 Tf", "45 760 Td", ...page.map((line, index) => `${index ? "0 -17 Td" : ""} (${escapePdf(line.slice(0, 150))}) Tj`), "ET"].join(" ");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length + 2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
  }
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets[index + 1] = Buffer.byteLength(output, "utf8"); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output, "utf8");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, "utf8");
}
