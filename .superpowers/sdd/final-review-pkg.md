# Final branch review package — Cubi branding
BASE: 5da26c750437d7a2a3602997d41d026dc8220bd0
HEAD: 6542ba9ae2804f086ea5074b8fa23ef6781e4dc5
merge-base origin/develop: 5da26c750437d7a2a3602997d41d026dc8220bd0
## Commits
6542ba9 fix: add accessible name to Cubi nav brand link
edcafc7 feat: show Cubi brand mark in nav, login, and tab title
05d385e feat: add Cubi brand constants and icon assets
63df325 docs: add Cubi user-facing branding design spec

## Stat
 .../specs/2026-07-16-cubi-branding-design.md       |  48 +++++++++++++++++++++
 frontend/app/icon.png                              | Bin 0 -> 71918 bytes
 frontend/app/layout.tsx                            |   2 +-
 frontend/components/AppNav.tsx                     |  14 +++---
 frontend/components/Auth.tsx                       |  13 ++++--
 frontend/components/BrandMark.tsx                  |  38 ++++++++++++++++
 frontend/public/cubi-icon.png                      | Bin 0 -> 71918 bytes
 lib/brand.test.ts                                  |   9 ++++
 lib/brand.ts                                       |   2 +
 9 files changed, 115 insertions(+), 11 deletions(-)

## Diff
```
diff --git a/docs/superpowers/specs/2026-07-16-cubi-branding-design.md b/docs/superpowers/specs/2026-07-16-cubi-branding-design.md
new file mode 100644
index 0000000..08d9154
--- /dev/null
+++ b/docs/superpowers/specs/2026-07-16-cubi-branding-design.md
@@ -0,0 +1,48 @@
+# Cubi Branding (User-Facing)
+
+Date: 2026-07-16  
+Status: Approved in conversation; awaiting implement
+
+## Goal
+
+Rename the productΓÇÖs user-facing brand to **Cubi** and use the provided kawaii document/pencil icon PNG for favicon and in-app brand marks. Package/npm names, README, and domain terms (e.g. ΓÇ£resumeΓÇ¥) stay unchanged.
+
+## Scope
+
+**In**
+
+- Browser tab title / favicon
+- App nav brand (icon + wordmark)
+- Login (`Auth`) brand (icon + wordmark)
+
+**Out**
+
+- Repo/docs/README renames
+- npm package / workspace names
+- Changing functional ΓÇ£resumeΓÇ¥ language in features
+
+## Asset
+
+- Source: user-provided Cubi icon PNG (session asset)
+- Destination: `frontend/public/cubi-icon.png`
+- Also wire Next.js app icon/favicon to that file (e.g. `app/icon.png` or metadata `icons`, matching existing Next 14 App Router patterns)
+
+## UI changes
+
+| Surface | Current | Target |
+|---------|---------|--------|
+| `layout.tsx` metadata | title `Resume Generator` | title `Cubi`; description can stay product-focused or mention Cubi briefly |
+| Favicon | none / default | Cubi PNG |
+| `AppNav` | blue ΓÇ£RTΓÇ¥ badge + ΓÇ£Resume TailorΓÇ¥ | `<img>` Cubi icon + **Cubi** (wordmark `hidden` on xs, same as todayΓÇÖs `sm:block`) |
+| `Auth` login | ΓÇ£Resume TailorΓÇ¥ text | Cubi icon + **Cubi** wordmark; supporting copy can keep resume-tailoring meaning |
+
+## Approach
+
+**Icon + wordmark** everywhere we show brand: replace the gradient initials badge with the PNG so the kawaii mark is consistent in tab, nav, and login.
+
+## Success criteria
+
+- Tab shows **Cubi** and Cubi favicon
+- Signed-in nav shows Cubi icon + Cubi
+- Login shows Cubi icon + Cubi
+- No package.json / README renames as part of this work
diff --git a/frontend/app/icon.png b/frontend/app/icon.png
new file mode 100644
index 0000000..a132f63
Binary files /dev/null and b/frontend/app/icon.png differ
diff --git a/frontend/app/layout.tsx b/frontend/app/layout.tsx
index cd187e3..f2806ec 100644
--- a/frontend/app/layout.tsx
+++ b/frontend/app/layout.tsx
@@ -1,15 +1,15 @@
 import type { Metadata } from "next";
 import "./globals.css";
 import { Providers } from "@/components/Providers";
 import AuthenticatedChrome from "@/components/AuthenticatedChrome";
 
 export const metadata: Metadata = {
-  title: "Resume Generator",
+  title: "Cubi",
   description: "Generate optimized resumes tailored to job descriptions with AI",
 };
 
 export default function RootLayout({
   children,
 }: Readonly<{
   children: React.ReactNode;
 }>) {
diff --git a/frontend/components/AppNav.tsx b/frontend/components/AppNav.tsx
index 15bc9e3..8fcbdf4 100644
--- a/frontend/components/AppNav.tsx
+++ b/frontend/components/AppNav.tsx
@@ -1,14 +1,16 @@
 "use client";
 
 import Link from "next/link";
 import { usePathname } from "next/navigation";
 import { useEffect, useRef, useState } from "react";
 import { useAuth } from "@/components/AuthProvider";
+import BrandMark from "@/components/BrandMark";
+import { APP_NAME } from "@/lib/brand";
 import ThemeToggle from "@/components/ThemeToggle";
 
 const NAV_ITEMS = [
   { href: "/dashboard", label: "Dashboard" },
   { href: "/generator", label: "Generator" },
   { href: "/history", label: "History" },
   { href: "/statistics", label: "Statistics" },
 ] as const;
@@ -42,23 +44,21 @@ export default function AppNav() {
 
   useEffect(() => {
     setMenuOpen(false);
   }, [pathname]);
 
   return (
     <header className="nav-shell">
       <div className="mx-auto flex h-[4.25rem] max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
-        <Link href="/dashboard" className="group flex items-center gap-3">
-          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-sm font-bold text-white shadow-[0_10px_24px_-14px_rgba(37,99,235,0.9)]">
-            RT
-          </span>
-          <span className="font-display hidden text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:block">
-            Resume Tailor
-          </span>
+        <Link href="/dashboard" className="group flex items-center gap-3" aria-label={APP_NAME}>
+          <BrandMark
+            size={36}
+            wordmarkClassName="font-display hidden text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:block"
+          />
         </Link>
 
         <nav className="hidden items-center gap-1 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1 dark:border-slate-600/50 dark:bg-slate-800/90 md:flex">
           {NAV_ITEMS.map((item) => {
             const active =
               pathname === item.href ||
               (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
             return (
diff --git a/frontend/components/Auth.tsx b/frontend/components/Auth.tsx
index 1b28c6f..b2d61a4 100644
--- a/frontend/components/Auth.tsx
+++ b/frontend/components/Auth.tsx
@@ -1,12 +1,13 @@
 "use client";
 
 import { useState } from "react";
 import { supabase } from "@/lib/supabase";
+import BrandMark from "@/components/BrandMark";
 import ThemeToggle from "@/components/ThemeToggle";
 import { ToastContainer, useToast } from "@/components/Toast";
 
 interface AuthProps {
   onAuthSuccess: () => void;
 }
 
 export default function Auth({ onAuthSuccess }: AuthProps) {
@@ -46,28 +47,34 @@ export default function Auth({ onAuthSuccess }: AuthProps) {
       <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-80 dark:opacity-30">
         <div className="absolute left-[-120px] top-[-120px] h-72 w-72 rounded-full bg-cyan-200/70 blur-3xl dark:bg-blue-600/10" />
         <div className="absolute bottom-[-120px] right-[-80px] h-72 w-72 rounded-full bg-blue-200/70 blur-3xl dark:bg-cyan-600/8" />
       </div>
 
       <div className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-6 sm:px-6">
         <div className="grid w-full max-h-full gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:gap-6">
           <section className="animate-rise-in hidden rounded-3xl border border-white/20 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-8 text-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.8)] lg:block xl:p-10">
-            <p className="mb-4 inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
-              Resume Tailor
-            </p>
+            <div className="mb-4">
+              <BrandMark
+                size={40}
+                wordmarkClassName="font-display text-xl font-semibold tracking-tight text-white"
+              />
+            </div>
             <h1 className="font-display mb-4 text-3xl font-semibold leading-tight tracking-tight xl:text-4xl">
               Craft job-ready resumes with a cleaner, faster workflow
             </h1>
             <p className="max-w-md text-sm text-slate-200 xl:text-base">
               Analyze any job description, tailor your resume instantly, and generate a polished output for each role.
             </p>
           </section>
 
           <section className="glass-panel animate-rise-in w-full p-6 sm:p-8 lg:p-10">
+            <div className="mb-4 lg:hidden">
+              <BrandMark size={36} />
+            </div>
             <h2 className="font-display mb-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:text-3xl">
               Welcome back
             </h2>
             <p className="mb-6 text-sm text-slate-600 dark:text-slate-300 sm:mb-8">
               Sign in to continue tailoring resumes.
             </p>
 
             <form onSubmit={handleSignIn} className="space-y-4">
diff --git a/frontend/components/BrandMark.tsx b/frontend/components/BrandMark.tsx
new file mode 100644
index 0000000..050d113
--- /dev/null
+++ b/frontend/components/BrandMark.tsx
@@ -0,0 +1,38 @@
+import { APP_ICON_SRC, APP_NAME } from "@/lib/brand";
+
+type BrandMarkProps = {
+  size?: number;
+  showWordmark?: boolean;
+  className?: string;
+  wordmarkClassName?: string;
+};
+
+export default function BrandMark({
+  size = 36,
+  showWordmark = true,
+  className = "",
+  wordmarkClassName = "",
+}: BrandMarkProps) {
+  return (
+    <span className={`inline-flex items-center gap-3 ${className}`.trim()}>
+      <img
+        src={APP_ICON_SRC}
+        alt=""
+        width={size}
+        height={size}
+        className="shrink-0 rounded-xl"
+        aria-hidden
+      />
+      {showWordmark ? (
+        <span
+          className={
+            wordmarkClassName ||
+            "font-display text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50"
+          }
+        >
+          {APP_NAME}
+        </span>
+      ) : null}
+    </span>
+  );
+}
diff --git a/frontend/public/cubi-icon.png b/frontend/public/cubi-icon.png
new file mode 100644
index 0000000..a132f63
Binary files /dev/null and b/frontend/public/cubi-icon.png differ
diff --git a/lib/brand.test.ts b/lib/brand.test.ts
new file mode 100644
index 0000000..5fdc9cf
--- /dev/null
+++ b/lib/brand.test.ts
@@ -0,0 +1,9 @@
+import { describe, expect, it } from "vitest";
+import { APP_ICON_SRC, APP_NAME } from "./brand";
+
+describe("brand", () => {
+  it("exposes Cubi name and public icon path", () => {
+    expect(APP_NAME).toBe("Cubi");
+    expect(APP_ICON_SRC).toBe("/cubi-icon.png");
+  });
+});
diff --git a/lib/brand.ts b/lib/brand.ts
new file mode 100644
index 0000000..8922be4
--- /dev/null
+++ b/lib/brand.ts
@@ -0,0 +1,2 @@
+export const APP_NAME = "Cubi";
+export const APP_ICON_SRC = "/cubi-icon.png";

```
