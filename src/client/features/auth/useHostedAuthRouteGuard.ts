import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import {
  isEmailVerificationBypassed,
  isHostedClientAuthMode,
  isWhopClientAuthMode,
} from "@/lib/auth-mode";
import {
  getCurrentAuthRedirectFromHref,
  getSignInSearch,
  getVerifyEmailSearch,
} from "@/lib/auth-redirect";

export function useHostedAuthRouteGuard() {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const isHostedMode = isHostedClientAuthMode();
  const isWhopMode = isWhopClientAuthMode();
  // Whop mode gates the app behind a session just like hosted mode — the
  // only difference is that Whop OAuth emails are already verified upstream
  // (and Whop may leave emailVerified false on the better-auth user), so the
  // email-verification bounce must not apply there.
  const isGatedMode = isHostedMode || isWhopMode;
  const emailVerified =
    session?.user?.emailVerified === true || isEmailVerificationBypassed();

  useEffect(() => {
    if (isPending || !isGatedMode) {
      return;
    }

    const redirectTo = getCurrentAuthRedirectFromHref(window.location.href);

    if (!session?.user?.id) {
      if (isWhopMode) {
        // Whop mode keeps / public: the landing page there (pricing + "Sign
        // in with Whop") is the entry point for signed-out visitors, so gated
        // routes bounce to it instead of the bare sign-in form.
        void navigate({ to: "/", replace: true });
        return;
      }

      void navigate({
        to: "/sign-in",
        search: getSignInSearch(redirectTo),
        replace: true,
      });
      return;
    }

    if (!isWhopMode && !emailVerified) {
      void navigate({
        to: "/verify-email",
        search: getVerifyEmailSearch(session.user.email, redirectTo),
        replace: true,
      });
    }
  }, [
    isPending,
    isGatedMode,
    isWhopMode,
    emailVerified,
    session?.user?.email,
    session?.user?.id,
    navigate,
  ]);

  const hasGatedSession =
    !isPending &&
    Boolean(session?.user?.id) &&
    (isWhopMode || emailVerified);

  return {
    isHostedMode,
    canRenderAuthenticatedContent: !isGatedMode || hasGatedSession,
  };
}
