import { load } from 'cheerio';

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
  analysisError?: string;
}

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

export function createFallbackFeatures(url: string, error: string): ExtractedFeatures {
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
    analysisError: error,
  };
}

export function extractFeaturesFromHtml(html: string, pageUrl: string): ExtractedFeatures {
  const $ = load(html);
  $('script, style, noscript').remove();

  const titlePresent = $('title').first().text().trim().length > 0;
  const metaDescriptionPresent = hasNamedMeta($, 'description');
  const viewportMetaPresent = hasNamedMeta($, 'viewport');
  const h1Count = $('h1').length;
  const headingCount = $('h1, h2, h3, h4, h5, h6').length;

  const pageText = normalizeWhitespace($('body').text() || $.root().text());
  const words = pageText ? pageText.split(/\s+/).filter(Boolean) : [];
  const wordCount = words.length;

  const ctaSelectors = 'a, button, input[type="button"], input[type="submit"], [role="button"]';
  const ctaCandidates = $(ctaSelectors).toArray();
  const matchedCtas: string[] = [];

  for (const node of ctaCandidates) {
    const rawText = normalizeWhitespace($(node).text() || ($(node).attr('value') ?? ''));
    const text = rawText.toLowerCase();
    if (!text) continue;
    if (CTA_KEYWORDS.some((keyword) => text.includes(keyword))) {
      matchedCtas.push(rawText);
    }
  }

  const ctaCount = matchedCtas.length;
  const primaryCtaText = matchedCtas[0] ?? null;

  const formPresent = $('form').length > 0;
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
  };
}
