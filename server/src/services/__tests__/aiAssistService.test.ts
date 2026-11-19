import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('aiAssistService Anthropic transport', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('AI_ASSIST_ENABLED', 'true');
    vi.stubEnv('AI_ASSIST_MODEL', 'claude-test-model');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');
    vi.stubEnv('ANTHROPIC_API_BASE_URL', 'https://api.anthropic.test/v1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses Anthropic Messages API and preserves the existing parsed result shape', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      content: [{
        type: 'text',
        text: JSON.stringify({
          actionType: 'action',
          commitmentLevel: 'high',
          riskReduction: { present: true, cues: ['guarantee'] },
          confidence: 0.91,
          reasoning: 'Clear purchase action.',
        }),
      }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { classifyPrimaryCtaWithAi } = await import('../aiAssistService');
    const result = await classifyPrimaryCtaWithAi('Add to bag', 'directPurchase');

    expect(result).toMatchObject({
      primaryCtaText: 'Add to bag',
      actionType: 'action',
      commitmentLevel: 'high',
      source: 'ai',
      confidence: 0.91,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.test/v1/messages');
    expect(request.headers).toMatchObject({
      'x-api-key': 'test-anthropic-key',
      'anthropic-version': '2023-06-01',
    });
    const body = JSON.parse(request.body as string);
    expect(body).toMatchObject({
      model: 'claude-test-model',
      max_tokens: 2048,
      system: expect.any(String),
      messages: [{ role: 'user', content: expect.any(String) }],
    });
    expect(body.response_format).toBeUndefined();
  });

  it('does not call any provider when the Anthropic key is absent', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { classifyPrimaryCtaWithAi } = await import('../aiAssistService');
    await expect(classifyPrimaryCtaWithAi('Buy now', 'directPurchase')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
