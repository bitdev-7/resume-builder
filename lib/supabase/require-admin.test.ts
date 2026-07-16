import { describe, expect, it } from "vitest";
import { parseAdminActivityTab } from "@/lib/supabase/require-admin";

describe("parseAdminActivityTab", () => {
  it("defaults to bids", () => {
    expect(parseAdminActivityTab(null)).toBe("bids");
    expect(parseAdminActivityTab("")).toBe("bids");
    expect(parseAdminActivityTab("nope")).toBe("bids");
  });

  it("accepts bids and ai", () => {
    expect(parseAdminActivityTab("bids")).toBe("bids");
    expect(parseAdminActivityTab("ai")).toBe("ai");
  });
});
