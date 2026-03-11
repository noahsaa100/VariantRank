import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../aiAssistService', () => ({
  mapGoalDescriptionWithAi: vi.fn(async () => null),
}));

import { resolveGoalWithAssist } from '../goalAssistService';
import { mapGoalDescriptionWithAi } from '../aiAssistService';

describe('goalAssistService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to selected goal when AI is unavailable and rules do not match', async () => {
    const result = await resolveGoalWithAssist('Lead generation', 'planetary resonance objective');

    expect(mapGoalDescriptionWithAi).toHaveBeenCalledTimes(1);
    expect(result.scoringGoalKey).toBe('leadGeneration');
    expect(result.goalAssist.source).toBe('fallback');
    expect(result.goalAssist.mappedGoalKey).toBe('leadGeneration');
  });

  it('uses rule mapping when AI returns no mapping but keyword rules match', async () => {
    const result = await resolveGoalWithAssist('Lead generation', 'We need users to book consultation calls quickly');

    expect(result.scoringGoalKey).toBe('bookingConsultation');
    expect(result.goalAssist.source).toBe('rules');
    expect(result.goalAssist.confidence).toBeGreaterThanOrEqual(0.45);
  });
});
