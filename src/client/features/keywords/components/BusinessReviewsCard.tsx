import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ExternalLink, Search, Star } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getBusinessReviews } from "@/serverFunctions/keywords";
import type { BusinessReview } from "@/types/keywords";

/**
 * Recent Google reviews for a local business
 * (business_data/google/reviews/live). Self-contained card: the query only
 * fires once a business name is submitted, so just rendering it costs nothing.
 * Location/language come from the project, resolved server-side.
 */
export function BusinessReviewsCard({ projectId }: { projectId: string }) {
  const [draft, setDraft] = useState("");
  const [business, setBusiness] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["businessReviews", projectId, business],
    queryFn: () =>
      getBusinessReviews({ data: { projectId, businessName: business! } }),
    enabled: !!business,
  });

  const reviews = query.data?.reviews ?? [];
  const error = query.isError
    ? getStandardErrorMessage(query.error, "Failed to load reviews.")
    : null;

  return (
    <section className="rounded-xl border border-base-300 bg-base-100 p-4 space-y-3">
      <div>
        <h2 className="text-base font-semibold">Business Reviews</h2>
        <p className="text-xs text-base-content/60">
          See the latest Google reviews for a local business, with ratings and
          owner responses.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const next = draft.trim();
          if (next) setBusiness(next);
        }}
      >
        <input
          type="text"
          className="input input-bordered input-sm flex-1"
          placeholder="Enter a business name, e.g. hedonism wines"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Business name"
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={
            !draft.trim() || (query.isFetching && business === draft.trim())
          }
        >
          <Search className="size-3.5" />
          Reviews
        </button>
      </form>

      {business && query.isLoading ? <ReviewsLoading /> : null}
      {error ? (
        <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
          {error}
        </div>
      ) : null}
      {query.isSuccess && reviews.length === 0 ? (
        <p className="text-sm text-base-content/50 text-center py-6">
          No reviews found for “{query.data.requestedBusiness}”.
        </p>
      ) : null}
      {reviews.length > 0 ? (
        <>
          <div className="flex items-center gap-2 text-xs text-base-content/50">
            <span className="font-medium text-base-content">
              {query.data?.businessName ?? query.data?.requestedBusiness}
            </span>
            {query.data?.businessRating != null ? (
              <span className="flex items-center gap-1">
                <StarRating rating={query.data.businessRating} />
                {query.data.businessRating.toFixed(1)}
              </span>
            ) : null}
            {query.data?.totalReviews != null
              ? `· ${query.data.totalReviews.toLocaleString()} reviews`
              : null}
          </div>
          <ul className="space-y-2">
            {reviews.map((review, index) => (
              <ReviewRow key={review.id ?? index} review={review} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function ReviewRow({ review }: { review: BusinessReview }) {
  return (
    <li className="rounded-lg border border-base-300 bg-base-200/40 p-3 space-y-1.5">
      <div className="flex items-center gap-2 text-xs">
        {review.authorProfileUrl ? (
          <a
            href={review.authorProfileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            {review.author}
          </a>
        ) : (
          <span className="font-medium">{review.author}</span>
        )}
        {review.rating != null ? <StarRating rating={review.rating} /> : null}
        <span className="ml-auto text-base-content/40">
          {review.timeAgo ?? formatReviewDate(review.publishedAt)}
        </span>
      </div>
      {review.text ? (
        <p className="text-sm text-base-content/80 line-clamp-3">
          {review.text}
        </p>
      ) : null}
      {review.ownerAnswer ? (
        <p className="text-xs text-base-content/60 border-l-2 border-base-300 pl-2 line-clamp-2">
          <span className="font-medium">Owner:</span> {review.ownerAnswer}
        </p>
      ) : null}
      {review.reviewUrl ? (
        <a
          href={review.reviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          View on Google
          <ExternalLink className="size-3 opacity-40" />
        </a>
      ) : null}
    </li>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`${rating} out of 5 stars`}
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={
            index < Math.round(rating)
              ? "size-3 fill-warning text-warning"
              : "size-3 text-base-content/20"
          }
        />
      ))}
    </span>
  );
}

function formatReviewDate(timestamp: string | null): string {
  if (!timestamp) return "";
  const date = new Date(timestamp.replace(" +00:00", "Z"));
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

function ReviewsLoading() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-16 rounded bg-base-200 animate-pulse"
          style={{ animationDelay: `${index * 50}ms` }}
        />
      ))}
    </div>
  );
}
