import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ChartColumn,
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
    <div className="space-y-2 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">
        {kicker}
      </p>
      <h2 className="text-2xl font-semibold sm:text-3xl">{title}</h2>
      {sub ? (
        <p className="mx-auto max-w-2xl text-base-content/70">{sub}</p>
      ) : null}
    </div>
  );
}

export function LandingPage({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <div className="min-h-[100dvh] bg-base-200 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-20 px-4 py-16 sm:py-24">
        {/* 1 — Hero */}
        <section className="flex flex-col items-center gap-8 pt-6 text-center sm:pt-12">
          <div className="space-y-5">
            <img
              src="/onetime-seo-logo.svg"
              alt="OneTime SEO"
              className="mx-auto h-16 w-auto rounded-xl"
            />
            <div className="space-y-4">
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                OneTime SEO
              </h1>
              <p className="text-xl font-medium text-base-content/90 sm:text-2xl">
                The full SEO data suite without the subscription.
              </p>
              <p className="mx-auto max-w-2xl text-base-content/70">
                Keyword research, rank tracking, backlinks, competitor intel,
                site audits, and AI visibility — pay only for the data you
                actually pull.
              </p>
            </div>
          </div>

          {signedIn ? (
            <div className="alert alert-warning w-full max-w-xl text-sm">
              <span>
                You&apos;re signed in, but your Whop account doesn&apos;t have
                an active OneTime SEO membership yet. Complete your purchase
                below to get access.
              </span>
            </div>
          ) : null}

          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <a className="btn btn-primary" href={WHOP_MONTHLY_CHECKOUT_URL}>
              Start for $30/mo
              <ArrowRight className="size-4" />
            </a>
            {!signedIn ? (
              <Link to="/sign-in" className="btn btn-soft">
                Sign in with Whop
              </Link>
            ) : null}
          </div>
        </section>

        {/* 2 — Feature grid */}
        <section className="flex w-full flex-col gap-10">
          <SectionHeading
            kicker="The data you can pull"
            title="Every dataset the big suites sell you"
            sub="One workspace for the research, monitoring, and auditing an SEO workflow actually needs."
          />
          <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="card bg-base-100 border border-base-300"
              >
                <div className="card-body gap-2 p-5">
                  <Icon className="size-6 text-primary" />
                  <h3 className="font-semibold">{title}</h3>
                  <p className="text-sm text-base-content/70">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 3 — The math */}
        <section className="flex w-full flex-col gap-10">
          <SectionHeading
            kicker="The math"
            title="Stop paying for seats and bundles you don't use"
            sub="Ahrefs and Semrush charge ~$100+/month whether you open the app or not — over $1,200/year for most plans, before add-ons."
          />
          <div className="grid w-full gap-4 md:grid-cols-3">
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body gap-2">
                <Coins className="size-6 text-primary" />
                <h3 className="font-semibold">Credits that only burn on use</h3>
                <p className="text-sm text-base-content/70">
                  $30/month buys a 3,000-credit bundle. Credits burn when you
                  pull data — a keyword lookup, a SERP page, a backlink report.
                  Light users pay light.
                </p>
              </div>
            </div>
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body gap-2">
                <InfinityIcon className="size-6 text-primary" />
                <h3 className="font-semibold">Top-ups never expire</h3>
                <p className="text-sm text-base-content/70">
                  Need more mid-month? Top up from $10 to $1,000 — or any
                  custom amount — and the credits stay until you spend them.
                </p>
              </div>
            </div>
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body gap-2">
                <KeyRound className="size-6 text-primary" />
                <h3 className="font-semibold">Or skip metering entirely</h3>
                <p className="text-sm text-base-content/70">
                  Pay $599 once, bring your own DataForSEO key, and use OneTime
                  SEO forever — no subscription, no credits, no monthly fees.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 4 — Pricing */}
        <section className="flex w-full flex-col gap-10">
          <SectionHeading
            kicker="Pricing"
            title="Two ways in, no lock-in either way"
          />
          <div className="grid w-full gap-4 md:grid-cols-2">
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body gap-4">
                <div className="space-y-1">
                  <h3 className="card-title">Monthly</h3>
                  <p>
                    <span className="text-3xl font-bold">$30</span>
                    <span className="text-base-content/60">/month</span>
                  </p>
                  <p className="text-sm text-base-content/70">
                    Credits included.
                  </p>
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-base-content/80">
                  <li>3,000-credit bundle every month</li>
                  <li>Credits only burn when you pull data</li>
                  <li>Top-up packs from $10, never expiring</li>
                </ul>
                <a
                  className="btn btn-primary w-full mt-auto"
                  href={WHOP_MONTHLY_CHECKOUT_URL}
                >
                  Subscribe — $30/month
                </a>
              </div>
            </div>

            <div className="card bg-base-100 border border-base-300">
              <div className="card-body gap-4">
                <div className="space-y-1">
                  <h3 className="card-title">Lifetime</h3>
                  <p>
                    <span className="text-3xl font-bold">$599</span>
                    <span className="text-base-content/60"> once</span>
                  </p>
                  <p className="text-sm text-base-content/70">
                    Pay once, use forever.
                  </p>
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm text-base-content/80">
                  <li>Bring your own DataForSEO key</li>
                  <li>No subscription, no monthly fees</li>
                  <li>All future updates included</li>
                </ul>
                <a
                  className="btn btn-soft w-full mt-auto"
                  href={WHOP_LIFETIME_CHECKOUT_URL}
                >
                  Buy lifetime — $599
                </a>
              </div>
            </div>
          </div>

          {!signedIn ? (
            <div className="text-center text-sm text-base-content/60">
              Already a member?{" "}
              <Link to="/sign-in" className="link link-primary">
                Sign in with Whop
              </Link>
            </div>
          ) : null}
        </section>

        {/* 5 — Footer */}
        <footer className="pb-4 text-center text-sm text-base-content/50">
          Part of{" "}
          <a
            href="https://onetimesuite.com"
            className="link link-hover"
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
