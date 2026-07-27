import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { getOrgDataforseoKey } from "@/server/lib/dataforseo/org-key";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

export const getSeoApiKeyStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    // Configured when the org brings its own key (Settings) or the deployment
    // provides a shared one via the environment.
    const orgKey = await getOrgDataforseoKey(context.organizationId);
    const configured = Boolean(orgKey || env.DATAFORSEO_API_KEY?.trim());
    return { configured };
  });
