// 브라우저에서 파일을 만들어 내려받는다. 서버로 보내거나 저장하지 않는다.
import { toCsv } from "./lib/csv";
import type { Table } from "./lib/rows";

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadCsv(filename: string, t: Table) {
  save(new Blob([toCsv(t.header, t.rows)], { type: "text/csv;charset=utf-8" }), filename);
}

/** Excel(xlsx). exceljs 는 크므로 필요할 때만 불러온다. */
export async function downloadXlsx(filename: string, sheetName: string, t: Table) {
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(t.header).font = { bold: true };
  for (const r of t.rows) ws.addRow(r.map((v) => (typeof v === "string" && /^[=+\-@]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v) ? `'${v}` : v)));
  ws.columns.forEach((c, i) => { c.width = Math.min(40, Math.max(10, ...t.rows.slice(0, 200).map((r) => String(r[i] ?? "").length + 2), t.header[i].length + 4)); });
  const buf = await wb.xlsx.writeBuffer();
  save(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}
