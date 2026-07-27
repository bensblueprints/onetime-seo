import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useHostedAuthRouteGuard } from "@/client/features/auth/useHostedAuthRouteGuard";
import { useWhopAccessGuard } from "@/client/features/auth/useWhopAccessGuard";
import { AuthenticatedAppLayout } from "@/client/layout/AppShell";
import { useOnboardingRedirect } from "@/client/features/onboarding/useOnboardingRedirect";

export const Route = createFileRoute("/_app")({
  component: AppRouteLayout,
});

function AppRouteLayout() {
  const authGate = useHostedAuthRouteGuard();
  const whopGate = useWhopAccessGuard();
  useOnboardingRedirect();

  if (!authGate.canRenderAuthenticatedContent) {
    return null;
  }

  if (whopGate.accessDeniedNoCheckout) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-4">
        <p className="max-w-md text-center text-sm text-base-content/70">
          Your Whop account doesn&apos;t have an active OneTime SEO membership.{" "}
          Contact{" "}
          <a
            className="link"
            href="mailto:support@onetimesuite.com"
          >
            support@onetimesuite.com
          </a>
          .
        </p>
      </div>
    );
  }

  if (!whopGate.canRenderApp) {
    return null;
  }

  return (
    <AuthenticatedAppLayout>
      <Outlet />
    </AuthenticatedAppLayout>
  );
}
