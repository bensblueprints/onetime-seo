import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getOrgDataforseoKey,
  setOrgDataforseoKey,
} from "@/server/lib/dataforseo/org-key";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

export async function saveOrgDataforseoKey(
  organizationId: string,
  apiKey: string,
): Promise<{ configured: boolean }> {
  await setOrgDataforseoKey(organizationId, apiKey.trim());
  const stored = await getOrgDataforseoKey(organizationId);
  return { configured: Boolean(stored) };
}

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
