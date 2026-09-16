import { load } from 'cheerio';
import type { AiAssistMetadata } from '../types/aiAssist';

export type CtaType = 'action' | 'informational' | 'mixed' | 'unknown';
export type CommitmentLevel = 'low' | 'medium' | 'high' | 'unknown';

export interface CtaDetail {
  text: string;
  primaryVerb: string | null;
  ctaType: CtaType;
  commitmentLevel: CommitmentLevel;
  riskReductionCues: string[];
  effortCues: string[];
  responsibilityCues: string[];
}

export interface CtaAnalysis {
  ctaTexts: string[];
  details: CtaDetail[];
  primaryCtaText: string | null;
  primaryVerb: string | null;
  primaryCtaType: CtaType;
  primaryCommitmentLevel: CommitmentLevel;
  actionCtaCount: number;
  informationalCtaCount: number;
  mixedCtaCount: number;
  riskReductionCues: string[];
  effortCues: string[];
  responsibilityCues: string[];
}

export interface ExtractedFeatures extends Record<string, unknown> {
  httpsPresent: boolean;
  titlePresent: boolean;
  metaDescriptionPresent: boolean;
  viewportMetaPresent: boolean;
  h1Count: number;
  headingCount: number;
  wordCount: number;
  ctaCount: number;
  primaryCtaText: string | null;
  formPresent: boolean;
  formFieldCount: number;
  promotionPresent: boolean;
  promotionOfferPresent: boolean;
  promotionalCtaTexts: string[];
  pageRiskReductionCues: string[];
  navLinkCount: number;
  testimonialKeywordsPresent: boolean;
  faqKeywordsPresent: boolean;
  contactInfoPresent: boolean;
  ctaAnalysis: CtaAnalysis;
  aiAssist?: AiAssistMetadata;
  analysisError?: string;
}

export interface EcommerceAiContext {
  url: string;
  title: string;
  headings: string[];
  controls: string[];
  prices: string[];
  visibleText: string;
}

const ACTION_VERBS = [
  'get',
  'start',
  'try',
  'book',
  'buy',
  'purchase',
  'order',
  'sign',
  'join',
  'subscribe',
  'request',
  'contact',
  'schedule',
  'download',
  'create',
  'claim',
  'apply',
  'talk',
  'shop',
  'add',
  'select',
  'choose',
];

const INFORMATIONAL_VERBS = [
  'learn',
  'read',
  'explore',
  'discover',
  'view',
  'watch',
  'compare',
  'see',
  'browse',
];

const CTA_KEYWORDS = [
  'sign up',
  'signup',
  'get started',
  'start free',
  'start trial',
  'free trial',
  'book demo',
  'request demo',
  'contact sales',
  'buy now',
  'purchase',
  'subscribe',
  'join now',
  'try now',
  'learn more',
  'schedule call',
  'book call',
  'read more',
  'see pricing',
  'add to cart',
  'add to bag',
  'shop now',
  'select options',
  'please select options',
  'subscribe & save',
];

const NAV_LABELS = new Set([
  'home',
  'about',
  'pricing',
  'features',
  'blog',
  'resources',
  'login',
  'log in',
  'sign in',
  'support',
  'contact',
]);

const HIGH_COMMITMENT_CUES = [
  'buy now',
  'purchase',
  'checkout',
  'place order',
  'subscribe now',
  'start paid',
  'book now',
  'add to cart',
  'add to bag',
  'shop now',
];

const MEDIUM_COMMITMENT_CUES = [
  'sign up',
  'signup',
  'get started',
  'request demo',
  'book demo',
  'schedule call',
  'book call',
  'contact sales',
  'create account',
  'start trial',
  'free trial',
];

const LOW_COMMITMENT_CUES = [
  'learn more',
  'read more',
  'explore',
  'discover',
  'watch demo',
  'view details',
  'see how it works',
  'see pricing',
];

const RISK_REDUCTION_CUES = [
  'free',
  'trial',
  'demo',
  'no credit card',
  'cancel anytime',
  'no obligation',
  'money back',
  'guarantee',
  'risk free',
];

const EFFORT_CUES = [
  'apply now',
  'submit',
  'fill out',
  'book call',
  'schedule call',
  'request demo',
  'contact sales',
  'talk to sales',
  'create account',
  'start onboarding',
];

const RESPONSIBILITY_CUES = [
  'my',
  'your',
  'our',
  'team',
  'business',
  'company',
  'account',
  'plan',
  'project',
];

const TESTIMONIAL_REGEX = /\b(testimonial|testimonials|reviews?|what (our|customers) say|trusted by|case stud(?:y|ies))\b/i;
const FAQ_REGEX = /\b(faq|frequently asked questions?|questions?\s*&\s*answers?)\b/i;
const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_REGEX = /\+?\d[\d\s().-]{7,}\d/;
const CONTACT_REGEX = /\b(contact us|get in touch|email us|call us|support)\b/i;
const NON_CONTENT_CONTEXT_REGEX = /(?:^|[\s_-])(nav(?:igation)?|menu|drawer|footer|cookie|consent|modal|locali[sz]ation|country-selector|language-selector|search)(?:$|[\s_-])/i;
const PROMOTION_CONTEXT_REGEX = /(?:^|\s)(?:announcement(?:-bar)?(?:__[\w-]+)?|promo(?:tion)?-bar(?:__[\w-]+)?|offer-bar(?:__[\w-]+)?|top-bar(?:__[\w-]+)?)(?:$|\s)/i;
const OFFER_REGEX = /(?:\b(?:sale|save|discount|offer|deal|free (?:delivery|shipping)|money off)\b|\d+\s*%\s*off)/i;
const PURCHASE_CTA_REGEX = /\b(?:add to (?:cart|bag|basket)|buy now|shop now|checkout|place order)\b/i;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function nodeContext($: ReturnType<typeof load>, node: Parameters<ReturnType<typeof load>>[0]): string {
  return $(node)
    .parents()
    .addBack()
    .map((_, element) => `${$(element).attr('id') ?? ''} ${$(element).attr('class') ?? ''}`)
    .get()
    .join(' ')
    .toLowerCase();
}

function isHiddenNode($: ReturnType<typeof load>, node: Parameters<ReturnType<typeof load>>[0]): boolean {
  return $(node)
    .parents()
    .addBack()
    .toArray()
    .some((element) => {
      const selected = $(element);
      const style = (selected.attr('style') ?? '').toLowerCase();
      const classes = (selected.attr('class') ?? '').toLowerCase().split(/\s+/);
      return (
        selected.is('[hidden], [aria-hidden="true"]') ||
        style.includes('display:none') ||
        style.includes('display: none') ||
        style.includes('visibility:hidden') ||
        style.includes('visibility: hidden') ||
        classes.some((value) => ['hidden', 'visually-hidden', 'sr-only', 'screen-reader-text'].includes(value))
      );
    });
}

function visibleControlText($: ReturnType<typeof load>, node: Parameters<ReturnType<typeof load>>[0]): string {
  const selected = $(node);
  if (selected.is('input')) return normalizeWhitespace(selected.attr('value') ?? '');
  const clone = selected.clone();
  clone.find('[hidden], [aria-hidden="true"], .hidden, .visually-hidden, .sr-only, .screen-reader-text').remove();
  return normalizeWhitespace(clone.text());
}

function isNonContentControl($: ReturnType<typeof load>, node: Parameters<ReturnType<typeof load>>[0]): boolean {
  if ($(node).parents('header, nav, footer').length > 0) return true;
  return NON_CONTENT_CONTEXT_REGEX.test(nodeContext($, node));
}

function isPromotionControl($: ReturnType<typeof load>, node: Parameters<ReturnType<typeof load>>[0]): boolean {
  return PROMOTION_CONTEXT_REGEX.test(nodeContext($, node));
}

function hasNamedMeta($: ReturnType<typeof load>, metaName: string): boolean {
  return $('meta')
    .toArray()
    .some((node) => {
      const name = ($(node).attr('name') ?? '').trim().toLowerCase();
      if (name !== metaName) return false;
      const content = ($(node).attr('content') ?? '').trim();
      return content.length > 0;
    });
}

function findMatchedCues(text: string, cues: string[]): string[] {
  const matched = new Set<string>();
  for (const cue of cues) {
    if (text.includes(cue)) matched.add(cue);
  }
  return [...matched];
}

function detectPrimaryVerb(text: string): string | null {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const verbSet = new Set([...ACTION_VERBS, ...INFORMATIONAL_VERBS]);
  for (const token of tokens) {
    if (verbSet.has(token)) return token;
  }
  return null;
}

function getCtaType(text: string): CtaType {
  const lower = text.toLowerCase();
  // Blend explicit CTA phrases with verb heuristics so short button copy still classifies well.
  const hasActionSignal =
    ACTION_VERBS.some((verb) => lower.split(/\s+/).includes(verb)) ||
    CTA_KEYWORDS.some((keyword) => lower.includes(keyword)) ||
    HIGH_COMMITMENT_CUES.some((cue) => lower.includes(cue)) ||
    MEDIUM_COMMITMENT_CUES.some((cue) => lower.includes(cue));

  const hasInfoSignal =
    INFORMATIONAL_VERBS.some((verb) => lower.split(/\s+/).includes(verb)) ||
    LOW_COMMITMENT_CUES.some((cue) => lower.includes(cue));

  if (hasActionSignal && hasInfoSignal) return 'mixed';
  if (hasActionSignal) return 'action';
  if (hasInfoSignal) return 'informational';
  return 'unknown';
}

function getCommitmentLevel(text: string, ctaType: CtaType): CommitmentLevel {
  const lower = text.toLowerCase();
  if (HIGH_COMMITMENT_CUES.some((cue) => lower.includes(cue))) return 'high';
  if (MEDIUM_COMMITMENT_CUES.some((cue) => lower.includes(cue))) return 'medium';
  if (LOW_COMMITMENT_CUES.some((cue) => lower.includes(cue))) return 'low';

  if (ctaType === 'action') return 'medium';
  if (ctaType === 'informational') return 'low';
  if (ctaType === 'mixed') return 'medium';
  return 'unknown';
}

export function analyzeCtaText(text: string): CtaDetail {
  const lower = text.toLowerCase();
  const ctaType = getCtaType(lower);

  return {
    text,
    primaryVerb: detectPrimaryVerb(lower),
    ctaType,
    commitmentLevel: getCommitmentLevel(lower, ctaType),
    riskReductionCues: findMatchedCues(lower, RISK_REDUCTION_CUES),
    effortCues: findMatchedCues(lower, EFFORT_CUES),
    responsibilityCues: findMatchedCues(lower, RESPONSIBILITY_CUES),
  };
}

function isLikelyCtaText(text: string, isStrongControl: boolean, isSubmitControl: boolean): boolean {
  const lower = text.toLowerCase();
  if (!lower) return false;
  if (NAV_LABELS.has(lower)) return false;

  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  if (wordCount > 10) return false;

  const hasKeywordSignal =
    CTA_KEYWORDS.some((keyword) => lower.includes(keyword)) ||
    ACTION_VERBS.some((verb) => lower.split(/\s+/).includes(verb)) ||
    INFORMATIONAL_VERBS.some((verb) => lower.split(/\s+/).includes(verb));

  // Submit controls represent an explicit action. Other buttons still need CTA language so
  // variant chips and accordion toggles are not mistaken for conversion choices.
  if (isStrongControl) return isSubmitControl ? wordCount <= 8 : hasKeywordSignal;
  return hasKeywordSignal;
}

function buildCtaAnalysis($: ReturnType<typeof load>): CtaAnalysis {
  const ctaSelectors = 'a, button, input[type="button"], input[type="submit"], [role="button"]';
  const contentRoot = $('main').first().length > 0 ? $('main').first() : $('body');
  const ctaCandidates = contentRoot.find(ctaSelectors).toArray();
  const ctaTexts: string[] = [];
  const purchaseTexts = new Set<string>();
  const seen = new Set<string>();

  for (const node of ctaCandidates) {
    if (isHiddenNode($, node) || isNonContentControl($, node) || isPromotionControl($, node)) continue;

    const rawText = visibleControlText($, node);
    if (!rawText) continue;
    if (rawText.length > 90) continue;

    const lower = rawText.toLowerCase();
    if (seen.has(lower)) continue;

    const tagName = node.tagName?.toLowerCase() ?? '';
    const typeAttr = ($(node).attr('type') ?? '').toLowerCase();
    const roleAttr = ($(node).attr('role') ?? '').toLowerCase();
    const isStrongControl =
      tagName === 'button' ||
      (tagName === 'input' && (typeAttr === 'button' || typeAttr === 'submit')) ||
      roleAttr === 'button';
    const isSubmitControl =
      typeAttr === 'submit' || (tagName === 'button' && !typeAttr && $(node).closest('form').length > 0);

    if (!isLikelyCtaText(rawText, isStrongControl, isSubmitControl)) continue;

    ctaTexts.push(rawText);
    const parentForm = $(node).closest('form');
    const formContext = `${parentForm.attr('action') ?? ''} ${parentForm.attr('class') ?? ''}`;
    if (PURCHASE_CTA_REGEX.test(rawText) || (isSubmitControl && /(?:\/cart\/add|product-form)/i.test(formContext))) {
      purchaseTexts.add(lower);
    }
    seen.add(lower);
    if (ctaTexts.length >= 12) break;
  }

  const details = ctaTexts.map((text) => analyzeCtaText(text));
  // Prefer the first action-capable CTA as the primary signal used by downstream scoring.
  const primaryDetail =
    details.find((detail) => purchaseTexts.has(detail.text.toLowerCase())) ??
    details.find((detail) => detail.ctaType === 'action' || detail.ctaType === 'mixed') ??
    details[0];

  const actionCtaCount = details.filter((detail) => detail.ctaType === 'action').length;
  const informationalCtaCount = details.filter((detail) => detail.ctaType === 'informational').length;
  const mixedCtaCount = details.filter((detail) => detail.ctaType === 'mixed').length;

  const aggregate = (getter: (detail: CtaDetail) => string[]) => {
    const values = new Set<string>();
    for (const detail of details) {
      for (const item of getter(detail)) values.add(item);
    }
    return [...values];
  };

  return {
    ctaTexts,
    details,
    primaryCtaText: primaryDetail?.text ?? null,
    primaryVerb: primaryDetail?.primaryVerb ?? null,
    primaryCtaType: primaryDetail?.ctaType ?? 'unknown',
    primaryCommitmentLevel: primaryDetail?.commitmentLevel ?? 'unknown',
    actionCtaCount,
    informationalCtaCount,
    mixedCtaCount,
    riskReductionCues: aggregate((detail) => detail.riskReductionCues),
    effortCues: aggregate((detail) => detail.effortCues),
    responsibilityCues: aggregate((detail) => detail.responsibilityCues),
  };
}

function extractPromotionFeatures($: ReturnType<typeof load>): {
  promotionPresent: boolean;
  promotionOfferPresent: boolean;
  promotionalCtaTexts: string[];
} {
  const allPromotionalNodes = $('body *')
    .toArray()
    .filter((node) => PROMOTION_CONTEXT_REGEX.test(`${$(node).attr('id') ?? ''} ${$(node).attr('class') ?? ''}`));
  const promotionalNodes = allPromotionalNodes.filter((node) =>
    !$(node).parents().toArray().some((parent) => allPromotionalNodes.includes(parent)),
  );
  const promotionalCtaTexts: string[] = [];
  const seen = new Set<string>();
  let promotionOfferPresent = false;

  for (const node of promotionalNodes) {
    if (isHiddenNode($, node)) continue;
    const text = normalizeWhitespace($(node).text());
    if (OFFER_REGEX.test(text)) promotionOfferPresent = true;

    $(node).find('a, button, input[type="button"], input[type="submit"], [role="button"]').each((_, control) => {
      const controlText = visibleControlText($, control);
      const lower = controlText.toLowerCase();
      if (!controlText || controlText.length > 90 || seen.has(lower)) return;
      promotionalCtaTexts.push(controlText);
      seen.add(lower);
    });
  }

  return {
    promotionPresent: promotionalNodes.length > 0,
    promotionOfferPresent,
    promotionalCtaTexts: promotionalCtaTexts.slice(0, 8),
  };
}

function extractRelevantFormFeatures($: ReturnType<typeof load>): { formPresent: boolean; formFieldCount: number } {
  const contentRoot = $('main').first().length > 0 ? $('main').first() : $('body');
  const forms = contentRoot
    .find('form')
    .toArray()
    .filter((form) => !isHiddenNode($, form) && !isNonContentControl($, form));

  const scoredForms = forms.map((form) => {
    const selected = $(form);
    const context = `${selected.attr('action') ?? ''} ${selected.attr('id') ?? ''} ${selected.attr('class') ?? ''}`;
    const isProductForm = /(?:\/cart\/add|product-form|data-product-form)/i.test(context) || selected.is('[data-product-form]');
    const fields = selected
      .find('input, select, textarea')
      .toArray()
      .filter((field) => {
        const control = $(field);
        const type = (control.attr('type') ?? '').toLowerCase();
        return !isHiddenNode($, field) && type !== 'hidden' && type !== 'submit' && type !== 'button' && !control.is('[disabled]');
      }).length;
    return { fields, isProductForm };
  });

  const preferredForms = scoredForms.filter((form) => form.isProductForm);
  const relevantForms = preferredForms.length > 0 ? preferredForms : scoredForms;
  return {
    formPresent: relevantForms.length > 0,
    formFieldCount: relevantForms.reduce((maximum, form) => Math.max(maximum, form.fields), 0),
  };
}

export function createFallbackFeatures(url: string, error: string): ExtractedFeatures {
  // Return a complete feature object so scoring can continue after fetch/extraction failures.
  return {
    httpsPresent: /^https:\/\//i.test(url),
    titlePresent: false,
    metaDescriptionPresent: false,
    viewportMetaPresent: false,
    h1Count: 0,
    headingCount: 0,
    wordCount: 0,
    ctaCount: 0,
    primaryCtaText: null,
    formPresent: false,
    formFieldCount: 0,
    promotionPresent: false,
    promotionOfferPresent: false,
    promotionalCtaTexts: [],
    pageRiskReductionCues: [],
    navLinkCount: 0,
    testimonialKeywordsPresent: false,
    faqKeywordsPresent: false,
    contactInfoPresent: false,
    ctaAnalysis: {
      ctaTexts: [],
      details: [],
      primaryCtaText: null,
      primaryVerb: null,
      primaryCtaType: 'unknown',
      primaryCommitmentLevel: 'unknown',
      actionCtaCount: 0,
      informationalCtaCount: 0,
      mixedCtaCount: 0,
      riskReductionCues: [],
      effortCues: [],
      responsibilityCues: [],
    },
    analysisError: error,
  };
}

export function extractFeaturesFromHtml(html: string, pageUrl: string): ExtractedFeatures {
  const $ = load(html);
  // Remove non-visible nodes so text-based heuristics reflect the rendered page, not bundled code.
  $('script, style, noscript').remove();

  const titlePresent = $('title').first().text().trim().length > 0;
  const metaDescriptionPresent = hasNamedMeta($, 'description');
  const viewportMetaPresent = hasNamedMeta($, 'viewport');
  const h1Count = $('h1').length;
  const headingCount = $('h1, h2, h3, h4, h5, h6').length;

  const pageText = normalizeWhitespace($('body').text() || $.root().text());
  const words = pageText ? pageText.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;

  const ctaAnalysis = buildCtaAnalysis($);
  const ctaCount = ctaAnalysis.details.length;
  const primaryCtaText = ctaAnalysis.primaryCtaText;

  const { formPresent, formFieldCount } = extractRelevantFormFeatures($);
  const promotionFeatures = extractPromotionFeatures($);
  const pageRiskReductionCues = findMatchedCues(pageText.toLowerCase(), RISK_REDUCTION_CUES);
  const navLinkCount = $('nav a').length;

  const testimonialKeywordsPresent = TESTIMONIAL_REGEX.test(pageText);
  const faqKeywordsPresent = FAQ_REGEX.test(pageText);
  const contactInfoPresent =
    CONTACT_REGEX.test(pageText) || EMAIL_REGEX.test(pageText) || PHONE_REGEX.test(pageText);

  return {
    httpsPresent: /^https:\/\//i.test(pageUrl),
    titlePresent,
    metaDescriptionPresent,
    viewportMetaPresent,
    h1Count,
    headingCount,
    wordCount,
    ctaCount,
    primaryCtaText,
    formPresent,
    formFieldCount,
    ...promotionFeatures,
    pageRiskReductionCues,
    navLinkCount,
    testimonialKeywordsPresent,
    faqKeywordsPresent,
    contactInfoPresent,
    ctaAnalysis,
  };
}

export function extractEcommerceAiContext(html: string, pageUrl: string): EcommerceAiContext {
  const $ = load(html);
  $('script, style, noscript, template').remove();
  const contentRoot = $('main').first().length > 0 ? $('main').first() : $('body');
  const visibleText = normalizeWhitespace(contentRoot.text()).slice(0, 12000);
  const headings = contentRoot
    .find('h1, h2, h3, h4, h5, h6')
    .toArray()
    .filter((node) => !isHiddenNode($, node) && !isNonContentControl($, node))
    .map((node) => normalizeWhitespace($(node).text()))
    .filter(Boolean)
    .slice(0, 40);
  const controls = contentRoot
    .find('a, button, input[type="button"], input[type="submit"], [role="button"], select')
    .toArray()
    .filter((node) => !isHiddenNode($, node) && !isNonContentControl($, node))
    .map((node) => visibleControlText($, node))
    .filter(Boolean)
    .filter((text, index, values) => values.findIndex((value) => value.toLowerCase() === text.toLowerCase()) === index)
    .slice(0, 50);
  const prices = [...new Set(visibleText.match(/(?:£|\$|€)\s?\d+(?:[.,]\d{1,2})?/g) ?? [])].slice(0, 12);

  return {
    url: pageUrl,
    title: normalizeWhitespace($('title').first().text()),
    headings,
    controls,
    prices,
    visibleText,
  };
}
