/** Escape a single CSV field per RFC 4180. */
export function escapeCsvField(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvRow(
  fields: (string | number | null | undefined)[],
): string {
  return fields.map(escapeCsvField).join(',');
}

export const EARNINGS_CSV_HEADERS = [
  'date',
  'clip title',
  'amount',
  'currency',
  'source',
  'transactionId',
] as const;

export function buildEarningsCsv(
  rows: (string | number | null | undefined)[][],
): string {
  const header = buildCsvRow([...EARNINGS_CSV_HEADERS]);
  const body = rows.map((row) => buildCsvRow(row)).join('\n');
  return body.length > 0 ? `${header}\n${body}` : `${header}\n`;
}
