import { Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
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
  const pathname = useLocation({ select: (location) => location.pathname });

  // Whop mode keeps / public: signed-out visitors and signed-in non-members
  // see the landing page there. The guards above bounce every other gated
  // route to /, so only the index path renders through here.
  const isPublicWhopLanding = whopGate.isWhopMode && pathname === "/";

  if (!authGate.canRenderAuthenticatedContent) {
    return isPublicWhopLanding ? <Outlet /> : null;
  }

  if (!whopGate.canRenderApp) {
    return isPublicWhopLanding ? <Outlet /> : null;
  }

  return (
    <AuthenticatedAppLayout>
      <Outlet />
    </AuthenticatedAppLayout>
  );
}
