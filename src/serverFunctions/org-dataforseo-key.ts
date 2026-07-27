import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getOrgDataforseoKey,
  saveOrgDataforseoKey,
} from "@/server/lib/dataforseo/org-key";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

// Every reference to server-only modules must stay inside createServerFn
// handlers: plain exported helpers survive the client-bundle handler strip
// and pull the server module graph (db -> cloudflare:workers) into it.
export const getOrgDataforseoKeyStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => ({
    configured: Boolean(await getOrgDataforseoKey(context.organizationId)),
  }));

const setKeySchema = z.object({ apiKey: z.string().max(200) });

export const setOrgDataforseoKeyFn = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(setKeySchema)
  .handler(async ({ data, context }) =>
    saveOrgDataforseoKey(context.organizationId, data.apiKey),
  );
