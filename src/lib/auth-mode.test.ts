import { describe, expect, it } from "vitest";
import { getAuthMode, isWhopAuthMode } from "./auth-mode";

describe("whop auth mode", () => {
  it("parses whop as a valid mode", () => {
    expect(getAuthMode("whop")).toBe("whop");
  });

  it("isWhopAuthMode is true only for whop", () => {
    expect(isWhopAuthMode("whop")).toBe(true);
    expect(isWhopAuthMode("hosted")).toBe(false);
    expect(isWhopAuthMode(undefined)).toBe(false);
  });

  it("still falls back to cloudflare_access for garbage", () => {
    expect(getAuthMode("nonsense")).toBe("cloudflare_access");
  });
});
