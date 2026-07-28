import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/help/google-search-console")({
  component: GoogleSearchConsoleHelpPage,
});

function GoogleSearchConsoleHelpPage() {
  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-3">
            <h1 className="text-2xl font-semibold">
              Connect Google Search Console
            </h1>
            <p className="text-sm text-base-content/70">
              Connecting Google Search Console unlocks your real Google search
              performance inside OneTime SEO — clicks, impressions, CTR, and
              average position for every page and query, straight from Google.
            </p>
          </div>
        </div>

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-4">
            <h2 className="card-title text-base">Steps</h2>
            <ol className="list-decimal pl-5 text-sm space-y-3 text-base-content/80">
              <li>
                Click <strong>Connect Google Search Console</strong> — you'll
                see it during onboarding and on the Search Console card.
              </li>
              <li>
                Sign in with the Google account that has access to your Search
                Console property.
              </li>
              <li>
                Approve the permission request. OneTime SEO only reads your
                data — it never changes anything in Search Console or on your
                site.
              </li>
              <li>Pick the property you want to track, and you're done.</li>
            </ol>
          </div>
        </div>

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-2 text-sm text-base-content/75">
            <h2 className="card-title text-base">
              "Google hasn't verified this app"
            </h2>
            <p>
              You may see this warning while Google's verification of the app is
              still pending — it's expected and safe to proceed.
            </p>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-base-content/80">
              <li>
                Click <strong>Advanced</strong> on the warning screen.
              </li>
              <li>
                Click <strong>Go to OneTime SEO</strong> to continue signing in.
              </li>
            </ol>
          </div>
        </div>

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-2 text-sm text-base-content/75">
            <h2 className="card-title text-base">Troubleshooting</h2>
            <ul className="list-disc pl-5 space-y-2 text-sm text-base-content/80">
              <li>
                <strong>Your property is missing from the list?</strong> Make
                sure it's verified in Google Search Console and that you're
                signing in with the same Google account that has access to it.
              </li>
              <li>
                <strong>Connection expired?</strong> Reconnect from the Search
                Console card — the same <strong>Connect Google Search
                Console</strong> button will restore it.
              </li>
            </ul>
            <p>
              Learn more about OneTime SEO at{" "}
              <a
                className="link link-primary"
                href="https://onetimesuite.com"
                target="_blank"
                rel="noreferrer"
              >
                onetimesuite.com
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
