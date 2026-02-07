# Contributing

Thanks for contributing! This project follows a simple workflow focused on small, reviewable changes.

## Setup
```bash
pnpm install
pnpm dev
```

Copy one of the example env files to `.env.local` and fill in real values:
- `.env.local.example`
- `.env.development.example`
- `.env.staging.example`
- `.env.production.example`

## Scripts
- `pnpm dev` - start the dev server
- `pnpm build` - build for production
- `pnpm lint` - lint the codebase
- `pnpm typecheck` - run TypeScript checks
- `pnpm test` - run tests (currently a placeholder)

## Branching
- Create a feature branch from `main`
- Keep PRs focused and small
- Avoid committing generated files unless required

## Pull Requests
- Describe the problem and the solution
- Include screenshots for UI changes
- List any new environment variables or migrations

## Quality Bar
Before opening a PR:
```bash
pnpm typecheck
pnpm lint
pnpm test
```

## Migrations
- Add new SQL migrations under `supabase/migrations`
- Use timestamped filenames
- Document how to apply them in your PR description
