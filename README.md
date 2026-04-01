# VariantRank

VariantRank evaluates landing page variants from URLs, assigns deterministic behavioural scores, ranks variants by goal-fit, and stores full evaluation artifacts in PostgreSQL.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript |
| Backend | Node + Express + TypeScript |
| HTML analysis | Cheerio |
| ORM | Prisma |
| Database | PostgreSQL |
| Local dev DB | Docker Compose |
| Backend tests | Vitest |

## Project Structure

```text
/client                 React frontend
/server                 Express backend
/server/src/config      Goal, weights, scoring config
/server/src/services    Fetch, feature extraction, scoring, AI assist
/server/prisma          Prisma schema + migrations
docker-compose.yml      Local PostgreSQL service
```

## Getting Started

### 1. Start PostgreSQL

```bash
docker compose up -d
```

### 2. Run backend

```bash
cd server
cp .env.example .env
npm install
npx prisma migrate dev
npm run dev
```

Backend: `http://localhost:3001`

### 3. Run frontend

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Frontend: `http://localhost:5173`

## Backend Environment

`server/.env.example`:

- `DATABASE_URL`
- `PORT` (default `3001`)
- `AI_ASSIST_ENABLED` (`true`/`false`)
- `AI_ASSIST_MODEL` (default `gpt-4o-mini`)
- `AI_ASSIST_TIMEOUT_MS` (default `2500`)
- `OPENAI_API_KEY`
- `OPENAI_API_BASE_URL` (default `https://api.openai.com/v1`)

AI assist is only used when `AI_ASSIST_ENABLED=true` and `OPENAI_API_KEY` is set.

## API

Base path: `/api`

| Method | Path | Description |
|---|---|---|
| `POST` | `/evaluate` | Run and persist a new evaluation |
| `GET` | `/evaluations` | List historical evaluations (summary) |
| `GET` | `/evaluations/:id` | Get full evaluation with ranked variants |
| `DELETE` | `/evaluations/:id` | Delete one evaluation |
| `DELETE` | `/evaluations` | Delete all evaluations |

### POST /api/evaluate

Request:

```json
{
  "urls": ["https://example.com", "https://another.com"],
  "goal": "Lead generation",
  "goalDescription": "optional free-text goal context",
  "anonymousSessionId": "optional-uuid"
}
```

Validation:

- `urls` must be a non-empty array
- `goal` must be a non-empty string
- `goalDescription` must be a string when provided

Goal resolution supports aliases and maps to one scoring key:

- `leadGeneration`
- `trialSignup`
- `directPurchase`
- `bookingConsultation`
- `contentEngagement`

## Scoring and Analysis Pipeline

Per URL, backend does:

1. Normalize + fetch page HTML (`fetchPageHtml`).
2. Extract features (`extractFeaturesFromHtml`):
   - metadata/title/viewport/headings/word count
   - CTA extraction + rule classification (action type, commitment level, risk/effort cues)
   - form/nav/trust/contact signals
3. Optionally classify primary CTA with AI (`classifyPrimaryCtaWithAi`).
4. Convert features to behavioural concept scores.
5. Apply goal-specific concept multipliers and category weights.
6. Compute:
   - category scores (`UX`, `Trust`, `Clarity`, `Friction`, `Technical`)
   - total score
   - rule penalties
   - top drivers
7. Rank variants by total score and persist everything.

### Fallback Behavior

- If fetch fails, fallback features are generated with `analysisError`.
- Fallback path applies a technical penalty rule and still returns a deterministic scored result.
- Goal mapping fallback order:
  1. AI mapping (if available)
  2. Rule-based keyword mapping
  3. Selected goal fallback

## Database Schema

```text
Evaluation
  id                 UUID (PK)
  createdAt          DateTime
  goal               String
  urls               JSON
  anonymousSessionId String? (nullable)
  processingTime     Int

Variant
  id             UUID (PK)
  evaluationId   UUID (FK -> Evaluation)
  url            String
  rank           Int
  totalScore     Float
  categoryScores JSON
  rulePenalties  JSON
  topDrivers     JSON
  features       JSON
```

## Backend Tests

From `/server`:

```bash
npm test
```

Current automated backend coverage includes:

- feature extraction
- deterministic scoring stability
- goal-weight differences
- fetch failure fallback
- AI-assist fallback
- CTA rule classification
