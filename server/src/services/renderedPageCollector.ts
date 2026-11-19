import { chromium, type Browser, type Page } from 'playwright';

export interface RenderedControl {
  tag: string;
  text: string;
  type: string | null;
  ariaLabel: string | null;
  width: number;
  height: number;
  visible: boolean;
  x: number;
  y: number;
}

export interface RenderedSignals {
  title: string;
  htmlLang: string | null;
  mainHeading: string | null;
  prices: string[];
  discounts: string[];
  hasProductCta: boolean;
  productCtaText: string | null;
  hasReviews: boolean;
  hasStarRating: boolean;
  hasFreeShipping: boolean;
  hasDelivery: boolean;
  hasReturns: boolean;
  hasGuarantee: boolean;
  hasStock: boolean;
  hasSubscription: boolean;
  hasPaymentMethods: boolean;
  hasInstallments: boolean;
  hasQuantityDiscount: boolean;
  hasFaq: boolean;
  hasBreadcrumbs: boolean;
  hasSearch: boolean;
  hasCartAccess: boolean;
  hasSizeGuide: boolean;
  hasQuantitySelector: boolean;
  hasSocialLinks: boolean;
  hasPolicyLinks: boolean;
  hasContactLink: boolean;
  hasBackToTop: boolean;
  videoCount: number;
  dialogCount: number;
  unlabeledFieldCount: number;
  unlabeledIconControlCount: number;
  footerText: string;
}

export interface RenderedPageEvidence {
  url: string;
  finalUrl: string;
  html: string;
  pageType: 'product' | 'collection' | 'cart' | 'checkout' | 'homepage' | 'other';
  desktop: ViewportEvidence;
  mobile: ViewportEvidence;
}

export interface ViewportEvidence {
  visibleText: string;
  controls: RenderedControl[];
  headings: Array<{ level: number; text: string }>;
  imageCount: number;
  imagesMissingAlt: number;
  formCount: number;
  formFieldCount: number;
  linkCount: number;
  screenshotBase64: string;
  signals?: RenderedSignals;
}

function detectPageType(url: string, text: string): RenderedPageEvidence['pageType'] {
  const path = new URL(url).pathname.toLowerCase();
  if (/\/products?\//.test(path) || /add to (cart|bag)/i.test(text)) return 'product';
  if (/\/collections?\//.test(path)) return 'collection';
  if (/\/checkouts?/.test(path)) return 'checkout';
  if (/\/cart/.test(path)) return 'cart';
  if (path === '/' || path === '') return 'homepage';
  return 'other';
}

async function exploreSafeStates(page: Page): Promise<void> {
  const candidates = page.locator([
    'summary',
    'button[aria-expanded="false"]',
    '[role="button"][aria-expanded="false"]',
    'label:has-text("Subscribe")',
    'label:has-text("One-time")',
  ].join(','));
  const count = Math.min(await candidates.count(), 12);
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    const text = (await candidate.innerText().catch(() => '')).trim().toLowerCase();
    if (/add to|buy now|checkout|place order|pay now/.test(text)) continue;
    if (!await candidate.isVisible().catch(() => false)) continue;
    await candidate.click({ timeout: 800 }).catch(() => undefined);
    await page.waitForTimeout(80);
  }
}

async function collectViewport(page: Page): Promise<ViewportEvidence> {
  await exploreSafeStates(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  const evidence = await page.evaluate(() => {
    const isVisible = (element: Element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const controlElements = [...document.querySelectorAll('button, a, input, select, textarea, [role="button"]')]
      .filter(isVisible)
      .slice(0, 180);
    return {
      visibleText: (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 30000),
      controls: controlElements.map((element) => {
        const rect = element.getBoundingClientRect();
        const input = element as HTMLInputElement;
        return {
          tag: element.tagName.toLowerCase(),
          text: (element.textContent || input.value || '').replace(/\s+/g, ' ').trim().slice(0, 160),
          type: input.type || null,
          ariaLabel: element.getAttribute('aria-label'),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          visible: true,
          x: Math.round(rect.x),
          y: Math.round(rect.y + window.scrollY),
        };
      }),
      headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
        .filter(isVisible)
        .slice(0, 80)
        .map((heading) => ({ level: Number(heading.tagName[1]), text: (heading.textContent ?? '').trim().slice(0, 180) })),
      imageCount: document.images.length,
      imagesMissingAlt: [...document.images].filter((image) => !image.hasAttribute('alt')).length,
      formCount: document.forms.length,
      formFieldCount: document.querySelectorAll('input,select,textarea').length,
      linkCount: document.links.length,
      signals: (() => {
        const bodyText = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim();
        const lower = bodyText.toLowerCase();
        const footer = document.querySelector('footer');
        const footerText = (footer?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 5000);
        const links = [...document.querySelectorAll('a')];
        const linkText = links.map((link) => `${link.textContent ?? ''} ${link.getAttribute('aria-label') ?? ''} ${link.getAttribute('href') ?? ''}`).join(' ').toLowerCase();
        const productCta = controlElements.find((element) => /add to (cart|bag|basket)|buy now|select options/i.test((element.textContent ?? '').trim()));
        const prices = [...new Set(bodyText.match(/(?:£|\$|€)\s?\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s?(?:GBP|USD|EUR)/gi) ?? [])].slice(0, 12);
        const discounts = [...new Set(bodyText.match(/(?:save\s*)?\d{1,2}%\s*(?:off)?|(?:save|discount)\s+(?:£|\$|€)?\d+(?:[.,]\d{1,2})?/gi) ?? [])].slice(0, 12);
        const fields = [...document.querySelectorAll('input,select,textarea')];
        const hasLabel = (element: Element) => Boolean(
          element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') ||
          (element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`)) || element.closest('label'),
        );
        const iconControls = controlElements.filter((element) => !(element.textContent ?? '').trim());
        return {
          title: document.title,
          htmlLang: document.documentElement.getAttribute('lang'),
          mainHeading: document.querySelector('h1')?.textContent?.trim().slice(0, 180) ?? null,
          prices,
          discounts,
          hasProductCta: Boolean(productCta),
          productCtaText: productCta?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 180) ?? null,
          hasReviews: /reviews?|testimonials?|trusted by|customers?/.test(lower),
          hasStarRating: /\b[1-5](?:\.\d)?\s*(?:\/\s*5|stars?)|star rating|★|trustpilot/.test(lower),
          hasFreeShipping: /free (?:shipping|delivery)|shipping over|delivery over/.test(lower),
          hasDelivery: /delivery|dispatch|shipping|ships? (?:in|within)|next day/.test(lower),
          hasReturns: /returns?|refund|money back/.test(lower),
          hasGuarantee: /guarantee|warranty|money back/.test(lower),
          hasStock: /in stock|out of stock|low stock|available for .*dispatch|availability/.test(lower),
          hasSubscription: /subscri(?:be|ption)|subscribe\s*&\s*save/.test(lower),
          hasPaymentMethods: /visa|mastercard|amex|american express|paypal|apple pay|google pay|shop pay|klarna/.test(lower),
          hasInstallments: /pay in \d+|installments?|klarna|clearpay|afterpay|split (?:the )?payment/.test(lower),
          hasQuantityDiscount: /save \d+%|buy \d+.*(?:save|off)|bulk (?:save|discount)|quantity discount/.test(lower),
          hasFaq: /frequently asked|\bfaqs?\b/.test(lower),
          hasBreadcrumbs: Boolean(document.querySelector('[aria-label*="breadcrumb" i], .breadcrumb, [class*="breadcrumb"]')),
          hasSearch: Boolean(document.querySelector('input[type="search"], [role="search"], [aria-label*="search" i]')) || /search/.test(linkText),
          hasCartAccess: /cart|basket|bag/.test(linkText),
          hasSizeGuide: /size guide|what size|sizing/.test(lower),
          hasQuantitySelector: Boolean(document.querySelector('input[type="number"], [class*="quantity" i], [aria-label*="quantity" i]')),
          hasSocialLinks: /instagram|facebook|tiktok|pinterest|youtube|twitter|linkedin/.test(linkText),
          hasPolicyLinks: /privacy|terms|returns? policy|refund policy/.test(linkText),
          hasContactLink: /contact|help|support|live chat/.test(linkText),
          hasBackToTop: /back to top/.test(lower) || Boolean(document.querySelector('[aria-label*="top" i], [class*="back-to-top" i]')),
          videoCount: document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]').length,
          dialogCount: document.querySelectorAll('[role="dialog"], dialog, [aria-modal="true"]').length,
          unlabeledFieldCount: fields.filter((element) => !hasLabel(element)).length,
          unlabeledIconControlCount: iconControls.filter((element) => !element.getAttribute('aria-label') && !element.getAttribute('title')).length,
          footerText,
        };
      })(),
    };
  });
  const screenshot = await page.screenshot({ type: 'jpeg', quality: 55, fullPage: false });
  return { ...evidence, screenshotBase64: screenshot.toString('base64') };
}

async function collectInContext(browser: Browser, url: string, mobile: boolean) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    userAgent: mobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
      : undefined,
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  const result = await collectViewport(page);
  const html = mobile ? '' : await page.content();
  const finalUrl = page.url();
  await context.close();
  return { result, html, finalUrl };
}

export async function collectRenderedPage(url: string): Promise<RenderedPageEvidence> {
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await collectInContext(browser, url, false);
    const mobile = await collectInContext(browser, url, true);
    return {
      url,
      finalUrl: desktop.finalUrl,
      html: desktop.html,
      pageType: detectPageType(desktop.finalUrl, desktop.result.visibleText),
      desktop: desktop.result,
      mobile: mobile.result,
    };
  } finally {
    await browser.close();
  }
}
