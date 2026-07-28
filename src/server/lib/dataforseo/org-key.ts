import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organization } from "@/db/schema";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";

// `symmetricEncrypt` accepts a plain string secret (it SHA-256-hashes it into
// the XChaCha20-Poly1305 key), so the raw BETTER_AUTH_SECRET works directly —
// no SecretConfig envelope needed.
async function getKeySecret(): Promise<string> {
  return getRequiredEnvValue("BETTER_AUTH_SECRET");
}

export async function setOrgDataforseoKey(
  organizationId: string,
  plaintextKey: string,
): Promise<void> {
  const trimmed = plaintextKey.trim();
  const value = trimmed
    ? await symmetricEncrypt({ key: await getKeySecret(), data: trimmed })
    : null;
  const updated = await db
    .update(organization)
    .set({ dataforseoApiKey: value })
    .where(eq(organization.id, organizationId))
    .returning({ id: organization.id });
  // TEMP DEBUG: remove after BYOK persistence investigation
  console.error(
    `[org-key] save org=${organizationId} rowsUpdated=${updated.length} hasValue=${value !== null}`,
  );
}

export async function getOrgDataforseoKey(
  organizationId: string,
): Promise<string | null> {
  const row = await db.query.organization.findFirst({
    where: eq(organization.id, organizationId),
  });
  if (!row?.dataforseoApiKey) {
    return null;
  }
  return symmetricDecrypt({
    key: await getKeySecret(),
    data: row.dataforseoApiKey,
  });
}

export async function saveOrgDataforseoKey(
  organizationId: string,
  apiKey: string,
): Promise<{ configured: boolean }> {
  await setOrgDataforseoKey(organizationId, apiKey.trim());
  const stored = await getOrgDataforseoKey(organizationId);
  return { configured: Boolean(stored) };
}
