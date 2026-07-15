import { describe, expect, it } from "vitest";
import { APP_ICON_SRC, APP_NAME } from "./brand";

describe("brand", () => {
  it("exposes Cubi name and public icon path", () => {
    expect(APP_NAME).toBe("Cubi");
    expect(APP_ICON_SRC).toBe("/cubi-icon.png");
  });
});
