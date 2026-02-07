# Deployment Guide

## Overview
This guide covers deploying the Mobility Journey app with Vercel and Supabase. It includes required environment variables, Supabase setup, and migration steps.

## Prerequisites
- A Supabase project
- A Vercel project connected to this repo
- Access to the required environment variables (see below)

## Supabase Setup
1. Create a new Supabase project.
2. Enable Supabase Auth (Email/Password is sufficient for single-user setups).
3. Create a storage bucket for uploads (for example: `photos`).
4. Apply the SQL migrations in `supabase/migrations` in order.
   - In the Supabase dashboard: SQL Editor -> run each migration file.
   - If you use the Supabase CLI, keep migrations in sync with the `supabase` directory.

## Environment Variables
Use `.env.local.example` for the full list. Required variables:

Public (browser):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_ENV` (optional but recommended)

Server-only:
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `AUTH_USER`
- `AUTH_PASS`

Notes:
- `AUTH_USER` and `AUTH_PASS` protect the UI (basic auth). This does not replace Supabase Auth.
- RLS policies require authenticated Supabase sessions for data access.

## Vercel Configuration
1. Create a new Vercel project from this repository.
2. Configure the build settings:
   - Install command: `pnpm install`
   - Build command: `pnpm run build`
   - Output: default (Next.js)
3. Add all environment variables from the list above in the Vercel project settings.
4. For preview/staging environments, use `.env.staging.example` as a guide.
5. For production, use `.env.production.example` and set `NEXT_PUBLIC_APP_ENV=production`.

## Health Check
After deploy, verify:
- `GET /api/health` returns `{ "ok": true }` and a Supabase connectivity check.

## Migration Steps (Deployments)
1. Review new migration files under `supabase/migrations`.
2. Apply them to Supabase in order (timestamped filenames).
3. Verify RLS policies and indexes are present.
4. Smoke test:
   - Load the app
   - Sign in via Supabase Auth
   - Upload a photo and verify it appears in the timeline

## Rollback Notes
- Supabase migrations are forward-only; create follow-up migrations to roll back changes if needed.
- If a deploy fails, revert to the prior Vercel deployment and re-apply migrations carefully.
