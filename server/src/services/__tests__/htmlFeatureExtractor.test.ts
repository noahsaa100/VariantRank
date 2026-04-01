import { describe, expect, it } from 'vitest';
import { extractFeaturesFromHtml } from '../htmlFeatureExtractor';

describe('htmlFeatureExtractor', () => {
  it('extracts key structural and trust features from HTML', () => {
    const html = `
      <html>
        <head>
          <title>Acme Growth Platform</title>
          <meta name="description" content="Grow pipeline faster" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </head>
        <body>
          <nav>
            <a href="/pricing">Pricing</a>
            <a href="/about">About</a>
          </nav>
          <h1>Increase qualified pipeline</h1>
          <h2>Trusted by teams</h2>
          <p>Start free trial today and cancel anytime.</p>
          <p>Contact us at team@acme.test. Read customer testimonials and FAQ.</p>
          <button>Start free trial</button>
          <form>
            <input name="email" />
            <input name="company" />
            <button type="submit">Request demo</button>
          </form>
        </body>
      </html>
    `;

    const features = extractFeaturesFromHtml(html, 'https://acme.test');

    expect(features.httpsPresent).toBe(true);
    expect(features.titlePresent).toBe(true);
    expect(features.metaDescriptionPresent).toBe(true);
    expect(features.viewportMetaPresent).toBe(true);
    expect(features.h1Count).toBe(1);
    expect(features.headingCount).toBe(2);
    expect(features.formPresent).toBe(true);
    expect(features.formFieldCount).toBe(3);
    expect(features.navLinkCount).toBe(2);
    expect(features.contactInfoPresent).toBe(true);
    expect(features.testimonialKeywordsPresent).toBe(true);
    expect(features.faqKeywordsPresent).toBe(true);
    expect(features.wordCount).toBeGreaterThan(10);
  });

  it('classifies CTA intent and commitment using rules', () => {
    const html = `
      <html>
        <body>
          <button>Start free trial</button>
          <a href="/learn">Learn more</a>
          <button>Buy now</button>
        </body>
      </html>
    `;

    const features = extractFeaturesFromHtml(html, 'https://example.test');
    const { ctaAnalysis } = features;

    expect(ctaAnalysis.ctaTexts).toEqual(['Start free trial', 'Learn more', 'Buy now']);
    expect(ctaAnalysis.actionCtaCount).toBe(2);
    expect(ctaAnalysis.informationalCtaCount).toBe(0);
    expect(ctaAnalysis.mixedCtaCount).toBe(1);
    expect(ctaAnalysis.primaryCtaType).toBe('action');
    expect(ctaAnalysis.primaryCommitmentLevel).toBe('medium');
    expect(ctaAnalysis.riskReductionCues).toEqual(expect.arrayContaining(['free', 'trial']));
  });
});
