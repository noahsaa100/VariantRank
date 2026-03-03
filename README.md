# VariantRank

A cloud-ready decision-support system that evaluates website URLs and stores structured evaluation results in PostgreSQL.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript |
| Backend | Node + Express + TypeScript |
| ORM | Prisma |
| Database | PostgreSQL |
| Local dev | Docker Compose |

## Project Structure

```
/client          React + Vite + TypeScript frontend
/server          Express + TypeScript backend
docker-compose.yml  Local PostgreSQL service
```

## Getting Started

### 1. Start the database

```bash
docker compose up -d
```

### 2. Set up the backend

```bash
cd server
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run dev
```

The API server starts on **http://localhost:3001**.

### 3. Set up the frontend

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

The frontend starts on **http://localhost:5173**.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/evaluate` | Run a new evaluation |
| `GET` | `/api/evaluations` | List past evaluations (summary) |
| `GET` | `/api/evaluations/:id` | Get full evaluation with variants |

### POST /api/evaluate

```json
{
  "urls": ["https://example.com", "https://another.com"],
  "goal": "Lead generation",
  "anonymousSessionId": "optional-uuid"
}
```

## Architecture Notes

- **Backend is stateless** — all state lives in PostgreSQL.
- **Scoring engine is a stub** — `server/src/services/evaluationService.ts` contains deterministic mock scoring. Replace this with real logic when ready.
- **Auth-ready** — the `Evaluation` model includes `anonymousSessionId` for session tracking. A full auth layer can be added by extending the schema and adding auth middleware without breaking existing endpoints.
- **AI layer hook** — the scoring service is isolated so an AI/ML scoring layer can replace or augment it with no controller changes.

## Database Schema

```
Evaluation
  id                 UUID (PK)
  createdAt          DateTime
  goal               String
  urls               JSON
  anonymousSessionId UUID? (nullable)
  processingTime     Int

Variant
  id             UUID (PK)
  evaluationId   UUID (FK → Evaluation)
  url            String
  rank           Int
  totalScore     Float
  categoryScores JSON
  rulePenalties  JSON
  topDrivers     JSON
  features       JSON
```
