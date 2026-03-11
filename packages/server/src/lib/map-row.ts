/**
 * Convert a snake_case DB row into a camelCase API response object.
 * Only converts top-level keys — nested objects/arrays (e.g. JSONB) are left as-is.
 */

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapRow(row: any): Record<string, unknown> {
  if (!row || typeof row !== "object") return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[snakeToCamel(key)] = value;
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapRows(rows: any[]): Record<string, unknown>[] {
  return rows.map((row) => mapRow(row));
}
