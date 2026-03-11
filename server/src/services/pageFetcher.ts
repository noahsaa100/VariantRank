const DEFAULT_TIMEOUT_MS = 10000;

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
    const response = await fetch(normalizedUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'VariantRankBot/1.0 (+https://variantrank.local)',
      },
    });

    const finalUrl = response.url || normalizedUrl;

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
