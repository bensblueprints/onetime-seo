# Docs Rebrand Report — OneTime SEO

Task: rewrite GitHub-facing documentation so nothing user-facing pushes readers to the original builder (every-app/open-seo, openseo.so, Discord/X/community).

## Files rewritten

- `README.md` — replaced `WHOP_CHECKOUT_URL` placeholder with the real checkout link (https://whop.com/checkout/plan_LBrhuz3LSe743); removed the leftover `# OpenSEO` heading; expanded "Hosted Version" to describe the actual model ($199 one-time on Whop, sign in with Whop at seo.onetimesuite.com, bring your own DataForSEO key set in Settings); stripped upstream's `?aff=255379` DataForSEO affiliate param. Attribution section kept as-is (justified upstream credit).
- `docs/DATAFORSEO_API_KEY.md` — OpenSEO → OneTime SEO; removed upstream affiliate params from DataForSEO links.
- `docs/SELF_HOSTING_CLOUDFLARE.md` — OpenSEO → OneTime SEO; Deploy-to-Cloudflare button now points at `bensblueprints/onetime-seo`.
- `docs/SELF_HOSTING_CLOUDFLARE_MANUAL.md` — clone/fork instructions now use `bensblueprints/onetime-seo`; Cloudflare resource names (`open-seo-YOUR_SUFFIX`) kept because they must match `wrangler.jsonc` (worker/D1/R2 names are still `open-seo` there).
- `docs/SELF_HOSTING_CLOUDFLARE_OPERATIONS.md` — OpenSEO → OneTime SEO; update flow now tracks `https://github.com/bensblueprints/onetime-seo.git` as the upstream remote; `OPENSEO_TELEMETRY_DISABLED` env var name unchanged per instructions.
- `docs/SELF_HOSTING_DOCKER.md` — OpenSEO → OneTime SEO. GHCR image `ghcr.io/every-app/open-seo:latest` and compose service name `open-seo` intentionally kept — they match `compose.yaml` and `.env.example`, which still reference the upstream-published image (no fork image is published).
- `docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md` — OpenSEO → OneTime SEO; example redirect domain `your-openseo-domain.com` → `your-onetime-seo-domain.com`.
- `docs/LOCAL_DEVELOPMENT.md` — portless URLs `open-seo.localhost:1355` → `onetime-seo.localhost:1355` (portless derives the hostname from the package name, now `onetime-seo`).
- `docs/LOCAL_POSTGRES.md` — title/intro renamed; `openseo` container/user/db credentials kept (free-choice command values; changing them adds no value and risks divergence).
- `docs/CONTRIBUTING.md` — rewritten as a short fork page: repo is `bensblueprints/onetime-seo`, fork of `every-app/open-seo` (MIT, attribution kept); core contributions go upstream; OneTime SEO product issues go to support@onetimesuite.com; upstream Discord link removed.
- `docs/MAINTAINERS.md` — rewritten as short fork maintainer notes (upstream sync policy + release-notes workflow); "watch the repo for releases" pitch to end users removed.
- `src/routes/_app/ai.tsx` — skill install commands now point at `bensblueprints/onetime-seo` (all 7 skills listed in `SKILL_NAMES` exist in this repo under `.agents/skills/`, so the commands work against the fork).
- `src/routes/_app/support.tsx` — `GITHUB_URL` now `https://github.com/bensblueprints/onetime-seo` (the "GitHub Issues" card no longer sends users to the original builder's tracker).
- `src/shared/gsc.ts` — `GSC_SELF_HOSTED_SETUP_DOCS_URL` now points at this repo's `docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md`.

## Files deleted

- `docs/PREVIEW_DEPLOYMENTS.md` — upstream-internal Alchemy preview/Access process (references `app.openseo.so` prod).
- `docs/EveryAppLearnings.md` — upstream-internal learnings doc.
- `docs/site-audit-pm-research.md` — upstream-internal PM research.
- `docs/default-project-cleanup.md` — upstream-internal migration runbook (references hosted-production signup disabling).
- `docs/self-host-auth-mode-spec.md` — deleted; the file was already empty (0 bytes) in the repo, nothing to preserve or rewrite.

Dangling references to deleted docs were repointed to the upstream copies (still valid there) in: `alchemy.run.ts`, `alchemy.preview-access.run.ts`, `.github/workflows/pr-preview.yml`, `scripts/d1-default-project-cleanup.ts` (comment + printed CLI message), `scripts/cleanup-default-projects.sql`. Historical mention in `release-notes/v0.0.14.md` left untouched (historical record).

## References intentionally left

- `README.md` attribution block and `docs/CONTRIBUTING.md`/`docs/MAINTAINERS.md` upstream links — required MIT attribution; per task rules.
- `ghcr.io/every-app/open-seo` image name in `docs/SELF_HOSTING_DOCKER.md` — matches `compose.yaml`/`.env.example`; no fork image exists. Changing the doc without publishing a fork image would break the quickstart.
- `open-seo` Cloudflare resource names in the Cloudflare docs — must match `wrangler.jsonc` (`"name": "open-seo"`, D1 `open-seo`, R2 `open-seo`).
- `openseo` Postgres credentials in `docs/LOCAL_POSTGRES.md` — command values, kept per "commands stay as-is".
- `OPENSEO_TELEMETRY_DISABLED` env var — kept per instructions.
- `src/` test fixtures using `app.openseo.so` / `open-seo.test` (`*.test.ts`) and internal system placeholder emails `system@openseo.so`, `system-onboarding@openseo.so` in `scheduledRankChecks.ts` / `OnboardingChatAgent.ts` — not user-visible; out of scope for a docs pass.
- `src/server/features/onboarding/openseo-fact-sheet.md` line 60 states the open-source repo URL (`github.com/every-app/open-seo`) — factual upstream attribution in agent context; left as-is.
- `src/lib/auth.ts` trusted origins still list `open-seo.localhost:1355` — see concerns.
- `SAM_GITHUB_URL` in `ai.tsx` points at `every-app/sam` — a different upstream tool, not open-seo; left as-is.
- `docs/superpowers/` untouched per instructions.

## Verification

- `grep -rni "openseo\.so" docs/ README.md src/ | grep -v superpowers` → only test fixtures (`src/**/*.test.ts`) and the two internal `system*@openseo.so` placeholder emails. Nothing user-visible.
- `grep -rni "open-seo\|openseo" docs/ README.md | grep -v superpowers | grep -vi "OPENSEO_TELEMETRY_DISABLED"` → only justified references: upstream attribution (README, CONTRIBUTING, MAINTAINERS), GHCR image name matching compose.yaml, `open-seo` resource names matching wrangler.jsonc, `openseo` Postgres credentials in commands.
- `pnpm types:check` → passed (`tsc --noEmit`, no errors).
- `pnpm vitest run src/routes src/client` → **20 test files passed, 110 tests passed** (Duration 4.47s).

## Concerns

- `src/lib/auth.ts` (lines 189–192) still trusts `open-seo.localhost:1355` origins while `pnpm dev:agents` now serves `onetime-seo.localhost:1355` (package name changed to `onetime-seo`). Hosted-auth local testing against the portless URL may fail origin checks until those origins are updated — likely belongs to the src rebrand task, flagged here.
- Docker self-host docs still pull the upstream GHCR image; if a fork image is ever published under `bensblueprints/onetime-seo`, update `compose.yaml`, `.env.example`, and `docs/SELF_HOSTING_DOCKER.md` together.
- `scripts/d1-default-project-cleanup.ts` prints the upstream runbook URL to maintainers running the recovery script; acceptable (maintainer-facing), noted for completeness.
