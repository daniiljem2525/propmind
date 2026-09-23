// Импорт/экспорт CSV: поддержка разделителей «,» и «;» (Excel RU), первая строка — заголовок.

export function parseCSV(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const delimiter = (lines[0].match(/;/g)?.length || 0) > (lines[0].match(/,/g)?.length || 0) ? ";" : ",";
  const splitLine = (line) =>
    line
      .split(delimiter)
      .map((cell) => cell.replace(/^["']|["']$/g, "").trim());

  const header = splitLine(lines[0]).map((h) => h.toLowerCase());
  const knownKeys = ["name", "address", "rent_amount", "rent", "type", "rooms", "area_sqm"];
  const hasHeader = header.some((h) => knownKeys.includes(h));

  const rows = lines.slice(hasHeader ? 1 : 0).map((line) => {
    const cells = splitLine(line);
    const row = {};
    header.forEach((key, i) => {
      if (hasHeader) row[key] = cells[i];
      else row[i] = cells[i];
    });
    return row;
  });

  return rows
    .map((row) => ({
      name: row.name || row["название"] || row[0] || "",
      address: row.address || row["адрес"] || row[1] || "",
      rent_amount: Number((row.rent_amount || row.rent || row["аренда"] || row[2] || "").replace(/\s/g, "")) || 0,
      type: row.type || undefined,
      rooms: row.rooms ? Number(row.rooms) : undefined,
      area_sqm: row.area_sqm ? Number(row.area_sqm) : undefined,
    }))
    .filter((r) => r.name && r.address);
}

export function toCSV(rows, headers) {
  const escape = (v) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = headers.map((h) => escape(h.label)).join(";");
  const body = rows
    .map((row) => headers.map((h) => escape(row[h.key])).join(";"))
    .join("\n");
  return `\uFEFF${head}\n${body}`;
}

export function downloadFile(content, fileName, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
