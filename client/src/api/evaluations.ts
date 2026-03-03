const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

export async function createEvaluation(payload: {
  urls: string[];
  goal: string;
  anonymousSessionId?: string;
}) {
  const res = await fetch(`${API_BASE}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function listEvaluations() {
  const res = await fetch(`${API_BASE}/evaluations`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getEvaluation(id: string) {
  const res = await fetch(`${API_BASE}/evaluations/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
