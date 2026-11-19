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
    expect(features.formFieldCount).toBe(2);
    expect(features.formPurpose).toBe('conversion');
    expect(features.navLinkCount).toBe(2);
    expect(features.contactInfoPresent).toBe(true);
    expect(features.testimonialKeywordsPresent).toBe(true);
    expect(features.faqKeywordsPresent).toBe(true);
    expect(features.pageRiskReductionCues).toEqual(expect.arrayContaining(['free', 'trial']));
    expect(features.wordCount).toBeGreaterThan(10);
  });

  it('detects page-level guarantees outside CTA copy', () => {
    const html = `
      <html><body><main>
        <h1>Coffee</h1>
        <button>Add to cart</button>
        <p>Our Taste Guarantee: if you do not love it, we offer a replacement or your money back.</p>
      </main></body></html>
    `;

    const features = extractFeaturesFromHtml(html, 'https://shop.test/products/coffee');

    expect(features.ctaAnalysis.riskReductionCues).toEqual([]);
    expect(features.pageRiskReductionCues).toEqual(expect.arrayContaining(['guarantee', 'money back']));
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
    expect(ctaAnalysis.primaryCtaText).toBe('Buy now');
    expect(ctaAnalysis.primaryCtaType).toBe('action');
    expect(ctaAnalysis.primaryCommitmentLevel).toBe('high');
    expect(ctaAnalysis.riskReductionCues).toEqual(expect.arrayContaining(['free', 'trial']));
  });

  it('prefers Shopify purchase CTAs over navigation and records promotions separately', () => {
    const html = `
      <html>
        <body>
          <div class="announcement-bar promo-banner">
            Summer sale: save 20%
            <a href="/sale">Shop the offer</a>
          </div>
          <header>
            <nav><a href="/collections/all">Shop By Category</a></nav>
          </header>
          <main>
            <h1>Origin hoodie</h1>
            <form method="post" action="/cart/add" class="product-form" data-product-form>
              <input type="hidden" name="form_type" value="product" />
              <select name="id"><option>Small</option></select>
              <button type="submit">Add to Bag</button>
            </form>
          </main>
        </body>
      </html>
    `;

    const features = extractFeaturesFromHtml(html, 'https://shop.test/products/hoodie');

    expect(features.primaryCtaText).toBe('Add to Bag');
    expect(features.ctaAnalysis.ctaTexts).toEqual(['Add to Bag']);
    expect(features.promotionPresent).toBe(true);
    expect(features.promotionOfferPresent).toBe(true);
    expect(features.promotionalCtaTexts).toEqual(['Shop the offer']);
    expect(features.formPresent).toBe(true);
    expect(features.formFieldCount).toBe(1);
    expect(features.formPurpose).toBe('product');
  });

  it('does not combine navigation, localization, newsletter, and product forms', () => {
    const html = `
      <html>
        <body>
          <header>
            <form class="localization-form">
              <input type="hidden" name="country" />
              <button>United Kingdom</button>
            </form>
          </header>
          <main>
            <form action="/cart/add" class="product-form">
              <input type="hidden" name="product-id" />
              <select name="variant"><option>Medium</option></select>
              <button type="submit">Add to Cart</button>
            </form>
          </main>
          <footer>
            <form action="/contact#newsletter"><input type="email" /><button>Subscribe</button></form>
          </footer>
        </body>
      </html>
    `;

    const features = extractFeaturesFromHtml(html, 'https://shop.test/products/item');

    expect(features.formPresent).toBe(true);
    expect(features.formFieldCount).toBe(1);
    expect(features.formPurpose).toBe('product');
    expect(features.primaryCtaText).toBe('Add to Cart');
  });
});
