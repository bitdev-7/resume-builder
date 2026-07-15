import { describe, expect, it } from "vitest";
import { nextStatusAfterOpen } from "./jobs";

describe("nextStatusAfterOpen", () => {
  it("promotes unapplied to opened", () => {
    expect(nextStatusAfterOpen("unapplied")).toBe("opened");
  });

  it("leaves applied alone", () => {
    expect(nextStatusAfterOpen("applied")).toBe("applied");
  });
});
