import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { type ThemePreference, useThemePreference } from "@/client/lib/theme";
import { authClient, useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode, isWhopClientAuthMode } from "@/lib/auth-mode";
import {
  TOPUP_PRESET_CHECKOUT_URLS,
  createTopupCheckout,
  getCreditsBalance,
} from "@/serverFunctions/credits";
import {
  getOrgDataforseoKeyStatus,
  setOrgDataforseoKeyFn,
} from "@/serverFunctions/org-dataforseo-key";
import { version } from "../../../package.json";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
}[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

function SettingsPage() {
  const isHosted = isHostedClientAuthMode();
  const isWhop = isWhopClientAuthMode();
  const { themePreference, setThemePreference } = useThemePreference();
  const { data: session, isPending: isSessionPending } = useSession();
  const [isSaving, setIsSaving] = useState(false);

  const analyticsEnabled = session?.user?.analyticsOptedOut !== true;

  async function updateAnalyticsPreference(enabled: boolean) {
    setIsSaving(true);
    try {
      const result = await authClient.updateUser({
        analyticsOptedOut: !enabled,
      });
      if (result.error) {
        toast.error("We couldn't update your analytics setting.");
      } else {
        toast.success(enabled ? "Analytics enabled" : "Analytics disabled");
      }
    } catch {
      toast.error("We couldn't update your analytics setting.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-8 pb-24 md:px-6 md:py-12 md:pb-8">
      <div className="mx-auto max-w-xl space-y-10">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-base-content/50">
            Appearance
          </h2>
          <div className="flex items-center justify-between gap-6">
            <span className="text-sm">Theme</span>
            <div
              role="radiogroup"
              aria-label="Theme preference"
              className="flex gap-0.5 rounded-lg bg-base-200 p-0.5"
            >
              {THEME_OPTIONS.map((option) => {
                const isActive = option.value === themePreference;
                const Icon = option.icon;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    aria-label={option.label}
                    className={`flex cursor-pointer items-center justify-center rounded-md px-3 py-1.5 transition-colors ${
                      isActive
                        ? "bg-base-100 text-base-content shadow-sm"
                        : "text-base-content/50 hover:text-base-content/80"
                    }`}
                    onClick={() => setThemePreference(option.value)}
                  >
                    <Icon className="size-4" />
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {isHosted ? (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-base-content/50">
              Analytics
            </h2>
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm">Help improve OneTime SEO</p>
                <p className="mt-1 text-sm text-base-content/60">
                  Share analytics and usage data.
                </p>
              </div>
              <input
                type="checkbox"
                className="toggle toggle-primary"
                checked={analyticsEnabled}
                disabled={isSessionPending || isSaving || !session?.user}
                onChange={(event) => {
                  void updateAnalyticsPreference(event.currentTarget.checked);
                }}
                aria-label="Enable product analytics"
              />
            </div>
          </section>
        ) : (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-base-content/50">About</h2>
            <div className="flex items-center justify-between gap-6">
              <span className="text-sm">Version</span>
              <span className="font-mono text-sm text-base-content/60">
                v{version}
              </span>
            </div>
          </section>
        )}

        {isWhop ? <DataforseoKeySection /> : null}
        {isWhop ? <CreditsSection /> : null}
      </div>
    </div>
  );
}

function DataforseoKeySection() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");

  const statusQuery = useQuery({
    queryKey: ["org-dataforseo-key-status"],
    queryFn: () => getOrgDataforseoKeyStatus(),
  });
  const configured = statusQuery.data?.configured === true;

  const saveMutation = useMutation({
    mutationFn: (value: string) =>
      setOrgDataforseoKeyFn({ data: { apiKey: value } }),
    onSuccess: async (_result, value) => {
      setApiKey("");
      await queryClient.invalidateQueries({
        queryKey: ["org-dataforseo-key-status"],
      });
      toast.success(
        value.trim() ? "DataForSEO key saved" : "DataForSEO key removed",
      );
    },
    onError: (error) =>
      toast.error(
        getStandardErrorMessage(error, "Failed to save DataForSEO key"),
      ),
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (saveMutation.isPending) return;
    saveMutation.mutate(apiKey);
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-base-content/50">
        SEO data (DataForSEO)
      </h2>
      <p className="text-sm text-base-content/60">
        OneTime SEO uses your own DataForSEO account for SEO data. Create a key
        at dataforseo.io, then paste the base64 login:password value here.{" "}
        <Link to="/help/dataforseo-api-key" className="link link-primary">
          How to get your key
        </Link>
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="Paste your DataForSEO API key"
          maxLength={200}
          className="input input-bordered w-full"
          aria-label="DataForSEO API key"
        />
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-base-content/60">
            {statusQuery.isPending
              ? "Checking key status…"
              : configured
                ? "Key saved"
                : "No key saved — add one to run SEO queries"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => saveMutation.mutate("")}
              disabled={saveMutation.isPending || !configured}
            >
              Remove key
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={saveMutation.isPending || !apiKey.trim()}
            >
              Save key
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

function CreditsSection() {
  const [customAmount, setCustomAmount] = useState("");

  const balanceQuery = useQuery({
    queryKey: ["credits-balance"],
    queryFn: () => getCreditsBalance(),
  });
  const balance = balanceQuery.data;

  const customMutation = useMutation({
    mutationFn: (amountUsd: number) =>
      createTopupCheckout({ data: { custom: amountUsd } }),
    onSuccess: (result) => {
      if (result.note === "rounded") {
        toast.info(
          "Custom amounts aren't available right now — rounded up to the nearest pack.",
        );
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    },
    onError: (error) =>
      toast.error(
        getStandardErrorMessage(error, "Failed to start credit checkout"),
      ),
  });

  // BYOK orgs (and non-subscription contexts) have no metered credits — the
  // balance serverFn reports enabled: false and the section stays hidden.
  if (!balance?.enabled) return null;

  const parsedCustom = Number(customAmount);
  const customValid =
    Number.isInteger(parsedCustom) && parsedCustom >= 1 && parsedCustom <= 10000;

  const handleCustomSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (customMutation.isPending || !customValid) return;
    customMutation.mutate(parsedCustom);
  };

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-base-content/50">Credits</h2>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-6">
          <span>Monthly bundle</span>
          <span className="text-base-content/60">
            {balance.monthlyCredits.toLocaleString()} /{" "}
            {balance.monthlyBundleCredits.toLocaleString()} credits left
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span>Bundle resets</span>
          <span className="text-base-content/60">
            {new Date(balance.resetAt).toLocaleDateString()}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span>Top-up balance</span>
          <span className="text-base-content/60">
            {balance.topupCredits.toLocaleString()} credits
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(TOPUP_PRESET_CHECKOUT_URLS).map(([amount, url]) => (
          <a
            key={amount}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline btn-sm"
          >
            ${amount} pack
          </a>
        ))}
      </div>

      <form onSubmit={handleCustomSubmit} className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={10000}
          step={1}
          value={customAmount}
          onChange={(event) => setCustomAmount(event.target.value)}
          placeholder="Custom amount (USD)"
          className="input input-bordered input-sm w-44"
          aria-label="Custom top-up amount in USD"
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={customMutation.isPending || !customValid}
        >
          Buy
        </button>
      </form>

      <p className="text-sm text-base-content/60">
        Your balance updates after payment completes.
      </p>
    </section>
  );
}
