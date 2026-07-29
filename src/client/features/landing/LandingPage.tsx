import { Link } from "@tanstack/react-router";

// The landing page IS the checkout bounce in whop mode, so the two plan
// checkout URLs are fixed product URLs — one per tier, matching the Whop
// product setup (monthly subscription + lifetime BYOK).
export const WHOP_MONTHLY_CHECKOUT_URL =
  "https://whop.com/checkout/plan_KfGwx4oa2R7Eb";
export const WHOP_LIFETIME_CHECKOUT_URL =
  "https://whop.com/checkout/plan_EF4Wcn4KXZSAM";

export function LandingPage({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <div className="min-h-[100dvh] bg-base-200 flex flex-col items-center overflow-y-auto p-4">
      <div className="m-auto flex w-full max-w-3xl flex-col items-center gap-10 py-10">
        <div className="text-center space-y-4">
          <img
            src="/onetime-seo-logo.svg"
            alt="OneTime SEO"
            className="mx-auto h-14 w-auto rounded-xl"
          />
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold">OneTime SEO</h1>
            <p className="mx-auto max-w-xl text-base-content/70">
              A Semrush/Ahrefs-style SEO suite — keyword research, rank
              tracking, backlinks, site audits, and AI visibility.
            </p>
          </div>
        </div>

        {signedIn ? (
          <div className="alert alert-warning w-full max-w-xl text-sm">
            <span>
              You&apos;re signed in, but your Whop account doesn&apos;t have an
              active OneTime SEO membership yet. Complete your purchase below
              to get access.
            </span>
          </div>
        ) : null}

        <div className="grid w-full gap-4 md:grid-cols-2">
          <div className="card bg-base-100 border border-base-300">
            <div className="card-body gap-4">
              <div className="space-y-1">
                <h2 className="card-title">Monthly</h2>
                <p>
                  <span className="text-3xl font-bold">$30</span>
                  <span className="text-base-content/60">/month</span>
                </p>
                <p className="text-sm text-base-content/70">
                  Everything included.
                </p>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-base-content/80">
                <li>Monthly credit bundle for SEO data</li>
                <li>Credits reset every month</li>
                <li>Top-up packs available anytime</li>
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
                <h2 className="card-title">Lifetime</h2>
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
          <Link to="/sign-in" className="btn btn-soft">
            Sign in with Whop
          </Link>
        ) : null}
      </div>
    </div>
  );
}
