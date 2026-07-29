import type { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import type { WhopTier } from "@/server/lib/whop/access";

export type EnsuredProject = NonNullable<
  Awaited<ReturnType<typeof ProjectRepository.getProjectForOrganization>>
>;

export type EnsuredUserContext = {
  userId: string;
  userEmail: string;
  // True when the user's email is verified (hosted) or auth is delegated
  // (Cloudflare Access / local), where there is no unverified state. Used to
  // gate paid onboarding spend behind verification.
  emailVerified: boolean;
  organizationId: string;
  // Whop membership tier, set only in whop auth mode: "subscription" ($30/mo
  // plan, metered credits) or "byok" (lifetime / grandfathered plans).
  whopTier?: WhopTier;
  project?: EnsuredProject;
};
