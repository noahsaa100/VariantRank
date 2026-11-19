import type {
  CriterionEvaluationMethod,
  CriterionEvaluationStatus,
  ScoreCategoryKey,
} from '@prisma/client';
import { evaluateCriteriaWithAi } from './aiAssistService';
import { calculateCriterionScores } from './criterionScoringService';
import type { RenderedPageEvidence } from './renderedPageCollector';

export interface ActiveCriterion {
  id: string;
  title: string;
  description: string;
  rationale: string | null;
  pageAreas: string[];
  importanceWeight: number;
  defaultMethod: CriterionEvaluationMethod;
  categoryMappings: Array<{ category: ScoreCategoryKey; weight: number; isPrimary: boolean }>;
}

export interface EvaluatedCriterion {
  criterionId: string;
  status: CriterionEvaluationStatus;
  method: CriterionEvaluationMethod;
  evidence: { summary: string; pageType: string };
  explanation: string;
  confidence: number;
  scoreImpact: { categories: string[] };
}

const PAGE_AREA_BY_TYPE: Record<RenderedPageEvidence['pageType'], string[]> = {
  product: ['product page', 'sitewide', 'navigation'],
  collection: ['product listing page', 'sitewide', 'navigation'],
  cart: ['cart / cart drawer', 'sitewide', 'navigation'],
  checkout: ['checkout', 'sitewide'],
  homepage: ['homepage', 'sitewide', 'navigation'],
  other: ['sitewide', 'navigation'],
};

export function selectApplicableCriteria(criteria: ActiveCriterion[], pageType: RenderedPageEvidence['pageType']) {
  const areas = PAGE_AREA_BY_TYPE[pageType];
  return criteria.filter((criterion) => criterion.pageAreas.some((area) => areas.includes(area.toLowerCase())));
}

function deterministicVerdict(criterion: ActiveCriterion, page: RenderedPageEvidence): EvaluatedCriterion | null {
  const text = criterion.description.toLowerCase();
  const desktop = page.desktop;
  const mobile = page.mobile;
  const categories = criterion.categoryMappings.map((mapping) => mapping.category);
  const signals = desktop.signals;
  const combinedText = `${desktop.visibleText} ${mobile.visibleText}`.toLowerCase();
  const result = (status: CriterionEvaluationStatus, summary: string, confidence = 0.95): EvaluatedCriterion => ({
    criterionId: criterion.id,
    status,
    method: 'AUTOMATED',
    evidence: { summary, pageType: page.pageType },
    explanation: summary,
    confidence,
    scoreImpact: { categories },
  });

  if (/every image has descriptive alt text|images? (has|have) descriptive alt/.test(text)) {
    const total = Math.max(desktop.imageCount, mobile.imageCount);
    const missing = Math.max(desktop.imagesMissingAlt, mobile.imagesMissingAlt);
    if (total === 0) return result('NOT_RELEVANT', 'No images were present on the captured page.');
    if (missing === 0) return result('GOOD', `All ${total} captured images include an alt attribute.`);
    const ratio = missing / total;
    return result(ratio <= 0.15 ? 'CAN_BE_IMPROVED' : 'BAD', `${missing} of ${total} captured images are missing alt attributes.`);
  }

  if (/50px touchpoint|touch target|space stylistically around action points/.test(text)) {
    const controls = mobile.controls.filter((control) => control.visible);
    const undersized = controls.filter((control) => control.width < 44 || control.height < 44).length;
    if (controls.length === 0) return result('BAD', 'No visible mobile controls were detected.');
    if (undersized === 0) return result('GOOD', `All ${controls.length} captured mobile controls are at least 44px in both dimensions.`);
    const ratio = undersized / controls.length;
    return result(ratio <= 0.2 ? 'CAN_BE_IMPROVED' : 'BAD', `${undersized} of ${controls.length} visible mobile controls are under 44px.`);
  }

  if (/every page has a cta|cta.*descriptive|add to cart/.test(text) && criterion.pageAreas.some((area) => area.toLowerCase() === 'sitewide')) {
    const actions = desktop.controls.filter((control) => control.tag === 'button' && control.text.trim());
    const primary = actions.find((control) => /add to (cart|bag|basket)|buy now|select options/i.test(control.text))
      ?? [...actions].sort((a, b) => a.text.length - b.text.length)[0];
    return actions.length > 0
      ? result('GOOD', `${actions.length} visible labelled buttons were captured${primary ? `, including “${primary.text}”` : ''}.`, 0.85)
      : result('BAD', 'No visible labelled button was captured.', 0.85);
  }

  if (/form inputs?.*label|fields?.*label/.test(text)) {
    const unnamed = desktop.controls.filter((control) => ['input', 'select', 'textarea'].includes(control.tag) && !control.ariaLabel && !control.text).length;
    if (desktop.formFieldCount === 0) return result('NOT_RELEVANT', 'No form fields were captured.');
    return unnamed === 0
      ? result('GOOD', `All ${desktop.formFieldCount} captured form fields expose a label or value.`)
      : result('CAN_BE_IMPROVED', `${unnamed} captured form fields lack an accessible label/value.`);
  }

  if (!signals) return null;

  const presence = (present: boolean, good: string, bad: string, confidence = 0.9) =>
    result(present ? 'GOOD' : 'BAD', present ? good : bad, confidence);
  const conditionalPresence = (relevant: boolean, present: boolean, good: string, bad: string) =>
    relevant ? presence(present, good, bad) : result('NOT_RELEVANT', 'No relevant condition was detected on this page.');

  if (/document has a <title>|product titles should be accurate|product title/.test(text) && !/top of the page/.test(text)) {
    const title = signals.mainHeading || signals.title;
    if (!title) return result('BAD', 'No product title or primary heading was detected.');
    return result(title.length <= 65 ? 'GOOD' : 'CAN_BE_IMPROVED', `The detected product title is “${title}” (${title.length} characters).`);
  }
  if (/<html> element has a valid \[lang\]|correct lang attribute/.test(text)) {
    return presence(Boolean(signals.htmlLang), `The document language is set to “${signals.htmlLang}”.`, 'The document does not expose a language attribute.');
  }
  if (/star rating should be near|customer reviews|product reviews|reviews should stand out/.test(text)) {
    return presence(signals.hasReviews || signals.hasStarRating, 'Review or rating evidence is present on the rendered product page.', 'No customer-review or star-rating evidence was detected.');
  }
  if (/shipping and return|delivery & returns|questions answered|live chat/.test(text)) {
    const count = [signals.hasDelivery, signals.hasReturns, signals.hasFaq, signals.hasContactLink].filter(Boolean).length;
    return result(count >= 3 ? 'GOOD' : count >= 1 ? 'CAN_BE_IMPROVED' : 'BAD', `${count} of 4 support signals were detected: delivery, returns, FAQs and contact/help.`);
  }
  if (/payment options|trust icons such as payment/.test(text)) {
    return presence(signals.hasPaymentMethods, 'Recognised payment-method evidence is visible.', 'No recognised payment-method evidence was detected.');
  }
  if (/footer contains the following links|return policy.*privacy policy|footer.*business information/.test(text)) {
    const count = [signals.hasPolicyLinks, signals.hasContactLink, /company|registered|address/i.test(signals.footerText)].filter(Boolean).length;
    return result(count >= 3 ? 'GOOD' : count >= 1 ? 'CAN_BE_IMPROVED' : 'BAD', `${count} of 3 expected footer trust/business-information groups were detected.`);
  }
  if (/free shipping threshold|free shipping over|free delivery/.test(text)) {
    return presence(signals.hasFreeShipping, 'Free-shipping or delivery-threshold messaging is present.', 'No free-shipping or delivery-threshold messaging was detected.');
  }
  if (/quantity discounts|buy 4|bulk purchases|bulk discount/.test(text)) {
    return presence(signals.hasQuantityDiscount, signals.discounts.length ? `Quantity/value savings are visible, including “${signals.discounts[0]}”.` : 'Quantity/value savings messaging is visible.', 'No quantity discount or bulk-saving evidence was detected.');
  }
  if (/pay in installments|over 3 months/.test(text)) {
    return presence(signals.hasInstallments, 'Installment-payment messaging is present.', 'No installment-payment messaging was detected.');
  }
  if (/product is in sale|sale price|showing the discount/.test(text)) {
    const relevant = signals.discounts.length > 0 || /\bsale\b|was\s*[£$€]/i.test(combinedText);
    return conditionalPresence(relevant, signals.discounts.length > 0 && signals.prices.length >= 2, `Sale evidence includes ${signals.prices.length} prices and “${signals.discounts[0]}”.`, 'Sale messaging was detected but a clear previous price, current price and saving were not all found.');
  }
  if (/availability.*price.*cta|elements should be shown at the top/.test(text)) {
    const count = [Boolean(signals.mainHeading), desktop.imageCount > 0, signals.hasStock, signals.prices.length > 0, signals.hasProductCta].filter(Boolean).length;
    return result(count >= 5 ? 'GOOD' : count >= 3 ? 'CAN_BE_IMPROVED' : 'BAD', `${count} of 5 core product-buying signals were detected: title, imagery, availability, price and purchase CTA.`);
  }
  if (/back in stock notifications/.test(text)) {
    return conditionalPresence(/out of stock|sold out/i.test(combinedText), /notify me|back in stock|email me/i.test(combinedText), 'Back-in-stock notification messaging is available.', 'An unavailable product state was detected without a visible back-in-stock notification option.');
  }
  if (/low in stock products|stock products should/.test(text)) {
    return conditionalPresence(/low stock|only \d+ left/i.test(combinedText), signals.hasStock, 'Low-stock messaging is present.', 'Low-stock context was detected without clear availability messaging.');
  }
  if (/product guide|size guide/.test(text)) {
    return presence(signals.hasSizeGuide, 'A product/size guide is present.', 'No product or size guide was detected.');
  }
  if (/quantity selectors are interactive/.test(text)) {
    return presence(signals.hasQuantitySelector, 'An interactive quantity selector is present.', 'No interactive quantity selector was detected.');
  }
  if (/cta is descriptive|main cta|every page has a cta/.test(text)) {
    const cta = signals.productCtaText;
    return presence(Boolean(cta), cta ? `A purchase CTA is present: “${cta}”.` : 'A purchase CTA is present.', 'No recognisable product-purchase CTA was detected.');
  }
  if (/user should be able to access their cart/.test(text)) {
    return presence(signals.hasCartAccess, 'Cart or bag access is available from the page.', 'No persistent cart or bag access was detected.');
  }
  if (/faq section/.test(text)) {
    return presence(signals.hasFaq, 'An FAQ section is present.', 'No FAQ section was detected.');
  }
  if (/has breadcrumbs/.test(text)) {
    return presence(signals.hasBreadcrumbs, 'Breadcrumb navigation is present.', 'No breadcrumb navigation was detected.');
  }
  if (/image gallery should be present|gallery contains product videos|product gallery contains/.test(text)) {
    if (/videos/.test(text)) return result(signals.videoCount > 0 ? 'GOOD' : 'NOT_RELEVANT', signals.videoCount > 0 ? `${signals.videoCount} product video element(s) were detected.` : 'No product video was detected; relevance requires product context.');
    return presence(desktop.imageCount >= 2, `${desktop.imageCount} images were detected, supporting a product gallery.`, 'Fewer than two product images were detected.');
  }
  if (/search is indicated|navigation includes a search/.test(text)) {
    return presence(signals.hasSearch, 'A search control is available.', 'No search control was detected.');
  }
  if (/footer includes links to social/.test(text)) {
    return presence(signals.hasSocialLinks, 'Social-network links are present in the page/footer.', 'No social-network links were detected.');
  }
  if (/footer includes links to main categories/.test(text)) {
    const footerLinks = signals.footerText.split(/\s+/).length;
    return result(footerLinks >= 12 ? 'GOOD' : footerLinks > 0 ? 'CAN_BE_IMPROVED' : 'BAD', `The captured footer contains approximately ${footerLinks} words of navigation/content.`);
  }
  if (/cookie notification bar/.test(text)) {
    const present = /cookie/i.test(combinedText);
    return result(present ? 'GOOD' : 'NOT_RELEVANT', present ? 'Cookie notice text is present in the rendered page.' : 'No cookie notice was observed in this session.');
  }
  if (/too many pop ups/.test(text)) {
    return result(signals.dialogCount <= 1 ? 'GOOD' : 'BAD', `${signals.dialogCount} dialog or modal element(s) were detected on initial load.`);
  }
  if (/static back to top/.test(text)) {
    return presence(signals.hasBackToTop, 'A back-to-top control is present.', 'No back-to-top control was detected.');
  }
  if (/visual icons are given accessible labels|icons\/components.*labelled/.test(text)) {
    return result(signals.unlabeledIconControlCount === 0 ? 'GOOD' : 'CAN_BE_IMPROVED', `${signals.unlabeledIconControlCount} visible icon-only controls lack an accessible label or title.`);
  }
  if (/read more.*click here.*accessible name/.test(text)) {
    const vague = desktop.controls.filter((control) => /^(read more|click here|more)$/i.test(control.text.trim()) && !control.ariaLabel).length;
    return result(vague === 0 ? 'GOOD' : 'CAN_BE_IMPROVED', `${vague} vague link label(s) without a more specific accessible name were detected.`);
  }
  if (/mobile touch target sizes|variant.*large enough/.test(text)) {
    const controls = mobile.controls.filter((control) => control.visible);
    const undersized = controls.filter((control) => control.width < 44 || control.height < 44).length;
    return result(undersized === 0 ? 'GOOD' : undersized / Math.max(controls.length, 1) <= 0.2 ? 'CAN_BE_IMPROVED' : 'BAD', `${undersized} of ${controls.length} mobile controls are under 44px.`);
  }

  return null;
}

export async function evaluateCriteriaForPage(criteria: ActiveCriterion[], page: RenderedPageEvidence) {
  const applicable = selectApplicableCriteria(criteria, page.pageType);
  const deterministic: EvaluatedCriterion[] = [];
  const contextual: ActiveCriterion[] = [];
  for (const criterion of applicable) {
    const verdict = deterministicVerdict(criterion, page);
    if (verdict) deterministic.push(verdict);
    else if (criterion.defaultMethod === 'MANUAL') {
      deterministic.push({
        criterionId: criterion.id,
        status: 'NEEDS_REVIEW',
        method: 'MANUAL',
        evidence: { summary: 'This check requires human judgement.', pageType: page.pageType },
        explanation: 'This check requires human judgement.',
        confidence: 1,
        scoreImpact: { categories: criterion.categoryMappings.map((mapping) => mapping.category) },
      });
    } else contextual.push(criterion);
  }

  const aiResults: EvaluatedCriterion[] = [];
  const chunkSize = 8;
  for (let index = 0; index < contextual.length; index += chunkSize) {
    const chunk = contextual.slice(index, index + chunkSize);
    const verdicts = await evaluateCriteriaWithAi({
      pageType: page.pageType,
      visibleText: `${page.desktop.visibleText}\nMOBILE:\n${page.mobile.visibleText}`,
      controls: [...page.desktop.controls, ...page.mobile.controls],
      headings: [...page.desktop.headings, ...page.mobile.headings],
      criteria: chunk.map((criterion) => ({ id: criterion.id, description: criterion.description, rationale: criterion.rationale })),
      desktopScreenshotBase64: page.desktop.screenshotBase64,
      mobileScreenshotBase64: page.mobile.screenshotBase64,
    });
    const byId = new Map(verdicts.map((verdict) => [verdict.criterionId, verdict]));
    const missing = chunk.filter((criterion) => !byId.has(criterion.id));
    for (let retryIndex = 0; retryIndex < missing.length; retryIndex += 3) {
      const retryChunk = missing.slice(retryIndex, retryIndex + 3);
      const retried = await evaluateCriteriaWithAi({
        pageType: page.pageType,
        visibleText: `${page.desktop.visibleText}\nMOBILE:\n${page.mobile.visibleText}`,
        controls: [...page.desktop.controls, ...page.mobile.controls],
        headings: [...page.desktop.headings, ...page.mobile.headings],
        criteria: retryChunk.map((criterion) => ({ id: criterion.id, description: criterion.description, rationale: criterion.rationale })),
        desktopScreenshotBase64: page.desktop.screenshotBase64,
        mobileScreenshotBase64: page.mobile.screenshotBase64,
      });
      for (const verdict of retried) byId.set(verdict.criterionId, verdict);
    }
    for (const criterion of chunk) {
      const verdict = byId.get(criterion.id);
      const summary = verdict?.evidence ?? 'No reliable rendered evidence was returned for this check; it was excluded from scoring.';
      aiResults.push({
        criterionId: criterion.id,
        status: verdict?.status ?? 'NOT_OBSERVED',
        method: 'AI_ASSISTED',
        evidence: { summary, pageType: page.pageType },
        explanation: summary,
        confidence: verdict?.confidence ?? 0,
        scoreImpact: { categories: criterion.categoryMappings.map((mapping) => mapping.category) },
      });
    }
  }

  const results = [...deterministic, ...aiResults];
  const criteriaById = new Map(applicable.map((criterion) => [criterion.id, criterion]));
  const scoreSummary = calculateCriterionScores(results.map((result) => {
    const criterion = criteriaById.get(result.criterionId)!;
    return {
      criterionId: result.criterionId,
      status: result.status,
      importanceWeight: criterion.importanceWeight,
      categoryMappings: criterion.categoryMappings,
    };
  }), {
    categoryWeights: {
      SHOPPING_UX: 20,
      TRUST_CONFIDENCE: 20,
      OFFER_CLARITY: 20,
      PURCHASE_EASE: 25,
      TECHNICAL_ACCESSIBILITY: 15,
    },
  });
  return { applicable, results, scoreSummary };
}
