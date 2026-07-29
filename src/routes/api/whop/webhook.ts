import { createFileRoute } from "@tanstack/react-router";
import { handleWhopWebhookRequest } from "@/server/lib/whop/topup-webhook";

export const Route = createFileRoute("/api/whop/webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        return handleWhopWebhookRequest(request);
      },
    },
  },
});
