import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { extractWorkbookCandidates } from '../bestPracticeImportService';

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
      .rejects.toThrow('No supported best-practice rows were found');
  });
});
