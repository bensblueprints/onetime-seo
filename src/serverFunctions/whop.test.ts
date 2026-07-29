import { beforeEach, describe, expect, it, vi } from "vitest";

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
  it("returns hasAccess true for members", async () => {
    tryResolveWhopContext.mockResolvedValue({ hasAccess: true });
    await expect(getWhopAccessStatus()).resolves.toEqual({
      hasAccess: true,
    });
    expect(tryResolveWhopContext).toHaveBeenCalledWith(expect.any(Headers));
  });

  it("returns hasAccess false for non-members", async () => {
    tryResolveWhopContext.mockResolvedValue({ hasAccess: false });
    await expect(getWhopAccessStatus()).resolves.toEqual({
      hasAccess: false,
    });
  });
});
