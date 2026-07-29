import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { exploreContent } from "@/serverFunctions/keywords";
import type { ContentExplorerItem } from "@/types/keywords";

const SENTIMENT_BADGE: Record<string, string> = {
  positive: "badge-success",
  negative: "badge-error",
  neutral: "badge-ghost",
};

/**
 * Keyword-driven survey of the pages DataForSEO has indexed for a term
 * (content_analysis/search/live). Self-contained card: the query only fires
 * once a keyword is submitted, so just rendering it costs nothing.
 */
export function ContentExplorerCard({ projectId }: { projectId: string }) {
  const [draft, setDraft] = useState("");
  const [keyword, setKeyword] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["contentExplorer", projectId, keyword],
    queryFn: () =>
      exploreContent({ data: { projectId, keyword: keyword! } }),
    enabled: !!keyword,
  });

  const items = query.data?.items ?? [];
  const error = query.isError
    ? getStandardErrorMessage(query.error, "Failed to load content data.")
    : null;

  return (
    <section className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
      <div>
        <h2 className="text-base font-semibold">Content Explorer</h2>
        <p className="text-xs text-base-content/60">
          See the pages DataForSEO has indexed for a keyword, with content
          quality and sentiment.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const next = draft.trim();
          if (next) setKeyword(next);
        }}
      >
        <input
          type="text"
          className="input input-bordered input-sm flex-1"
          placeholder="Enter a keyword, e.g. standing desk"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Content Explorer keyword"
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={!draft.trim() || (query.isFetching && keyword === draft.trim())}
        >
          <Search className="size-3.5" />
          Explore
        </button>
      </form>

      {keyword && query.isLoading ? <ContentExplorerLoading /> : null}
      {error ? (
        <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
          {error}
        </div>
      ) : null}
      {query.isSuccess && items.length === 0 ? (
        <p className="text-sm text-base-content/50 text-center py-6">
          No indexed content found for “{query.data.requestedKeyword}”.
        </p>
      ) : null}
      {items.length > 0 ? (
        <>
          <div className="text-xs text-base-content/50">
            {query.data?.totalCount != null
              ? `${query.data.totalCount.toLocaleString()} pages indexed`
              : `${items.length} pages`}
          </div>
          <ContentExplorerTable items={items} />
        </>
      ) : null}
    </section>
  );
}

function ContentExplorerTable({ items }: { items: ContentExplorerItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table table-xs w-full">
        <thead>
          <tr className="text-xs text-base-content/60">
            <th>Page</th>
            <th className="w-16 text-right">Score</th>
            <th className="w-20">Sentiment</th>
            <th className="w-16 text-right">Shares</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.url} className="hover:bg-base-200/50">
              <td className="min-w-0 max-w-0">
                <div className="flex flex-col gap-0.5">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary hover:underline truncate flex items-center gap-1"
                    title={item.title}
                  >
                    {item.title || item.url}
                    <ExternalLink className="size-3 shrink-0 opacity-40" />
                  </a>
                  <span className="text-xs text-base-content/40 truncate">
                    {item.domain}
                  </span>
                </div>
              </td>
              <td className="text-right font-mono text-xs">
                {item.score ?? "—"}
              </td>
              <td>
                {item.sentiment ? (
                  <span
                    className={`badge badge-xs ${SENTIMENT_BADGE[item.sentiment] ?? "badge-ghost"}`}
                  >
                    {item.sentiment}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="text-right font-mono text-xs">
                {item.socialShares?.toLocaleString() ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContentExplorerLoading() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="h-8 rounded bg-base-200 animate-pulse"
          style={{ animationDelay: `${index * 50}ms` }}
        />
      ))}
    </div>
  );
}
