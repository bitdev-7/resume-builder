import { describe, expect, it } from "vitest";
import {
  getSystemDownloadsDir,
  windowsPathToWslPath,
} from "./pdf-download-paths";

describe("windowsPathToWslPath", () => {
  it("converts drive paths to /mnt/<drive>/…", () => {
    expect(windowsPathToWslPath("C:\\Users\\Administrator")).toBe(
      "/mnt/c/Users/Administrator"
    );
    expect(windowsPathToWslPath("D:/Data/Resumes")).toBe("/mnt/d/Data/Resumes");
  });

  it("returns null for non-Windows paths", () => {
    expect(windowsPathToWslPath("/home/user")).toBeNull();
    expect(windowsPathToWslPath("")).toBeNull();
  });
});

describe("getSystemDownloadsDir", () => {
  it("uses USERPROFILE\\Downloads on Windows", () => {
    expect(
      getSystemDownloadsDir(
        { USERPROFILE: "C:\\Users\\Ada" },
        "win32",
        () => "C:\\Users\\Ada"
      )
    ).toBe("C:\\Users\\Ada\\Downloads");
  });

  it("uses Windows Downloads via WSL when USERPROFILE is set", () => {
    expect(
      getSystemDownloadsDir(
        {
          USERPROFILE: "C:\\Users\\Ada",
          WSL_DISTRO_NAME: "Ubuntu",
        },
        "linux",
        () => "/home/ada",
        () => "Linux version … Microsoft …"
      )
    ).toBe("/mnt/c/Users/Ada/Downloads");
  });

  it("falls back to ~/Downloads on plain Linux", () => {
    expect(
      getSystemDownloadsDir(
        { HOME: "/home/ada" },
        "linux",
        () => "/home/ada",
        () => "Linux version 6.1.0"
      )
    ).toBe("/home/ada/Downloads");
  });
});
