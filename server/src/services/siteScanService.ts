import { chromium, type BrowserContextOptions, type Page } from 'playwright';
import { CRITERION_GOAL_PROFILES } from '../config/criterionGoalProfiles';
import type { GoalKey } from '../config/goals';

export type ScanStorageState = Exclude<BrowserContextOptions['storageState'], string | undefined>;

export interface SiteScanPlan {
  rootUrl: string;
  pages: Array<{ url: string; expectedType: string; source: string }>;
  storageState?: ScanStorageState;
  shopperFlow: {
    productUrl: string | null;
    addedToCart: boolean;
    cartUrl: string | null;
    checkoutUrl: string | null;
    stoppedAtCheckoutEntry: boolean;
    notes: string[];
  };
}

const MAX_DISCOVERED_LINKS = 300;
const MAX_PAGES = 5;

function normalizeRoot(input: string): string {
  const parsed = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  parsed.hash = '';
  return parsed.toString();
}

function sameSite(candidate: URL, root: URL): boolean {
  return candidate.hostname === root.hostname || candidate.hostname.endsWith(`.${root.hostname}`);
}

function classifyUrl(url: string): string {
  const path = new URL(url).pathname.toLowerCase();
  if (/\/checkouts?\b/.test(path)) return 'checkout';
  if (/\/cart\b|\/basket\b/.test(path)) return 'cart';
  if (/\/products?\//.test(path)) return 'product';
  if (/\/collections?\/|\/product-category\/|\/categories?\//.test(path)) return 'collection';
  if (/\/search\b/.test(path)) return 'search';
  if (/return|refund|shipping|delivery|contact|help|faq|privacy|terms/.test(path)) return 'policy';
  if (path === '/' || path === '') return 'homepage';
  return 'other';
}

async function linksFromPage(page: Page, root: URL): Promise<string[]> {
  return page.locator('a[href]').evaluateAll((anchors, rootHref) => {
    const rootUrl = new URL(rootHref as string);
    return [...new Set(anchors.flatMap((anchor) => {
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) return [];
      try {
        const candidate = new URL(href, rootUrl);
        candidate.hash = '';
        return candidate.protocol.startsWith('http') ? [candidate.toString()] : [];
      } catch {
        return [];
      }
    }))];
  }, root.toString());
}

function firstByType(urls: string[], type: string): string | null {
  return urls.find((url) => classifyUrl(url) === type) ?? null;
}

async function selectProductOptions(page: Page): Promise<void> {
  const selects = page.locator('form select:visible, [class*="product" i] select:visible');
  for (let index = 0; index < Math.min(await selects.count(), 5); index += 1) {
    const select = selects.nth(index);
    const options = await select.locator('option:not([disabled])').evaluateAll((items) => items.map((item) => ({
      value: (item as HTMLOptionElement).value,
      text: item.textContent?.trim() ?? '',
    })));
    const choice = options.find((option) => option.value && !/choose|select|unavailable|sold out/i.test(option.text));
    if (choice) await select.selectOption(choice.value).catch(() => undefined);
  }

  const groups = page.locator('[role="radiogroup"], fieldset, [class*="variant" i], [data-option]');
  for (let index = 0; index < Math.min(await groups.count(), 5); index += 1) {
    const option = groups.nth(index).locator('input[type="radio"]:not([disabled]), [role="radio"]:not([aria-disabled="true"]), button:not([disabled])').first();
    if (await option.isVisible().catch(() => false)) await option.click({ timeout: 1000 }).catch(() => undefined);
  }

  const oneTime = page.getByText(/one[- ]time purchase|buy once/i).first();
  if (await oneTime.isVisible().catch(() => false)) await oneTime.click({ timeout: 1000 }).catch(() => undefined);
}

async function runShopperFlow(page: Page, productUrl: string, root: URL, notes: string[]) {
  let addedToCart = false;
  let cartUrl: string | null = null;
  let checkoutUrl: string | null = null;
  let stoppedAtCheckoutEntry = false;

  await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
  await selectProductOptions(page);

  let cta = page.getByRole('button', { name: /add to (cart|bag|basket)|select options/i }).first();
  if (!await cta.isVisible().catch(() => false)) {
    cartUrl = new URL('/cart', root).toString();
    notes.push('A confident Add to cart/bag/basket control was not found; the known cart route was captured without adding an item.');
    return { addedToCart, cartUrl, checkoutUrl, stoppedAtCheckoutEntry };
  }
  let ctaText = (await cta.innerText().catch(() => '')).trim();
  if (!/add to (cart|bag|basket)/i.test(ctaText)) {
    await cta.click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    await selectProductOptions(page);
    cta = page.getByRole('button', { name: /add to (cart|bag|basket)/i }).first();
    ctaText = (await cta.innerText().catch(() => '')).trim();
    if (!await cta.isVisible().catch(() => false) || !/add to (cart|bag|basket)/i.test(ctaText)) {
      cartUrl = new URL('/cart', root).toString();
      notes.push(`The product still required options (${ctaText || 'unknown CTA'}); the known cart route was captured without adding an item.`);
      return { addedToCart, cartUrl, checkoutUrl, stoppedAtCheckoutEntry };
    }
  }

  const beforeCount = await page.locator('[class*="cart-count" i], [data-cart-count], [aria-label*="cart" i]').first().textContent().catch(() => null);
  await cta.click({ timeout: 3000 });
  await page.waitForTimeout(1200);
  const afterCount = await page.locator('[class*="cart-count" i], [data-cart-count], [aria-label*="cart" i]').first().textContent().catch(() => null);
  addedToCart = beforeCount !== afterCount || await page.getByText(/added to (cart|bag|basket)|view (cart|bag|basket)/i).first().isVisible().catch(() => false);
  if (!addedToCart) notes.push('The Add to cart action was clicked, but success could not be independently confirmed.');

  const cartLink = page.locator('a[href*="/cart"], a[href*="/basket"]').first();
  const cartHref = await cartLink.getAttribute('href').catch(() => null);
  cartUrl = cartHref ? new URL(cartHref, page.url()).toString() : new URL('/cart', root).toString();
  await page.goto(cartUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
  cartUrl = page.url();

  const checkout = page.getByRole('button', { name: /^checkout$|secure checkout|proceed to checkout/i }).first()
    .or(page.locator('a[href*="/checkout"], a[href*="/checkouts"]').first());
  if (!await checkout.isVisible().catch(() => false)) {
    notes.push('Cart was reached but no confident checkout control was found.');
    return { addedToCart, cartUrl, checkoutUrl, stoppedAtCheckoutEntry };
  }
  await Promise.all([
    page.waitForURL(/checkout|checkouts/i, { timeout: 15000 }).catch(() => undefined),
    checkout.click({ timeout: 3000 }),
  ]);
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => undefined);
  checkoutUrl = page.url();
  stoppedAtCheckoutEntry = /checkout|checkouts/i.test(checkoutUrl);
  notes.push(stoppedAtCheckoutEntry
    ? 'Stopped read-only on the first checkout page; no fields were completed and nothing was submitted.'
    : 'The checkout control did not reach a recognisable first checkout page.');
  return { addedToCart, cartUrl, checkoutUrl, stoppedAtCheckoutEntry };
}

export async function planFullSiteScan(inputUrl: string, goalKey: GoalKey = 'directPurchase'): Promise<SiteScanPlan> {
  const rootUrl = normalizeRoot(inputUrl);
  const root = new URL(rootUrl);
  const notes: string[] = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  // A hard network guard prevents accidental order/payment completion even if a selector is wrong.
  await context.route(/\/(?:orders?|payments?|complete|thank[_-]?you)(?:\/|\?|$)/i, async (route) => {
    if (route.request().method() === 'GET') await route.continue();
    else await route.abort('blockedbyclient');
  });

  try {
    await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
    const discovered = (await linksFromPage(page, root))
      .filter((url) => sameSite(new URL(url), root))
      .slice(0, MAX_DISCOVERED_LINKS);
    const goalProfile = CRITERION_GOAL_PROFILES[goalKey];
    const goalLink = page.locator('a[href]').filter({ hasText: goalProfile.actionPattern }).first();
    const goalHref = await goalLink.getAttribute('href').catch(() => null);
    const goalUrl = goalHref ? new URL(goalHref, root).toString() : null;
    const collectionUrl = firstByType(discovered, 'collection');
    let productUrl = firstByType(discovered, 'product');
    if (collectionUrl) {
      await page.goto(collectionUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);
      const collectionLinks = await linksFromPage(page, root);
      productUrl = firstByType(collectionLinks.filter((url) => sameSite(new URL(url), root)), 'product')
        ?? productUrl;
    }

    const selected = [
      { url: rootUrl, expectedType: 'homepage', source: 'submitted root URL' },
      goalUrl && sameSite(new URL(goalUrl), root)
        ? { url: goalUrl, expectedType: classifyUrl(goalUrl), source: `${goalProfile.label} goal discovery` }
        : null,
      collectionUrl ? { url: collectionUrl, expectedType: 'collection', source: 'navigation discovery' } : null,
      productUrl ? { url: productUrl, expectedType: 'product', source: 'product discovery' } : null,
      firstByType(discovered, 'search') ? { url: firstByType(discovered, 'search')!, expectedType: 'search', source: 'navigation discovery' } : null,
      ...discovered.filter((url) => classifyUrl(url) === 'policy').slice(0, 1).map((url) => ({ url, expectedType: 'policy', source: 'policy discovery' })),
    ].filter((item): item is { url: string; expectedType: string; source: string } => Boolean(item));

    const flow = goalKey === 'directPurchase' && productUrl
      ? await runShopperFlow(page, productUrl, root, notes)
      : { addedToCart: false, cartUrl: null, checkoutUrl: null, stoppedAtCheckoutEntry: false };
    if (goalKey === 'directPurchase' && !productUrl) notes.push('No representative product URL could be discovered.');
    if (goalKey !== 'directPurchase') notes.push(goalUrl
      ? `Discovered a route matching the selected goal (${goalProfile.label}); no form was submitted.`
      : `No route matching the selected goal (${goalProfile.label}) was found from the homepage.`);
    if (flow.cartUrl) selected.push({ url: flow.cartUrl, expectedType: 'cart', source: 'isolated shopper flow' });
    if (flow.checkoutUrl && flow.stoppedAtCheckoutEntry) selected.push({ url: flow.checkoutUrl, expectedType: 'checkout', source: 'isolated shopper flow' });

    const priority = ['homepage', 'collection', 'product', 'cart', 'checkout', 'search', 'policy'];
    const uniquePages = [...new Map(selected.map((item) => [item.url, item])).values()]
      .sort((a, b) => priority.indexOf(a.expectedType) - priority.indexOf(b.expectedType))
      .slice(0, MAX_PAGES);
    const storageState = await context.storageState();
    return {
      rootUrl,
      pages: uniquePages,
      storageState,
      shopperFlow: { productUrl, ...flow, notes },
    };
  } finally {
    await context.close();
    await browser.close();
  }
}
