# Deployment — Vercel

> Phase 18 — Production deployment for PracticeHub (Exam Simulator)

## 1. Vercel (Recommended)

### Prerequisites
- GitHub repo connected to Vercel (import project)
- Postgres database — choose one:
  - **Vercel Postgres** (Storage → Create → Postgres)
  - **Neon** (https://neon.tech) — free tier
  - **Supabase** (https://supabase.com)

### Environment Variables (Vercel Dashboard → Settings → Environment Variables)

| Key | Example | Required |
|-----|---------|----------|
| DATABASE_URL | postgres://default:xxx@xxx-pooler.vercel-storage.com/verceldb?sslmode=require | Yes |
| DIRECT_URL | postgres://default:xxx@xxx.vercel-storage.com/verceldb?sslmode=require | If pooled |
| NEXTAUTH_SECRET | openssl rand -base64 32 | Yes |
| AUTH_SECRET | same as above | Yes |
| NEXTAUTH_URL | https://your-app.vercel.app | Yes |
| R2_ACCOUNT_ID / R2_* | — | For uploads (prod) |
| OPENAI_API_KEY | sk-... | Optional |
| AZURE_DI_ENDPOINT / KEY | — | Optional |

### Switch Prisma to PostgreSQL (one-time)

    # 1. Change provider in prisma/schema.prisma
    # datasource db {
    #   provider = "postgresql"
    #   url = env("DATABASE_URL")
    # }

    # 2. Create migration for Postgres
    npx prisma migrate dev --name init_postgres

    # 3. Push to Vercel
    # Vercel will run: npm run vercel-build => prisma generate && prisma migrate deploy && next build

Local dev stays on SQLite until you switch. Keep DATABASE_URL="file:./dev.db" locally or run Postgres via Docker.

### Build Command

Vercel uses vercel.json:

    {
      "buildCommand": "npm run vercel-build",
      "framework": "nextjs"
    }

npm run vercel-build = prisma generate && prisma migrate deploy && next build

### Deploy Steps

1. Push to main → Vercel auto-deploys
2. First deploy: run seed via Vercel CLI or one-off:

       vercel env pull .env.production
       npx prisma db seed

3. Check https://your-app.vercel.app/api/health → {status:"ok"}
4. Login → Upload → Publish → Verify exam at /exams

### Vercel Storage for Uploads

Local storage/uploads is ephemeral on Vercel. For production:

- Set R2_* vars → lib/storage/index.ts will use S3/R2 (auto-detected via isR2Configured())
- Or use Vercel Blob: adapt lib/storage to @vercel/blob

Without R2, uploads work but disappear after redeploys (demo only).

---

## 2. Local Postgres (Docker) — Optional

    docker-compose up -d
    # .env: DATABASE_URL="postgresql://postgres:postgres@localhost:5432/practicehub?schema=public"
    npx prisma migrate dev --name init
    npm run db:seed
    npm run dev

See docker-compose.yml for service.

---

## 3. CI — GitHub Actions

.github/workflows/ci.yml runs on every push/PR:

- npm ci
- prisma generate
- tsc --noEmit
- eslint
- vitest run
- next build

---

## 4. Checklist Before Go-Live

- [ ] NEXTAUTH_SECRET 32+ chars, different from dev
- [ ] DATABASE_URL points to Postgres (not file:./dev.db)
- [ ] Run prisma migrate deploy on prod DB
- [ ] Set NEXTAUTH_URL to https://your-domain
- [ ] Configure R2/S3 for uploads
- [ ] Add custom domain in Vercel → Domains
- [ ] Test /api/health, /exams, upload→publish flow

---

## 5. Rollback

Vercel → Deployments → Previous → Promote to Production.

DB migrations are forward-only — to rollback, restore Postgres snapshot.
