import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

export interface NeutralBestPracticeRow {
  source: string;
  row: number;
  title?: string;
  description: string;
  rationale?: string | null;
  guidance?: string | null;
  pageArea?: string | null;
  outcome?: string | null;
  exampleUrl?: string | null;
  statusDefinitions?: {
    good?: string;
    canBeImproved?: string;
    bad?: string;
    notApplicable?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface ParsedBestPracticeDocument {
  rows: NeutralBestPracticeRow[];
  sections: string[];
  format: string;
}

const HEADER_ALIASES = {
  description: ['description', 'criterion', 'criteria', 'check', 'best practice', 'recommendation', 'requirement'],
  title: ['title', 'name', 'practice'],
  rationale: ['rationale', 'why', 'why is it important', 'reason', 'importance'],
  guidance: ['guidance', 'notes', 'how', 'implementation', 'recommendation notes'],
  pageArea: ['page area', 'page', 'where', 'where?', 'scope', 'page type'],
  outcome: ['outcome', 'metric', 'goal', 'category'],
  exampleUrl: ['example', 'example url', 'url', 'reference'],
  good: ['good', 'pass', 'meets standard'],
  canBeImproved: ['can be improved', 'needs improvement', 'partial'],
  bad: ['bad', 'fail', 'does not meet standard'],
  notApplicable: ['n/a', 'na', 'not applicable'],
} as const;

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findHeader(headers: string[], aliases: readonly string[]): number {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.findIndex((header) => normalizedAliases.includes(normalizeHeader(header)));
}

function excelCellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if ('text' in value && typeof value.text === 'string') return value.text.trim();
  if ('richText' in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('').trim();
  if ('result' in value && value.result !== undefined) return String(value.result).trim();
  return String(cell.text ?? '').trim();
}

function rowFromRecord(record: Record<string, unknown>, source: string, row: number): NeutralBestPracticeRow | null {
  const entries = Object.entries(record);
  const read = (aliases: readonly string[]) => {
    const entry = entries.find(([key]) => aliases.map(normalizeHeader).includes(normalizeHeader(key)));
    return entry?.[1] === null || entry?.[1] === undefined ? '' : String(entry[1]).trim();
  };
  const description = read(HEADER_ALIASES.description) || read(HEADER_ALIASES.title);
  if (!description) return null;
  return {
    source,
    row,
    title: read(HEADER_ALIASES.title) || undefined,
    description,
    rationale: read(HEADER_ALIASES.rationale) || null,
    guidance: read(HEADER_ALIASES.guidance) || null,
    pageArea: read(HEADER_ALIASES.pageArea) || null,
    outcome: read(HEADER_ALIASES.outcome) || null,
    exampleUrl: read(HEADER_ALIASES.exampleUrl) || null,
    statusDefinitions: {
      good: read(HEADER_ALIASES.good) || undefined,
      canBeImproved: read(HEADER_ALIASES.canBeImproved) || undefined,
      bad: read(HEADER_ALIASES.bad) || undefined,
      notApplicable: read(HEADER_ALIASES.notApplicable) || undefined,
    },
    metadata: record,
  };
}

async function parseWorkbook(buffer: Buffer): Promise<ParsedBestPracticeDocument> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const rows: NeutralBestPracticeRow[] = [];
  const sections: string[] = [];

  for (const worksheet of workbook.worksheets) {
    if (worksheet.actualRowCount < 2) continue;
    const headerSearchLimit = Math.min(10, worksheet.actualRowCount);
    let headerRowNumber = 1;
    let headers: string[] = [];
    for (let rowNumber = 1; rowNumber <= headerSearchLimit; rowNumber += 1) {
      const candidate = worksheet.getRow(rowNumber).values as unknown[];
      const texts = candidate.slice(1).map((_, index) => excelCellText(worksheet.getRow(rowNumber).getCell(index + 1)));
      if (findHeader(texts, HEADER_ALIASES.description) >= 0 || findHeader(texts, HEADER_ALIASES.title) >= 0) {
        headerRowNumber = rowNumber;
        headers = texts;
        break;
      }
    }
    if (headers.length === 0) continue;
    sections.push(worksheet.name);
    const descriptionIndex = findHeader(headers, HEADER_ALIASES.description);
    const titleIndex = findHeader(headers, HEADER_ALIASES.title);
    worksheet.eachRow((worksheetRow, rowNumber) => {
      if (rowNumber <= headerRowNumber) return;
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        if (header) record[header] = excelCellText(worksheetRow.getCell(index + 1));
      });
      let parsed = rowFromRecord(record, worksheet.name, rowNumber);
      // Cake's scorecard uses "Description" in column 4; generic sheets can use any recognised header.
      if (!parsed) {
        const fallbackIndex = descriptionIndex >= 0 ? descriptionIndex : titleIndex;
        const description = fallbackIndex >= 0 ? excelCellText(worksheetRow.getCell(fallbackIndex + 1)) : '';
        if (description) parsed = { source: worksheet.name, row: rowNumber, description, metadata: record };
      }
      if (parsed) rows.push(parsed);
    });
  }
  return { rows, sections, format: 'XLSX' };
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell.trim()); cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = '';
    } else cell += character;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseCsvDocument(text: string): ParsedBestPracticeDocument {
  const records = parseCsv(text);
  const headers = records.shift() ?? [];
  const rows = records.map((values, index) => {
    const record = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? '']));
    return rowFromRecord(record, 'CSV', index + 2);
  }).filter((row): row is NeutralBestPracticeRow => Boolean(row));
  return { rows, sections: ['CSV'], format: 'CSV' };
}

function flattenJson(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenJson);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  for (const key of ['criteria', 'checks', 'bestPractices', 'best_practices', 'recommendations', 'items']) {
    if (Array.isArray(record[key])) return flattenJson(record[key]);
  }
  return [record];
}

function parseJsonDocument(text: string): ParsedBestPracticeDocument {
  const records = flattenJson(JSON.parse(text));
  const rows = records.map((record, index) => rowFromRecord(record, 'JSON', index + 1))
    .filter((row): row is NeutralBestPracticeRow => Boolean(row));
  return { rows, sections: ['JSON'], format: 'JSON' };
}

function parseTextDocument(text: string, format: string): ParsedBestPracticeDocument {
  const normalized = text.replace(/\r/g, '').replace(/\u00a0/g, ' ').trim();
  // Numbered audit documents commonly put rationale, examples and sub-bullets
  // below each question. Keep that entire block attached to the numbered item.
  const hasNumberedChecklist = /^\s*\d+[.)]\s+/m.test(normalized);
  const chunks = hasNumberedChecklist
    ? normalized.split(/(?=^\s*\d+[.)]\s+)/gm)
    : normalized.split(/\n\s*\n|(?=^\s*[-*•]\s+)/gm);
  const rows: NeutralBestPracticeRow[] = [];
  let section = format;
  for (const rawChunk of chunks) {
    const chunk = rawChunk.trim();
    if (!chunk) continue;
    if (/^#{1,6}\s+/.test(chunk) || (chunk.length < 100 && !/[.!?]$/.test(chunk) && !/^[-*•\d]/.test(chunk))) {
      section = chunk.replace(/^#{1,6}\s+/, '').trim();
      continue;
    }
    const description = chunk.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/\s+/g, ' ').trim();
    if (description.length < 12) continue;
    rows.push({ source: section, row: rows.length + 1, description, pageArea: null, outcome: null });
  }
  return { rows, sections: [...new Set(rows.map((row) => row.source))], format };
}

export async function parseBestPracticeDocument(input: {
  fileName: string;
  mimeType?: string;
  buffer: Buffer;
}): Promise<ParsedBestPracticeDocument> {
  const extension = input.fileName.toLowerCase().split('.').pop();
  if (extension === 'xlsx') return parseWorkbook(input.buffer);
  if (extension === 'csv') return parseCsvDocument(input.buffer.toString('utf8'));
  if (extension === 'json') return parseJsonDocument(input.buffer.toString('utf8'));
  if (extension === 'txt' || extension === 'md' || extension === 'markdown') {
    return parseTextDocument(input.buffer.toString('utf8'), extension.toUpperCase());
  }
  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ buffer: input.buffer });
    return parseTextDocument(result.value, 'DOCX');
  }
  if (extension === 'pdf') {
    const parser = new PDFParse({ data: input.buffer });
    try {
      const result = await parser.getText();
      return parseTextDocument(result.text, 'PDF');
    } finally {
      await parser.destroy();
    }
  }
  throw new Error('Unsupported file type. Use XLSX, CSV, JSON, TXT, Markdown, PDF or DOCX.');
}
