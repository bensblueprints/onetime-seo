import { useQuery } from "@tanstack/react-query";
import { getDomainWhoisTech } from "@/serverFunctions/domain";

type Input = {
  projectId: string;
  domain: string;
};

export function useDomainWhoisTechQuery(input: Input) {
  const trimmedDomain = input.domain.trim();

  return useQuery({
    enabled: trimmedDomain !== "",
    queryKey: ["domain-whois-tech", input.projectId, trimmedDomain],
    queryFn: () =>
      getDomainWhoisTech({
        data: {
          projectId: input.projectId,
          domain: trimmedDomain,
        },
      }),
    staleTime: 5 * 60_000,
  });
}
