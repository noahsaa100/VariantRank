const DEFAULT_TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 5;

export interface PageFetchSuccess {
  ok: true;
  html: string;
  finalUrl: string;
  status: number;
}

export interface PageFetchFailure {
  ok: false;
  finalUrl: string;
  error: string;
  status?: number;
}

export type PageFetchResult = PageFetchSuccess | PageFetchFailure;

function getSetCookieHeaders(headers: Headers): string[] {
  const extendedHeaders = headers as Headers & { getSetCookie?: () => string[] };
  const values = extendedHeaders.getSetCookie?.();
  if (values && values.length > 0) return values;
  const combined = headers.get('set-cookie');
  return combined ? [combined] : [];
}

function cookiePairs(setCookieHeaders: string[]): string[] {
  return setCookieHeaders
    .map((header) => header.split(';', 1)[0]?.trim())
    .filter((cookie): cookie is string => Boolean(cookie && cookie.includes('=')));
}

async function fetchWithSameSiteRedirectCookies(
  initialUrl: string,
  signal: AbortSignal,
): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = initialUrl;
  const cookiesByOrigin = new Map<string, Map<string, string>>();

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const current = new URL(currentUrl);
    const originCookies = cookiesByOrigin.get(current.origin);
    const cookieHeader = originCookies ? [...originCookies.values()].join('; ') : '';
    const response = await fetch(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'VariantRankBot/1.0 (+https://variantrank.local)',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
    });

    const receivedCookies = cookiePairs(getSetCookieHeaders(response.headers));
    if (receivedCookies.length > 0) {
      const jar = originCookies ?? new Map<string, string>();
      for (const cookie of receivedCookies) {
        const name = cookie.slice(0, cookie.indexOf('='));
        jar.set(name, cookie);
      }
      cookiesByOrigin.set(current.origin, jar);
    }

    if (response.status < 300 || response.status >= 400) {
      return { response, finalUrl: currentUrl };
    }

    const location = response.headers.get('location');
    if (!location) return { response, finalUrl: currentUrl };
    const nextUrl = new URL(location, currentUrl);
    if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
      throw new Error(`Unsupported redirect protocol: ${nextUrl.protocol}`);
    }
    currentUrl = nextUrl.toString();
  }

  throw new Error(`Too many redirects (>${MAX_REDIRECTS})`);
}

function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function fetchPageHtml(
  inputUrl: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<PageFetchResult> {
  const normalizedUrl = normalizeUrl(inputUrl);
  if (!normalizedUrl) {
    return {
      ok: false,
      finalUrl: inputUrl,
      error: 'Invalid URL',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Fetch only HTML-like responses so downstream extraction sees predictable input.
    const { response, finalUrl } = await fetchWithSameSiteRedirectCookies(normalizedUrl, controller.signal);

    if (!response.ok) {
      return {
        ok: false,
        finalUrl,
        status: response.status,
        error: `HTTP ${response.status} ${response.statusText}`.trim(),
      };
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      return {
        ok: false,
        finalUrl,
        status: response.status,
        error: `Unsupported content type: ${contentType || 'unknown'}`,
      };
    }

    const html = await response.text();
    if (!html.trim()) {
      return {
        ok: false,
        finalUrl,
        status: response.status,
        error: 'Empty HTML response',
      };
    }

    return {
      ok: true,
      html,
      finalUrl,
      status: response.status,
    };
  } catch (error) {
    // Normalize transport failures into structured results instead of throwing through the pipeline.
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? `Request timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : 'Unknown fetch error';

    return {
      ok: false,
      finalUrl: normalizedUrl,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}
