import { describe, expect, it } from 'vitest';
import { parseBestPracticeDocument } from '../bestPracticeDocumentParser';

describe('bestPracticeDocumentParser', () => {
  it('parses CSV using flexible criterion headers', async () => {
    const parsed = await parseBestPracticeDocument({
      fileName: 'research.csv',
      buffer: Buffer.from('Scope,Check,Rationale\nProduct page,"Show delivery dates near the CTA",Reduces uncertainty'),
    });
    expect(parsed.rows[0]).toMatchObject({
      pageArea: 'Product page',
      description: 'Show delivery dates near the CTA',
      rationale: 'Reduces uncertainty',
    });
  });

  it('parses criteria arrays from JSON', async () => {
    const parsed = await parseBestPracticeDocument({
      fileName: 'research.json',
      buffer: Buffer.from(JSON.stringify({ criteria: [{ criterion: 'Display returns information before checkout', page: 'Cart' }] })),
    });
    expect(parsed.rows[0]).toMatchObject({ description: 'Display returns information before checkout', pageArea: 'Cart' });
  });

  it('parses prose bullets from Markdown', async () => {
    const parsed = await parseBestPracticeDocument({
      fileName: 'research.md',
      buffer: Buffer.from('# Product page\n\n- Show a clear add-to-cart action beside the price.\n\n- Explain delivery expectations before purchase.'),
    });
    expect(parsed.rows.map((row) => row.description)).toEqual([
      'Show a clear add-to-cart action beside the price.',
      'Explain delivery expectations before purchase.',
    ]);
  });

  it('keeps detailed rationale and sub-bullets attached to numbered PDF-style checks', async () => {
    const parsed = await parseBestPracticeDocument({
      fileName: 'audit.txt',
      buffer: Buffer.from('58. Can shoppers switch between grid and list views?\n\nDifferent layouts support different shopping needs.\n\n✓ Easy toggle between formats\n✓ Consistent information\n\n59. Are category descriptions helpful?\n\nDescriptions should explain the range.'),
    });
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].description).toContain('Easy toggle between formats');
    expect(parsed.rows[0].description).not.toContain('59.');
  });
});
