import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ChartColumn,
  Check,
  Coins,
  Infinity as InfinityIcon,
  KeyRound,
  Link2,
  Radar,
  Search,
  Sparkles,
  Stethoscope,
  Terminal,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// The landing page IS the checkout bounce in whop mode, so the two plan
// checkout URLs are fixed product URLs — one per tier, matching the Whop
// product setup (monthly subscription + lifetime BYOK).
export const WHOP_MONTHLY_CHECKOUT_URL =
  "https://whop.com/checkout/plan_KfGwx4oa2R7Eb";
export const WHOP_LIFETIME_CHECKOUT_URL =
  "https://whop.com/checkout/plan_EF4Wcn4KXZSAM";

// The landing is a marketing page, so it forces its own dark theme (near-black
// + emerald accent) with explicit Tailwind colors instead of daisyUI theme
// tokens — it must look identical regardless of the user's app theme.
const PRIMARY_CTA =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400";
const SECONDARY_CTA =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-white/20 hover:bg-white/10";

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Search,
    title: "Keyword research",
    body: "Search volume, difficulty, trends, and live SERP results — for Google, Bing, and YouTube.",
  },
  {
    icon: TrendingUp,
    title: "Rank tracking",
    body: "Scheduled checks on the keywords you care about, with position history over time.",
  },
  {
    icon: Link2,
    title: "Backlinks",
    body: "Your full backlink profile plus your competitors' — see who links to them and not to you.",
  },
  {
    icon: Radar,
    title: "Competitor intelligence",
    body: "Enter any domain and see what it ranks for, which pages drive its traffic, and where you can win.",
  },
  {
    icon: Stethoscope,
    title: "Site audits",
    body: "Technical SEO crawls plus Lighthouse scores — find what's slowing you down or blocking indexing.",
  },
  {
    icon: Sparkles,
    title: "AI visibility",
    body: "See how AI assistants talk about your brand: share of voice, cited sources, and a prompt explorer.",
  },
  {
    icon: ChartColumn,
    title: "Search Console integration",
    body: "Connect Google Search Console for your real clicks, impressions, and CTR next to the estimates.",
  },
  {
    icon: Terminal,
    title: "MCP server for AI agents",
    body: "Query your SEO data straight from Claude, Cursor, or any MCP-compatible agent.",
  },
];

function SectionHeading({
  kicker,
  title,
  sub,
}: {
  kicker: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="space-y-3 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
        {kicker}
      </p>
      <h2 className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
        {title}
      </h2>
      {sub ? <p className="mx-auto max-w-2xl text-zinc-400">{sub}</p> : null}
    </div>
  );
}

function CreditsMeterVisual() {
  return (
    <svg
      viewBox="0 0 280 40"
      className="mt-2 w-full"
      role="img"
      aria-label="Credits meter: 2,140 of 3,000 monthly credits remaining"
    >
      <text x="0" y="12" fontSize="11" fill="#a1a1aa" fontFamily="system-ui, sans-serif">
        Monthly bundle
      </text>
      <text
        x="280"
        y="12"
        textAnchor="end"
        fontSize="11"
        fill="#34d399"
        fontFamily="system-ui, sans-serif"
      >
        2,140 / 3,000 left
      </text>
      <rect x="0" y="22" width="280" height="8" rx="4" fill="rgba(255,255,255,0.08)" />
      <rect x="0" y="22" width="200" height="8" rx="4" fill="#10b981" />
    </svg>
  );
}

function TopUpsVisual() {
  return (
    <svg
      viewBox="0 0 280 40"
      className="mt-2 w-full"
      role="img"
      aria-label="Top-up credits stack up and never expire"
    >
      <text x="0" y="12" fontSize="11" fill="#a1a1aa" fontFamily="system-ui, sans-serif">
        Top-ups from $10
      </text>
      <text
        x="280"
        y="12"
        textAnchor="end"
        fontSize="11"
        fill="#34d399"
        fontFamily="system-ui, sans-serif"
      >
        never expire
      </text>
      <rect x="0" y="22" width="280" height="8" rx="4" fill="rgba(16,185,129,0.18)" />
      <rect x="0" y="22" width="176" height="8" rx="4" fill="rgba(16,185,129,0.45)" />
      <rect x="0" y="22" width="92" height="8" rx="4" fill="#10b981" />
    </svg>
  );
}

function PayOnceVisual() {
  return (
    <svg
      viewBox="0 0 280 40"
      className="mt-2 w-full"
      role="img"
      aria-label="One payment, then lifetime access"
    >
      <text x="0" y="12" fontSize="11" fill="#a1a1aa" fontFamily="system-ui, sans-serif">
        One payment
      </text>
      <text
        x="280"
        y="12"
        textAnchor="end"
        fontSize="11"
        fill="#34d399"
        fontFamily="system-ui, sans-serif"
      >
        lifetime access
      </text>
      <line
        x1="28"
        y1="26"
        x2="276"
        y2="26"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="2"
        strokeDasharray="1 7"
        strokeLinecap="round"
      />
      <circle cx="14" cy="26" r="9" fill="none" stroke="#10b981" strokeOpacity="0.3" />
      <circle cx="14" cy="26" r="5" fill="#10b981" />
    </svg>
  );
}

export function LandingPage({ signedIn = false }: { signedIn?: boolean }) {
  return (
    // `h-[100dvh]` (not `min-h`) + `overflow-y-auto` is what makes this page
    // scrollable: app.css locks html/body to `height: 100%; overflow: hidden`
    // and the app shell normally provides the scroll container, but in whop
    // mode this page renders bare — so it must constrain its own height and
    // scroll internally, exactly like AuthPageShell does.
    <div className="relative h-[100dvh] overflow-y-auto bg-zinc-950 text-zinc-300 antialiased">
      {/* Backdrop: faint grid + emerald glow, clipped to the hero area */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[760px]"
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:54px_54px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black_25%,transparent_75%)]" />
        <div className="absolute left-1/2 top-[-160px] h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[120px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center gap-24 px-4 py-16 sm:gap-32 sm:py-24">
        {/* 1 — Hero */}
        <section className="flex w-full flex-col items-center gap-12 pt-4 text-center sm:pt-10">
          <div className="flex flex-col items-center gap-8">
            <img
              src="/onetime-seo-logo.svg"
              alt="OneTime SEO"
              className="h-12 w-auto rounded-lg ring-1 ring-white/10"
            />
            <div className="space-y-5">
              <h1 className="text-4xl font-bold tracking-tight text-zinc-50 sm:text-6xl">
                OneTime SEO
              </h1>
              <p className="text-xl font-medium text-zinc-200 sm:text-2xl">
                The full SEO data suite without the subscription.
              </p>
              <p className="mx-auto max-w-2xl text-base text-zinc-400 sm:text-lg">
                Keyword research, rank tracking, backlinks, competitor intel,
                site audits, and AI visibility — pay only for the data you
                actually pull.
              </p>
            </div>
          </div>

          {signedIn ? (
            <div className="w-full max-w-xl rounded-lg border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-left text-sm text-amber-200">
              You&apos;re signed in, but your Whop account doesn&apos;t have an
              active OneTime SEO membership yet. Complete your purchase below to
              get access.
            </div>
          ) : null}

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <a className={PRIMARY_CTA} href={WHOP_MONTHLY_CHECKOUT_URL}>
              Start for $30/mo
              <ArrowRight className="size-4" />
            </a>
            {!signedIn ? (
              <Link to="/sign-in" className={SECONDARY_CTA}>
                Sign in with Whop
              </Link>
            ) : null}
          </div>

          <div className="relative w-full max-w-4xl">
            <div
              aria-hidden
              className="absolute -inset-x-12 -top-10 h-48 rounded-full bg-emerald-500/10 blur-3xl"
            />
            <img
              src="/landing-hero.svg"
              alt="OneTime SEO dashboard preview"
              className="relative w-full"
            />
          </div>
        </section>

        {/* 2 — Feature grid */}
        <section className="flex w-full flex-col gap-12">
          <SectionHeading
            kicker="The data you can pull"
            title="Every dataset the big suites sell you"
            sub="One workspace for the research, monitoring, and auditing an SEO workflow actually needs."
          />
          <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-emerald-500/30 hover:bg-white/[0.05]"
              >
                <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
                  <Icon className="size-5 text-emerald-400" />
                </div>
                <h3 className="font-semibold text-zinc-50">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* 3 — The math */}
        <section className="flex w-full flex-col gap-12">
          <SectionHeading
            kicker="The math"
            title="Stop paying for seats and bundles you don't use"
            sub="Ahrefs and Semrush charge ~$100+/month whether you open the app or not — over $1,200/year for most plans, before add-ons."
          />
          <div className="grid w-full gap-4 md:grid-cols-3">
            <div className="flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-white/20 hover:bg-white/[0.05]">
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
                <Coins className="size-5 text-emerald-400" />
              </div>
              <h3 className="font-semibold text-zinc-50">
                Credits that only burn on use
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                $30/month buys a 3,000-credit bundle. Credits burn when you pull
                data — a keyword lookup, a SERP page, a backlink report. Light
                users pay light.
              </p>
              <div className="mt-auto pt-4">
                <CreditsMeterVisual />
              </div>
            </div>
            <div className="flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-white/20 hover:bg-white/[0.05]">
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
                <InfinityIcon className="size-5 text-emerald-400" />
              </div>
              <h3 className="font-semibold text-zinc-50">
                Top-ups never expire
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                Need more mid-month? Top up from $10 to $1,000 — or any custom
                amount — and the credits stay until you spend them.
              </p>
              <div className="mt-auto pt-4">
                <TopUpsVisual />
              </div>
            </div>
            <div className="flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-white/20 hover:bg-white/[0.05]">
              <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
                <KeyRound className="size-5 text-emerald-400" />
              </div>
              <h3 className="font-semibold text-zinc-50">
                Or skip metering entirely
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                Pay $599 once, bring your own DataForSEO key, and use OneTime
                SEO forever — no subscription, no credits, no monthly fees.
              </p>
              <div className="mt-auto pt-4">
                <PayOnceVisual />
              </div>
            </div>
          </div>
        </section>

        {/* 4 — Pricing */}
        <section className="flex w-full flex-col gap-12">
          <SectionHeading
            kicker="Pricing"
            title="Two ways in, no lock-in either way"
          />
          <div className="grid w-full gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-6 rounded-xl border border-white/10 bg-white/[0.03] p-8 transition-colors hover:border-white/20">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-zinc-50">Monthly</h3>
                <p>
                  <span className="text-4xl font-bold tracking-tight text-zinc-50">
                    $30
                  </span>
                  <span className="text-zinc-500">/month</span>
                </p>
                <p className="text-sm text-zinc-400">Credits included.</p>
              </div>
              <ul className="space-y-2.5 text-sm text-zinc-300">
                {[
                  "3,000-credit bundle every month",
                  "Credits only burn when you pull data",
                  "Top-up packs from $10, never expiring",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                className={`${PRIMARY_CTA} mt-auto w-full`}
                href={WHOP_MONTHLY_CHECKOUT_URL}
              >
                Subscribe — $30/month
              </a>
            </div>

            <div className="flex flex-col gap-6 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-8 shadow-[0_0_80px_-20px_rgba(16,185,129,0.35)] transition-colors hover:border-emerald-500/50">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-zinc-50">Lifetime</h3>
                <p>
                  <span className="text-4xl font-bold tracking-tight text-zinc-50">
                    $599
                  </span>
                  <span className="text-zinc-500"> once</span>
                </p>
                <p className="text-sm text-zinc-400">Pay once, use forever.</p>
              </div>
              <ul className="space-y-2.5 text-sm text-zinc-300">
                {[
                  "Bring your own DataForSEO key",
                  "No subscription, no monthly fees",
                  "All future updates included",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                className={`${SECONDARY_CTA} mt-auto w-full`}
                href={WHOP_LIFETIME_CHECKOUT_URL}
              >
                Buy lifetime — $599
              </a>
            </div>
          </div>

          {!signedIn ? (
            <div className="text-center text-sm text-zinc-500">
              Already a member?{" "}
              <Link
                to="/sign-in"
                className="text-emerald-400 underline-offset-4 transition hover:text-emerald-300 hover:underline"
              >
                Sign in with Whop
              </Link>
            </div>
          ) : null}
        </section>

        {/* 5 — Footer */}
        <footer className="w-full border-t border-white/10 pt-8 pb-4 text-center text-sm text-zinc-500">
          Part of{" "}
          <a
            href="https://onetimesuite.com"
            className="text-zinc-300 transition hover:text-emerald-400"
            target="_blank"
            rel="noreferrer"
          >
            OneTimeSuite.com
          </a>{" "}
          — pay-once software.
        </footer>
      </div>
    </div>
  );
}
