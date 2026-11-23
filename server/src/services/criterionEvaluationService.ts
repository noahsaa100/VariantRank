import type {
  CriterionEvaluationMethod,
  CriterionEvaluationStatus,
  ScoreCategoryKey,
} from '@prisma/client';
import { evaluateCriteriaWithAi, type VisualPageInventory } from './aiAssistService';
import { calculateCriterionScores } from './criterionScoringService';
import type { RenderedPageEvidence } from './renderedPageCollector';
import { CRITERION_GOAL_PROFILES, criterionGoalMultiplier } from '../config/criterionGoalProfiles';
import type { GoalKey } from '../config/goals';

export interface ActiveCriterion {
  id: string;
  title: string;
  description: string;
  rationale: string | null;
  pageAreas: string[];
  importanceWeight: number;
  defaultMethod: CriterionEvaluationMethod;
  evidenceRequirements?: Record<string, unknown> | null;
  categoryMappings: Array<{ category: ScoreCategoryKey; weight: number; isPrimary: boolean }>;
}

export interface EvaluatedCriterion {
  criterionId: string;
  status: CriterionEvaluationStatus;
  method: CriterionEvaluationMethod;
  evidence: { summary: string; pageType: string };
  explanation: string;
  confidence: number;
  scoreImpact: { categories: string[]; penaltyPoints?: number };
}

const PAGE_AREA_BY_TYPE: Record<RenderedPageEvidence['pageType'], string[]> = {
  product: ['product', 'product page', 'sitewide', 'site_wide', 'navigation'],
  collection: ['collection', 'product listing page', 'sitewide', 'site_wide', 'navigation'],
  cart: ['cart', 'cart / cart drawer', 'sitewide', 'site_wide', 'navigation'],
  checkout: ['checkout', 'sitewide', 'site_wide'],
  homepage: ['home', 'homepage', 'sitewide', 'site_wide', 'navigation'],
  other: ['other', 'search', 'sitewide', 'site_wide', 'navigation'],
};

export function selectApplicableCriteria(criteria: ActiveCriterion[], pageType: RenderedPageEvidence['pageType']) {
  const areas = PAGE_AREA_BY_TYPE[pageType];
  return criteria.filter((criterion) => criterion.pageAreas.some((area) => areas.includes(area.toLowerCase())));
}

function selectVisualCaptures(page: RenderedPageEvidence, criteria: ActiveCriterion[]) {
  const captures = page.desktop.visualCaptures ?? [];
  const descriptions = criteria.map((criterion) => criterion.description).join(' ').toLowerCase();
  const preferredLabels = /payment|trust|review|footer|accreditation/.test(descriptions)
    ? ['payment and trust area', 'footer']
    : /cta|price|variant|product|offer|shipping|stock/.test(descriptions)
      ? ['purchase area']
      : [];
  const preferred = captures.filter((capture) => preferredLabels.includes(capture.label));
  const coverage = captures.filter((capture) => capture.label.startsWith('page segment'));
  return [...preferred, ...coverage].slice(0, 4);
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

  // Imported rows often carry "sitewide" as a secondary area even when their
  // wording is explicitly product-specific. Never let those checks penalise
  // unrelated homepage, collection, cart or checkout views.
  const explicitlySitewide = /every page|sitewide/.test(text);
  const productOnly = !explicitlySitewide && /product (?:page|title|image|gallery|price|review)|customer reviews?|star rating|add to (?:cart|bag|basket)|variants?|size guide|quantity selector|back in stock|low in stock/.test(text);
  if (productOnly && page.pageType !== 'product') {
    return result('NOT_RELEVANT', `This product-page check is not applicable to the ${page.pageType} page.`);
  }

  if (/every image has descriptive alt text|images? (has|have) descriptive alt/.test(text)) {
    const total = Math.max(desktop.imageCount, mobile.imageCount);
    const missing = Math.max(desktop.imagesMissingAlt, mobile.imagesMissingAlt);
    if (total === 0) return result('NOT_RELEVANT', 'No images were present on the captured page.');
    if (missing === 0) return result('GOOD', `All ${total} captured images include an alt attribute.`);
    const ratio = missing / total;
    return result(ratio <= 0.15 ? 'CAN_BE_IMPROVED' : 'BAD', `${missing} of ${total} captured images are missing alt attributes.`);
  }

  if (/50px touchpoint|touch target|space stylistically around action points/.test(text)) {
    const controls = mobile.controls.filter((control) => {
      if (!control.visible) return false;
      if (/variant/.test(text)) return control.region === 'variant' || control.region === 'purchase';
      return ['button', 'input', 'select', 'textarea'].includes(control.tag)
        && control.region !== 'navigation'
        && control.region !== 'footer';
    });
    const belowRecommended = controls.filter((control) => control.width < 44 || control.height < 44).length;
    const belowMinimum = controls.filter((control) => control.width < 24 || control.height < 24).length;
    if (controls.length === 0) return result('NOT_OBSERVED', 'No controls in the criterion-specific region were captured reliably.', 0);
    if (belowMinimum > 1 && belowMinimum / controls.length > 0.2) return result('BAD', `${belowMinimum} of ${controls.length} relevant controls are below the 24px minimum.`, 0.9);
    if (belowMinimum > 0) return result('CAN_BE_IMPROVED', `${belowMinimum} isolated control is below 24px; verify its effective clickable area before treating it as a failure.`, 0.75);
    if (belowRecommended > 0) return result('CAN_BE_IMPROVED', `${belowRecommended} of ${controls.length} controls are below the recommended 44px size but meet the 24px minimum.`, 0.9);
    return result('GOOD', `All ${controls.length} relevant mobile controls meet the recommended 44px size.`);
  }

  if (/every page has a cta|cta.*descriptive|add to cart/.test(text) && criterion.pageAreas.some((area) => area.toLowerCase() === 'sitewide')) {
    const actions = desktop.controls.filter((control) => control.tag === 'button' && control.text.trim());
    const primary = actions.find((control) => /add to (cart|bag|basket)|buy now|select options/i.test(control.text))
      ?? [...actions].sort((a, b) => a.text.length - b.text.length)[0];
    return actions.length > 0
      ? result('GOOD', `${actions.length} visible labelled buttons were captured${primary ? `, including “${primary.text}”` : ''}.`, 0.85)
      : result('NOT_OBSERVED', 'No reliable primary action was confirmed; this check is excluded from scoring.', 0);
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
    result(present ? 'GOOD' : 'BAD', present ? good : bad, present ? confidence : Math.min(confidence, 0.65));
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
    return signals.hasReviews || signals.hasStarRating
      ? result('GOOD', 'Review or rating evidence is present on the rendered product page.')
      : result('NOT_RELEVANT', 'Reviews are a valuable trust boost, but their absence is not treated as a technical failure.');
  }
  if (/shipping and return|delivery & returns|questions answered|live chat/.test(text)) {
    const count = [signals.hasDelivery, signals.hasReturns, signals.hasFaq, signals.hasContactLink].filter(Boolean).length;
    return result(count >= 3 ? 'GOOD' : 'CAN_BE_IMPROVED', `${count} of 4 support signals were detected: delivery, returns, FAQs and contact/help.`);
  }
  if (/payment options|trust icons such as payment/.test(text)) {
    if (!signals.hasPaymentMethods) return null;
    const methods = signals.paymentMethods.slice(0, 8).join(', ');
    if (/footer shows trust icons/.test(text)) {
      return result(signals.paymentIconsInFooter ? 'GOOD' : 'CAN_BE_IMPROVED', signals.paymentIconsInFooter
        ? `Payment/trust icons are present in the footer, including ${methods}.`
        : `Payment methods were detected (${methods}), but their footer placement was not confirmed.`);
    }
    return result(signals.paymentNearProductCta ? 'GOOD' : 'CAN_BE_IMPROVED', signals.paymentNearProductCta
      ? `Payment options are displayed near/below the purchase CTA, including ${methods}.`
      : `Payment methods were detected (${methods}), but placement underneath the CTA was not confirmed.`);
  }
  if (/footer contains the following links|return policy.*privacy policy|footer.*business information/.test(text)) {
    const count = [signals.hasPolicyLinks, signals.hasContactLink, /company|registered|address/i.test(signals.footerText)].filter(Boolean).length;
    return result(count >= 3 ? 'GOOD' : 'CAN_BE_IMPROVED', `${count} of 3 expected footer trust/business-information groups were detected.`);
  }
  if (/free shipping threshold|free shipping over|free delivery/.test(text)) {
    return signals.hasFreeShipping
      ? result('GOOD', 'Free-shipping or delivery-threshold messaging is present.')
      : result('NOT_RELEVANT', 'Free shipping is an optional offer and its absence is not penalised.');
  }
  if (/quantity discounts|buy 4|bulk purchases|bulk discount/.test(text)) {
    return signals.hasQuantityDiscount
      ? result('GOOD', signals.discounts.length ? `Quantity/value savings are visible, including “${signals.discounts[0]}”.` : 'Quantity/value savings messaging is visible.')
      : result('NOT_RELEVANT', 'Bulk or quantity savings are optional and their absence is not penalised.');
  }
  if (/pay in installments|over 3 months/.test(text)) {
    return signals.hasInstallments
      ? result('GOOD', 'Installment-payment messaging and/or a recognised installment provider is present.')
      : null;
  }
  if (/product is in sale|sale price|showing the discount/.test(text)) {
    const clearSale = signals.prices.length >= 2 && (signals.discounts.length > 0 || signals.struckPrices.length > 0);
    if (clearSale) {
      const evidence = signals.struckPrices.length > 0
        ? `A previous price (${signals.struckPrices[0]}) is visibly crossed out alongside the current price.`
        : `Sale evidence includes ${signals.prices.length} prices and “${signals.discounts[0]}”.`;
      return result('GOOD', evidence);
    }
    // Visual themes express compare-at prices in many ways. Let the screenshot
    // evaluator inspect the purchase area whenever DOM evidence is absent or
    // incomplete instead of assuming that no sale treatment exists.
    return null;
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
    return signals.hasSizeGuide
      ? result('GOOD', 'Product size guidance is present, with sizing help exposed in the rendered page content.')
      : null;
  }
  if (/quantity selectors are interactive/.test(text)) {
    return signals.hasQuantitySelector
      ? result('GOOD', 'An interactive quantity selector is present.')
      : result('NOT_RELEVANT', 'No quantity selector is required for a fixed single-item purchase.');
  }
  if (/cta is descriptive|main cta|every page has a cta/.test(text)) {
    const controls = [...desktop.controls, ...mobile.controls].filter((control) => control.visible && control.text.trim());
    const pattern = page.pageType === 'product'
      ? /add to (?:cart|bag|basket)|buy now|select options/i
      : page.pageType === 'cart'
        ? /checkout|secure checkout|continue to checkout/i
        : /shop|view|explore|discover|learn|find|search/i;
    const cta = controls.find((control) => pattern.test(control.text))?.text
      ?? (page.pageType === 'product' ? signals.productCtaText : null);
    return cta
      ? result('GOOD', `The page provides a clear next action: “${cta}”.`)
      : result('NOT_OBSERVED', `No reliable primary action was confirmed on the ${page.pageType} page; this check is excluded from scoring.`, 0);
  }
  if (/user should be able to access their cart/.test(text)) {
    return presence(signals.hasCartAccess, 'Cart or bag access is available from the page.', 'No persistent cart or bag access was detected.');
  }
  if (/faq section/.test(text)) {
    return signals.hasFaq
      ? result('GOOD', 'An FAQ section is present.')
      : result('NOT_RELEVANT', 'An FAQ is optional on this page and its absence is not penalised.');
  }
  if (/has breadcrumbs/.test(text)) {
    if (!['product', 'collection'].includes(page.pageType)) return result('NOT_RELEVANT', `Breadcrumbs are not required on the ${page.pageType} page.`);
    return signals.hasBreadcrumbs
      ? result('GOOD', 'Breadcrumb navigation is present.')
      : result('CAN_BE_IMPROVED', 'Breadcrumb navigation could help shoppers understand their location.');
  }
  if (/image gallery should be present|gallery contains product videos|product gallery contains/.test(text)) {
    if (/videos/.test(text)) return result(signals.videoCount > 0 ? 'GOOD' : 'NOT_RELEVANT', signals.videoCount > 0 ? `${signals.videoCount} product video element(s) were detected.` : 'No product video was detected; relevance requires product context.');
    return result(desktop.imageCount >= 2 ? 'GOOD' : 'CAN_BE_IMPROVED', desktop.imageCount >= 2 ? `${desktop.imageCount} images were detected, supporting a product gallery.` : 'The product gallery contains fewer than two captured images.');
  }
  if (/search is indicated|navigation includes a search/.test(text)) {
    return result(signals.hasSearch ? 'GOOD' : 'CAN_BE_IMPROVED', signals.hasSearch ? 'A search control is available.' : 'No search control was detected reliably.');
  }
  if (/footer includes links to social/.test(text)) {
    return signals.hasSocialLinks
      ? result('GOOD', 'Social-network links are present in the page/footer.')
      : result('NOT_RELEVANT', 'Social links are optional and their absence is not penalised.');
  }
  if (/footer includes links to main categories/.test(text)) {
    const footerLinks = signals.footerText.split(/\s+/).length;
    return result(footerLinks >= 12 ? 'GOOD' : 'CAN_BE_IMPROVED', `The captured footer contains approximately ${footerLinks} words of navigation/content.`);
  }
  if (/cookie notification bar/.test(text)) {
    const present = /cookie/i.test(combinedText);
    return result(present ? 'GOOD' : 'NOT_RELEVANT', present ? 'Cookie notice text is present in the rendered page.' : 'No cookie notice was observed in this session.');
  }
  if (/too many pop ups/.test(text)) {
    return result(signals.dialogCount <= 1 ? 'GOOD' : 'BAD', `${signals.dialogCount} dialog or modal element(s) were detected on initial load.`);
  }
  if (/static back to top/.test(text)) {
    return signals.hasBackToTop
      ? result('GOOD', 'A back-to-top control helps shoppers return to the start of a long page.')
      : result('NOT_RELEVANT', 'A back-to-top control is optional and its absence is not penalised.');
  }
  if (/visual icons are given accessible labels|icons\/components.*labelled/.test(text)) {
    return result(signals.unlabeledIconControlCount === 0 ? 'GOOD' : 'CAN_BE_IMPROVED', `${signals.unlabeledIconControlCount} visible icon-only controls lack an accessible label or title.`);
  }
  if (/read more.*click here.*accessible name/.test(text)) {
    const vague = desktop.controls.filter((control) => /^(read more|click here|more)$/i.test(control.text.trim()) && !control.ariaLabel).length;
    return result(
      vague === 0 ? 'GOOD' : 'CAN_BE_IMPROVED',
      vague === 0
        ? 'Link labels clearly describe their destination or action.'
        : `${vague} vague link label(s) need a more specific accessible name.`,
    );
  }
  if (/mobile touch target sizes|variant.*large enough/.test(text)) {
    const controls = mobile.controls.filter((control) => control.visible && ['button', 'input', 'select', 'textarea'].includes(control.tag));
    const belowRecommended = controls.filter((control) => control.width < 44 || control.height < 44).length;
    const belowMinimum = controls.filter((control) => control.width < 24 || control.height < 24).length;
    if (belowMinimum > 1 && belowMinimum / Math.max(controls.length, 1) > 0.2) return result('BAD', `${belowMinimum} of ${controls.length} mobile controls are below the 24px minimum.`);
    if (belowMinimum > 0) return result('CAN_BE_IMPROVED', `${belowMinimum} isolated control is below 24px; verify its effective clickable area before treating it as a failure.`);
    return result(belowRecommended > 0 ? 'CAN_BE_IMPROVED' : 'GOOD', belowRecommended > 0
      ? `${belowRecommended} of ${controls.length} controls are below the recommended 44px size but meet the 24px minimum.`
      : `All ${controls.length} mobile controls meet the recommended 44px size.`);
  }

  return null;
}

export async function evaluateCriteriaForPage(
  criteria: ActiveCriterion[],
  page: RenderedPageEvidence,
  visualInventory: VisualPageInventory | null = null,
  goalKey: GoalKey | null = null,
) {
  const resolvedGoalKey = goalKey ?? 'directPurchase';
  const profile = CRITERION_GOAL_PROFILES[resolvedGoalKey];
  const applicable = selectApplicableCriteria(criteria, page.pageType);
  const deterministic: EvaluatedCriterion[] = [];
  const contextual: ActiveCriterion[] = [];
  for (const criterion of applicable) {
    if (criterion.evidenceRequirements?.evaluableFromWebsite === false) {
      deterministic.push({
        criterionId: criterion.id,
        status: 'NOT_RELEVANT',
        method: criterion.defaultMethod,
        evidence: { summary: 'This check requires external business evidence and is not applicable to an automated storefront scan.', pageType: page.pageType },
        explanation: 'This check requires external business evidence and is not applicable to an automated storefront scan.',
        confidence: 1,
        scoreImpact: { categories: criterion.categoryMappings.map((mapping) => mapping.category) },
      });
      continue;
    }
    // Imported rubrics take precedence over legacy wording rules.
    const hasImportedStatusDefinitions = Boolean(criterion.evidenceRequirements?.statusDefinitions);
    const verdict = hasImportedStatusDefinitions ? null : deterministicVerdict(criterion, page);
    if (verdict && verdict.confidence >= 0.6) deterministic.push(verdict);
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
  const contextualCriteria = [...contextual].sort((a, b) => b.importanceWeight - a.importanceWeight);
  if (contextualCriteria.length > 0) {
    const batchSize = 8;
    const batches: ActiveCriterion[][] = [];
    for (let index = 0; index < contextualCriteria.length; index += batchSize) {
      batches.push(contextualCriteria.slice(index, index + batchSize));
    }
    const evaluateBatch = (chunk: ActiveCriterion[]) => evaluateCriteriaWithAi({
      pageType: page.pageType,
      visibleText: `${page.desktop.visibleText}\nMOBILE:\n${page.mobile.visibleText}`,
      controls: [...page.desktop.controls, ...page.mobile.controls],
      headings: [...page.desktop.headings, ...page.mobile.headings],
      criteria: chunk.map((criterion) => ({
        id: criterion.id,
        description: criterion.description,
        rationale: criterion.rationale,
        statusDefinitions: criterion.evidenceRequirements?.statusDefinitions ?? null,
        evidenceNeeded: criterion.evidenceRequirements?.evidenceNeeded ?? [],
        subchecks: criterion.evidenceRequirements?.subchecks ?? [],
      })),
      visualInventory,
      ...(!visualInventory ? {
        desktopScreenshotBase64: page.desktop.screenshotBase64,
        mobileScreenshotBase64: page.mobile.screenshotBase64,
        visualCaptures: selectVisualCaptures(page, chunk),
      } : {}),
    });
    const initialVerdicts = (await Promise.all(batches.map(evaluateBatch))).flat();
    const initialById = new Map(initialVerdicts.map((verdict) => [verdict.criterionId, verdict]));
    const missing = contextualCriteria.filter((criterion) => {
      const verdict = initialById.get(criterion.id);
      return !verdict || verdict.confidence < 0.6;
    });
    const retryBatches: ActiveCriterion[][] = [];
    for (let index = 0; index < missing.length; index += 4) {
      retryBatches.push(missing.slice(index, index + 4));
    }
    const retryVerdicts = retryBatches.length > 0
      ? (await Promise.all(retryBatches.map(evaluateBatch))).flat()
      : [];
    const byId = new Map(initialById);
    for (const verdict of retryVerdicts) {
      const existing = byId.get(verdict.criterionId);
      if (!existing || verdict.confidence > existing.confidence) byId.set(verdict.criterionId, verdict);
    }
    for (const criterion of contextualCriteria) {
      const verdict = byId.get(criterion.id);
      const summary = verdict?.evidence ?? 'No reliable rendered evidence was returned for this check; it was excluded from scoring.';
      const reliableVerdict = verdict && verdict.confidence >= 0.6 ? verdict : null;
      const observedChildren = reliableVerdict?.subcheckResults?.filter((child) =>
        child.status === 'SATISFIED' || child.status === 'MISSING') ?? [];
      const satisfiedChildren = observedChildren.filter((child) => child.status === 'SATISFIED').length;
      const childAggregate = observedChildren.length === 0
        ? null
        : satisfiedChildren === observedChildren.length
          ? 'GOOD' as const
          : satisfiedChildren === 0
            ? 'BAD' as const
            : 'CAN_BE_IMPROVED' as const;
      const rawStatus = childAggregate ?? reliableVerdict?.status;
      const conservativeStatus = rawStatus === 'BAD' && (reliableVerdict?.confidence ?? 0) < 0.8
        ? 'CAN_BE_IMPROVED'
        : rawStatus;
      const childSummary = observedChildren.length > 0
        ? `${satisfiedChildren} of ${observedChildren.length} observable subchecks were satisfied. ${summary}`
        : summary;
      aiResults.push({
        criterionId: criterion.id,
        status: conservativeStatus ?? 'NOT_OBSERVED',
        method: 'AI_ASSISTED',
        evidence: { summary: childSummary, pageType: page.pageType },
        explanation: childSummary,
        confidence: reliableVerdict?.confidence ?? 0,
        scoreImpact: { categories: criterion.categoryMappings.map((mapping) => mapping.category) },
      });
    }
  }
  const results = [...deterministic, ...aiResults];
  const criteriaById = new Map(applicable.map((criterion) => [criterion.id, criterion]));
  // Multiple imported spreadsheet rows can represent the same underlying
  // observation. Preserve every row in Checks & evidence, but count an
  // identical finding only once in scoring and penalty attribution.
  const scoringResults = [...new Map(results.map((result) => {
    const categories = [...result.scoreImpact.categories].sort().join(',');
    return [`${result.status}|${result.explanation.toLowerCase()}|${categories}`, result] as const;
  })).values()];
  const scoringIds = new Set(scoringResults.map((result) => result.criterionId));
  const goalAdjustedImportance = (criterion: ActiveCriterion) =>
    criterion.importanceWeight * criterionGoalMultiplier(resolvedGoalKey, `${criterion.title} ${criterion.description} ${criterion.rationale ?? ''}`);
  const scoreSummary = calculateCriterionScores(scoringResults.map((result) => {
    const criterion = criteriaById.get(result.criterionId)!;
    return {
      criterionId: result.criterionId,
      status: result.status,
      importanceWeight: goalAdjustedImportance(criterion),
      confidence: result.confidence,
      categoryMappings: criterion.categoryMappings,
    };
  }), {
    categoryWeights: profile.categoryWeights,
  });
  const baseScore = scoreSummary.overallScore;
  if (baseScore !== null) {
    for (const result of results) {
      if (result.status !== 'BAD') continue;
      if (!scoringIds.has(result.criterionId)) {
        result.scoreImpact.penaltyPoints = 0;
        continue;
      }
      const hypothetical = calculateCriterionScores(scoringResults.map((candidate) => {
        const criterion = criteriaById.get(candidate.criterionId)!;
        return {
          criterionId: candidate.criterionId,
          status: candidate.criterionId === result.criterionId ? 'GOOD' as const : candidate.status,
          importanceWeight: goalAdjustedImportance(criterion),
          confidence: candidate.confidence,
          categoryMappings: criterion.categoryMappings,
        };
      }), {
        categoryWeights: profile.categoryWeights,
      }).overallScore;
      result.scoreImpact.penaltyPoints = hypothetical === null
        ? 0
        : Number(Math.max(0, hypothetical - baseScore).toFixed(1));
    }
  }
  return { applicable, results, scoreSummary };
}
