export const AI_ASSIST_ENABLED = process.env.AI_ASSIST_ENABLED === 'true';
export const AI_ASSIST_MODEL = process.env.AI_ASSIST_MODEL ?? 'gpt-4o-mini';
export const AI_ASSIST_TIMEOUT_MS = Number(process.env.AI_ASSIST_TIMEOUT_MS ?? 2500);
export const OPENAI_API_BASE_URL = process.env.OPENAI_API_BASE_URL ?? 'https://api.openai.com/v1';

export function canUseAiAssist(): boolean {
  return AI_ASSIST_ENABLED && Boolean(process.env.OPENAI_API_KEY);
}
