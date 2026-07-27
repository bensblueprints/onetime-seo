import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  env: { WHOP_CHECKOUT_URL: "https://whop.com/checkout/plan_123" },
}));

const { tryResolveWhopContext } = vi.hoisted(() => ({
  tryResolveWhopContext: vi.fn(),
}));
vi.mock("@/middleware/ensure-user/whop", () => ({ tryResolveWhopContext }));

// No server runtime exists in unit tests, so the server fn wrapper is reduced
// to its handler: createServerFn().handler(h) === h. getRequest stands in for
// the incoming request.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (handler: unknown) => handler }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("http://x/"),
}));

import { getWhopAccessStatus } from "./whop";

beforeEach(() => tryResolveWhopContext.mockReset());

describe("getWhopAccessStatus", () => {
  it("returns hasAccess true with no checkout url for members", async () => {
    tryResolveWhopContext.mockResolvedValue({ hasAccess: true });
    await expect(getWhopAccessStatus()).resolves.toEqual({
      hasAccess: true,
      checkoutUrl: null,
    });
    expect(tryResolveWhopContext).toHaveBeenCalledWith(expect.any(Headers));
  });

  it("returns the checkout url for non-members", async () => {
    tryResolveWhopContext.mockResolvedValue({ hasAccess: false });
    await expect(getWhopAccessStatus()).resolves.toEqual({
      hasAccess: false,
      checkoutUrl: "https://whop.com/checkout/plan_123",
    });
  });
});
