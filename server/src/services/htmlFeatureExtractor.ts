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
  navLinkCount: number;
  testimonialKeywordsPresent: boolean;
  faqKeywordsPresent: boolean;
  contactInfoPresent: boolean;
  ctaAnalysis: CtaAnalysis;
  aiAssist?: AiAssistMetadata;
  analysisError?: string;
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

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
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

function analyzeCtaText(text: string): CtaDetail {
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

function isLikelyCtaText(text: string, isStrongControl: boolean): boolean {
  const lower = text.toLowerCase();
  if (!lower) return false;
  if (NAV_LABELS.has(lower)) return false;

  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  if (wordCount > 10) return false;

  const hasKeywordSignal =
    CTA_KEYWORDS.some((keyword) => lower.includes(keyword)) ||
    ACTION_VERBS.some((verb) => lower.split(/\s+/).includes(verb)) ||
    INFORMATIONAL_VERBS.some((verb) => lower.split(/\s+/).includes(verb));

  // Buttons and submit inputs are allowed a little more latitude than plain links.
  if (isStrongControl) return wordCount <= 8 || hasKeywordSignal;
  return hasKeywordSignal;
}

function buildCtaAnalysis($: ReturnType<typeof load>): CtaAnalysis {
  const ctaSelectors = 'a, button, input[type="button"], input[type="submit"], [role="button"]';
  const ctaCandidates = $(ctaSelectors).toArray();
  const ctaTexts: string[] = [];
  const seen = new Set<string>();

  for (const node of ctaCandidates) {
    const rawText = normalizeWhitespace($(node).text() || ($(node).attr('value') ?? ''));
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

    if (!isLikelyCtaText(rawText, isStrongControl)) continue;

    ctaTexts.push(rawText);
    seen.add(lower);
    if (ctaTexts.length >= 12) break;
  }

  const details = ctaTexts.map((text) => analyzeCtaText(text));
  // Prefer the first action-capable CTA as the primary signal used by downstream scoring.
  const primaryDetail =
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

  const formPresent = $('form').length > 0;
  // Form complexity is approximated from interactive controls, not validation or backend logic.
  const formFieldCount = $('form input, form select, form textarea, form button').length;
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
    navLinkCount,
    testimonialKeywordsPresent,
    faqKeywordsPresent,
    contactInfoPresent,
    ctaAnalysis,
  };
}
