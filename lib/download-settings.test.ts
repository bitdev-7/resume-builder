import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOWNLOAD_BASE_PATH,
  joinClientDownloadPath,
  parseDownloadBasePath,
} from "./download-settings";
import { formatPdfSaveMessage } from "./pdf-download-paths";

describe("parseDownloadBasePath", () => {
  it("returns default when unset", () => {
    expect(parseDownloadBasePath({})).toBe(DEFAULT_DOWNLOAD_BASE_PATH);
    expect(parseDownloadBasePath(null)).toBe(DEFAULT_DOWNLOAD_BASE_PATH);
  });

  it("reads download_base_path from settings", () => {
    expect(
      parseDownloadBasePath({
        download_base_path: "C:\\Users\\Ada\\Downloads",
      })
    ).toBe("C:\\Users\\Ada\\Downloads");
  });
});

describe("joinClientDownloadPath", () => {
  it("joins Windows-style bases with backslashes", () => {
    expect(
      joinClientDownloadPath(
        "C:\\Users\\Ada\\Downloads",
        "Acme_Engineer",
        "Ada.pdf"
      )
    ).toBe("C:\\Users\\Ada\\Downloads\\Acme_Engineer\\Ada.pdf");
  });

  it("joins POSIX-style bases with forward slashes", () => {
    expect(
      joinClientDownloadPath("/home/ada/Downloads", "Acme_Engineer", "Ada.pdf")
    ).toBe("/home/ada/Downloads/Acme_Engineer/Ada.pdf");
  });
});

describe("formatPdfSaveMessage", () => {
  it("describes browser downloads honestly", () => {
    expect(formatPdfSaveMessage("Acme_Role - Ada.pdf", false, "browser")).toBe(
      "PDF saved to browser download “Acme_Role - Ada.pdf” (check your browser’s download folder)"
    );
  });

  it("uses the real path for linked-folder saves", () => {
    expect(
      formatPdfSaveMessage(
        "C:\\Users\\Ada\\Downloads\\Acme_Role\\Ada.pdf",
        true,
        "linked"
      )
    ).toBe(
      "Saved to history & PDF saved to C:\\Users\\Ada\\Downloads\\Acme_Role\\Ada.pdf"
    );
  });
});
