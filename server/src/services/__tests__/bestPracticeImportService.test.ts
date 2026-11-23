import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { extractDocumentCandidates, extractWorkbookCandidates } from '../bestPracticeImportService';

describe('bestPracticeImportService', () => {
  it('extracts Cake-shaped sheets and merges repeated practices into one criterion', async () => {
    const workbook = new ExcelJS.Workbook();
    const headers = [
      'Evaluation', 'Metric', 'Where?', 'Description', 'Why is it important?', 'Notes',
      'Screenshot', 'Example', 'Included in Cake theme', 'Custom work required',
      'Integration required', 'Client responsibility',
    ];
    const atc = workbook.addWorksheet('Increase ATC %');
    atc.addRow(headers);
    atc.addRow(['', 'Increase ATC %', 'Product page', 'Delivery costs are clear near the CTA', 'Reduces uncertainty', '', '', 'https://example.com', 1, 0, 0, 0]);
    const conversion = workbook.addWorksheet('Increase Conversion %');
    conversion.addRow(headers);
    conversion.addRow(['', 'Increase Conversion %', 'Product page', 'Delivery costs are clear near the CTA', 'Reduces uncertainty', '', '', '', 1, 0, 0, 0]);

    const bytes = await workbook.xlsx.writeBuffer();
    const extraction = await extractWorkbookCandidates(Buffer.from(bytes));

    expect(extraction).toMatchObject({
      rowsFound: 2,
      uniqueCriteria: 1,
      duplicateRows: 1,
      sheetsProcessed: ['Increase ATC %', 'Increase Conversion %'],
    });
    expect(extraction.candidates[0].proposedCriterion).toMatchObject({
      description: 'Delivery costs are clear near the CTA',
      pageAreas: ['Product page'],
      outcomeMappings: ['INCREASE_ATC', 'INCREASE_CONVERSION'],
    });
  });

  it('rejects workbooks without supported criteria sheets', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Random data').addRow(['Something else']);
    const bytes = await workbook.xlsx.writeBuffer();

    await expect(extractWorkbookCandidates(Buffer.from(bytes)))
      .rejects.toThrow('No recognisable best-practice checks were found');
  });

  it('extracts a generic spreadsheet without Cake sheet names or fixed columns', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('UX research');
    sheet.addRow(['Page type', 'Best practice', 'Why', 'Category']);
    sheet.addRow(['Product page', 'Show delivery timing beside the purchase action', 'Reduces uncertainty', 'Conversion']);
    const bytes = await workbook.xlsx.writeBuffer();

    const extraction = await extractWorkbookCandidates(Buffer.from(bytes));

    expect(extraction.candidates[0].proposedCriterion).toMatchObject({
      description: 'Show delivery timing beside the purchase action',
      rationale: 'Reduces uncertainty',
      pageAreas: ['Product page'],
      outcomeMappings: ['INCREASE_CONVERSION'],
    });
  });

  it('merges short checklist questions with their expanded versions and removes document prose', async () => {
    const extraction = await extractDocumentCandidates({
      fileName: 'audit.txt',
      buffer: Buffer.from([
        'Ecommerce optimization guide and introduction text that is not a criterion.',
        '1. Are delivery dates clearly shown?',
        '2. Can shoppers edit cart quantities?',
        '1. Are delivery dates clearly shown?\n\nShowing timing before purchase reduces uncertainty.\n✓ State a specific dispatch estimate.',
        '2. Can shoppers edit cart quantities?\n\nProvide visible increase, decrease and remove controls.',
      ].join('\n\n')),
    });

    expect(extraction).toMatchObject({ rowsFound: 5, uniqueCriteria: 2, duplicateRows: 2, skippedRows: 1 });
    expect(extraction.candidates[0].proposedCriterion).toMatchObject({
      title: 'Are delivery dates clearly shown?',
    });
    expect(JSON.stringify(extraction.candidates[0].proposedCriterion)).toContain('specific dispatch estimate');
  });
});
