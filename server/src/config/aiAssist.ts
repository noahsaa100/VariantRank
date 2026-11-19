export const AI_ASSIST_ENABLED = process.env.AI_ASSIST_ENABLED === 'true';
export const AI_ASSIST_MODEL = process.env.AI_ASSIST_MODEL ?? 'claude-haiku-5-5';
export const AI_ASSIST_TIMEOUT_MS = Number(process.env.AI_ASSIST_TIMEOUT_MS ?? 2500);
export const AI_ASSIST_MAX_TOKENS = Number(process.env.AI_ASSIST_MAX_TOKENS ?? 2048);
export const ANTHROPIC_API_BASE_URL = process.env.ANTHROPIC_API_BASE_URL ?? 'https://api.anthropic.com/v1';

export function canUseAiAssist(): boolean {
  return AI_ASSIST_ENABLED && Boolean(process.env.ANTHROPIC_API_KEY);
}
