import { useDomainWhoisTechQuery } from "@/client/features/domain/hooks/useDomainWhoisTechQuery";

function formatWhoisDate(value: string | null): string {
  // DataForSEO datetimes look like "2005-02-15 03:13:12 +00:00"; the date
  // portion is all a registrar row needs.
  return value ? value.slice(0, 10) : "—";
}

function formatStatus(registered: boolean | null): string {
  if (registered === true) return "Registered";
  if (registered === false) return "Expired";
  return "—";
}

function WhoisRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs uppercase tracking-wide text-base-content/60">
        {label}
      </span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

export function WhoisTechSection({
  projectId,
  domain,
}: {
  projectId: string;
  domain: string;
}) {
  // Supplementary panel: hide it entirely while loading or when the lookup
  // fails, rather than blocking the domain overview behind it.
  const query = useDomainWhoisTechQuery({ projectId, domain });
  const data = query.data;
  if (!data) return null;

  const { whois, contacts, technologies } = data;
  const hasContacts =
    contacts.emails.length > 0 || contacts.phoneNumbers.length > 0;
  if (whois === null && technologies.length === 0 && !hasContacts) {
    return null;
  }

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body p-4 gap-3">
        <h2 className="text-sm font-semibold">WHOIS &amp; Tech</h2>

        {whois !== null ? (
          <div className="flex flex-col gap-1.5">
            <WhoisRow label="Registrar" value={whois.registrar ?? "—"} />
            <WhoisRow
              label="Created"
              value={formatWhoisDate(whois.createdDatetime)}
            />
            <WhoisRow
              label="Updated"
              value={formatWhoisDate(
                whois.updatedDatetime ?? whois.changedDatetime,
              )}
            />
            <WhoisRow
              label="Expires"
              value={formatWhoisDate(whois.expirationDatetime)}
            />
            <WhoisRow label="Status" value={formatStatus(whois.registered)} />
          </div>
        ) : null}

        {hasContacts ? (
          <div className="flex flex-col gap-1.5">
            {[...contacts.emails, ...contacts.phoneNumbers].map((contact) => (
              <WhoisRow key={contact} label="Contact" value={contact} />
            ))}
          </div>
        ) : null}

        {technologies.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {technologies.map((name) => (
              <span key={name} className="badge badge-outline badge-sm">
                {name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
