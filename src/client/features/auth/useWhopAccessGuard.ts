import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { isWhopClientAuthMode } from "@/lib/auth-mode";
import { getWhopAccessStatus } from "@/serverFunctions/whop";

export const whopAccessStatusQueryOptions = () => ({
  queryKey: ["whop-access-status"] as const,
  queryFn: () => getWhopAccessStatus(),
  refetchInterval: 60 * 60 * 1000, // match the server cache TTL
  retry: false,
});

export function useWhopAccessGuard() {
  const navigate = useNavigate();
  const isWhopMode = isWhopClientAuthMode();
  const statusQuery = useQuery({
    ...whopAccessStatusQueryOptions(),
    enabled: isWhopMode,
  });

  const hasAccess = statusQuery.data?.hasAccess;

  // Non-members get bounced to the public landing page at / — its pricing
  // cards ARE the checkout bounce (this replaced the old WHOP_CHECKOUT_URL
  // redirect). At / itself the index route renders the landing page in its
  // "complete your purchase" state, so there's nothing to do there.
  useEffect(() => {
    if (hasAccess === false && window.location.pathname !== "/") {
      void navigate({ to: "/", replace: true });
    }
  }, [hasAccess, navigate]);

  return {
    isWhopMode,
    hasAccess,
    canRenderApp: !isWhopMode || hasAccess === true,
  };
}
