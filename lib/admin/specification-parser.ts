export const MAX_SPEC_PASTE_LENGTH = 20_000;

export type ParsedSpecificationRow = {
  id: string;
  attribute: string;
  value: string;
  extras: string[];
  needsReview: boolean;
  duplicate: boolean;
};

export type DuplicateResolution = "replace" | "keep" | "ignore";

function rowId() {
  return `spec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function sanitizeSpecificationText(input: string) {
  return input
    .slice(0, MAX_SPEC_PASTE_LENGTH)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r\n?/g, "\n");
}

export function normalizeSpecCell(value: string) {
  return value
    .replace(/^[\s\u2022\-*]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSpecKey(value: string) {
  return normalizeSpecCell(value).toLocaleLowerCase("pt-PT");
}

function splitSpecLine(line: string) {
  const raw = line.replace(/^[\s\u2022\-*]+/, "").trim();
  if (!raw) return null;

  const tabParts = raw.split(/\t+/).map(normalizeSpecCell).filter(Boolean);
  if (tabParts.length >= 2) {
    return { attribute: tabParts[0], value: tabParts[1], extras: tabParts.slice(2), needsReview: false };
  }

  const cleaned = normalizeSpecCell(raw);
  if (!cleaned) return null;

  const pipeParts = cleaned.split("|").map(normalizeSpecCell).filter(Boolean);
  if (pipeParts.length >= 2) {
    return { attribute: pipeParts[0], value: pipeParts[1], extras: pipeParts.slice(2), needsReview: false };
  }

  const directSeparator = cleaned.match(/^(.+?)\s*(?::|=|\s+-\s+)\s*(.+)$/);
  if (directSeparator) {
    return {
      attribute: normalizeSpecCell(directSeparator[1]),
      value: normalizeSpecCell(directSeparator[2]),
      extras: [],
      needsReview: false,
    };
  }

  const spacedColumns = cleaned.split(/\s{2,}/).map(normalizeSpecCell).filter(Boolean);
  if (spacedColumns.length >= 2) {
    return { attribute: spacedColumns[0], value: spacedColumns[1], extras: spacedColumns.slice(2), needsReview: false };
  }

  return { attribute: "", value: cleaned, extras: [], needsReview: true };
}

export function parseSpecificationBlock(input: string, existingAttributes: string[] = []): ParsedSpecificationRow[] {
  const existing = new Set(existingAttributes.map(normalizeSpecKey).filter(Boolean));
  return sanitizeSpecificationText(input)
    .split("\n")
    .map(splitSpecLine)
    .filter((row): row is NonNullable<ReturnType<typeof splitSpecLine>> => Boolean(row))
    .map((row) => ({
      id: rowId(),
      ...row,
      duplicate: Boolean(row.attribute && existing.has(normalizeSpecKey(row.attribute))),
    }));
}

export function mergeSpecificationRows<T extends { id: string; key: string; value: string }>(
  currentRows: T[],
  incomingRows: ParsedSpecificationRow[],
  mode: "append" | "replaceAll",
  duplicateResolution: DuplicateResolution
) {
  const acceptedIncoming = incomingRows.filter((row) => row.attribute || row.value);
  const toSpecRow = (row: ParsedSpecificationRow): T => ({
    id: rowId(),
    key: row.attribute,
    value: row.value,
  } as T);

  if (mode === "replaceAll") {
    return acceptedIncoming.map(toSpecRow);
  }

  if (duplicateResolution === "keep") {
    return [...currentRows, ...acceptedIncoming.map(toSpecRow)];
  }

  const incomingKeys = new Set(acceptedIncoming.map((row) => normalizeSpecKey(row.attribute)).filter(Boolean));

  if (duplicateResolution === "ignore") {
    return [
      ...currentRows,
      ...acceptedIncoming
        .filter((row) => !row.attribute || !currentRows.some((current) => normalizeSpecKey(current.key) === normalizeSpecKey(row.attribute)))
        .map(toSpecRow),
    ];
  }

  return [
    ...currentRows.filter((row) => !incomingKeys.has(normalizeSpecKey(row.key))),
    ...acceptedIncoming.map(toSpecRow),
  ];
}
