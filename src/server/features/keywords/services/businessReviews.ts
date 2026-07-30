import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import type { BusinessReview, BusinessReviewsResult } from "@/types/keywords";

/**
 * Business Reviews: recent Google reviews for a local establishment
 * (business_data/google/reviews/live). One metered call per lookup; no cache —
 * the card is an on-demand survey, mirroring the Content Explorer service.
 */
export async function getBusinessReviews(
  input: {
    projectId: string;
    businessName: string;
    locationCode: number;
    languageCode: string;
    depth?: number;
  },
  billingCustomer: BillingCustomerContext,
): Promise<BusinessReviewsResult> {
  const businessName = input.businessName.trim();
  const dataforseo = await createDataforseoClient(billingCustomer);
  const result = await dataforseo.business.reviews({
    keyword: businessName,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    depth: input.depth,
    sortBy: "newest",
  });
  return {
    requestedBusiness: businessName,
    businessName: result.businessTitle,
    businessRating: result.businessRating,
    totalReviews: result.reviewsCount,
    reviews: result.items.map(
      (item): BusinessReview => ({
        id: item.review_id ?? null,
        author: item.profile_name ?? "Unknown",
        authorProfileUrl: item.profile_url ?? null,
        rating: item.rating?.value ?? null,
        text: item.review_text ?? null,
        publishedAt: item.timestamp ?? null,
        timeAgo: item.time_ago ?? null,
        ownerAnswer: item.owner_answer ?? null,
        reviewUrl: item.review_url ?? null,
      }),
    ),
  };
}
