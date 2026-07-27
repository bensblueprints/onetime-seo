import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { isWhopClientAuthMode } from "@/lib/auth-mode";
import { getWhopAccessStatus } from "@/serverFunctions/whop";

export function useWhopAccessGuard() {
  const isWhopMode = isWhopClientAuthMode();
  const statusQuery = useQuery({
    queryKey: ["whop-access-status"],
    queryFn: () => getWhopAccessStatus(),
    enabled: isWhopMode,
    refetchInterval: 60 * 60 * 1000, // match the server cache TTL
    retry: false,
  });

  // The checkout URL always comes from the server (WHOP_CHECKOUT_URL env) —
  // never hardcode it client-side.
  const checkoutUrl = statusQuery.data?.checkoutUrl;
  useEffect(() => {
    if (checkoutUrl) {
      window.location.assign(checkoutUrl);
    }
  }, [checkoutUrl]);

  // Access denied but no checkout URL configured (missing WHOP_CHECKOUT_URL):
  // there's nowhere to redirect, so the route renders an error message
  // instead of leaving a blank page.
  const accessDeniedNoCheckout =
    isWhopMode &&
    statusQuery.data?.hasAccess === false &&
    !checkoutUrl;

  return {
    isWhopMode,
    canRenderApp: !isWhopMode || statusQuery.data?.hasAccess === true,
    accessDeniedNoCheckout,
  };
}
