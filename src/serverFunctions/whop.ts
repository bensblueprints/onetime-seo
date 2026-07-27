import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { tryResolveWhopContext } from "@/middleware/ensure-user/whop";

// Registered WITHOUT the ensure-user middleware on purpose: that middleware
// throws WHOP_ACCESS_DENIED for non-members, but this endpoint exists to
// report exactly that state so the client can send the user to checkout.
// tryResolveWhopContext still throws UNAUTHENTICATED when there is no
// session, so unauthenticated callers get a normal auth error.
export const getWhopAccessStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const { hasAccess } = await tryResolveWhopContext(getRequest().headers);
    return {
      hasAccess,
      checkoutUrl: hasAccess ? null : (env.WHOP_CHECKOUT_URL?.trim() || null),
    };
  },
);
