import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { getAuth, hasHostedAuthConfig, hasWhopAuthConfig } from "@/lib/auth";
import { isHostedAuthMode, isWhopAuthMode } from "@/lib/auth-mode";

async function handleAuthRequest(request: Request) {
  const whop = isWhopAuthMode(env.AUTH_MODE);
  if (!isHostedAuthMode(env.AUTH_MODE) && !whop) {
    return new Response("Not found", {
      status: 404,
    });
  }

  if (whop ? !hasWhopAuthConfig() : !hasHostedAuthConfig()) {
    return new Response("Missing Better Auth configuration", {
      status: 500,
    });
  }

  const auth = getAuth();
  return auth.handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        return handleAuthRequest(request);
      },
      POST: async ({ request }: { request: Request }) => {
        return handleAuthRequest(request);
      },
    },
  },
});
