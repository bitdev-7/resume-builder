import { describe, expect, it } from "vitest";
import {
  getSystemDownloadsDir,
  isClientReachableDownloadsDir,
  isRemoteServerDownloadPath,
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

  it("prefers RESUME_DOWNLOAD_DIR when set", () => {
    expect(
      getSystemDownloadsDir(
        { RESUME_DOWNLOAD_DIR: "D:\\Resumes", HOME: "/root" },
        "linux",
        () => "/root"
      )
    ).toBe("D:\\Resumes");
  });
});

describe("isClientReachableDownloadsDir", () => {
  it("allows Windows paths", () => {
    expect(
      isClientReachableDownloadsDir("C:\\Users\\Ada\\Downloads", "win32")
    ).toBe(true);
  });

  it("allows WSL mounts of Windows drives", () => {
    expect(
      isClientReachableDownloadsDir("/mnt/c/Users/Ada/Downloads", "linux")
    ).toBe(true);
  });

  it("rejects plain Linux /root Downloads (VPS)", () => {
    expect(isClientReachableDownloadsDir("/root/Downloads", "linux")).toBe(
      false
    );
  });

  it("allows explicit override even on plain Linux", () => {
    expect(
      isClientReachableDownloadsDir("/var/resumes", "linux", true)
    ).toBe(true);
  });
});

describe("isRemoteServerDownloadPath", () => {
  it("flags /root and other plain Unix paths", () => {
    expect(isRemoteServerDownloadPath("/root/Downloads/Acme_Role/a.pdf")).toBe(
      true
    );
    expect(isRemoteServerDownloadPath("/home/ubuntu/Downloads/x.pdf")).toBe(
      true
    );
  });

  it("allows Windows and WSL-mounted paths", () => {
    expect(
      isRemoteServerDownloadPath("C:\\Users\\Ada\\Downloads\\a.pdf")
    ).toBe(false);
    expect(
      isRemoteServerDownloadPath("/mnt/c/Users/Ada/Downloads/a.pdf")
    ).toBe(false);
    expect(isRemoteServerDownloadPath("Downloads\\Acme_Role\\a.pdf")).toBe(
      false
    );
  });
});
