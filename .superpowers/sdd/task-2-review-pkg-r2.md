# Review package Task 2 re-review
BASE: 05d385efba6901c21b2ef203dc70521d8b060bb3
HEAD: 6542ba9ae2804f086ea5074b8fa23ef6781e4dc5
## Commits
6542ba9 fix: add accessible name to Cubi nav brand link
edcafc7 feat: show Cubi brand mark in nav, login, and tab title

## Stat
 frontend/app/layout.tsx           |  2 +-
 frontend/components/AppNav.tsx    | 14 +++++++-------
 frontend/components/Auth.tsx      | 13 ++++++++++---
 frontend/components/BrandMark.tsx | 38 ++++++++++++++++++++++++++++++++++++++
 4 files changed, 56 insertions(+), 11 deletions(-)

## Diff
```
diff --git a/frontend/app/layout.tsx b/frontend/app/layout.tsx
index cd187e3..f2806ec 100644
--- a/frontend/app/layout.tsx
+++ b/frontend/app/layout.tsx
@@ -1,17 +1,17 @@
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
   return (
     <html lang="en">
diff --git a/frontend/components/AppNav.tsx b/frontend/components/AppNav.tsx
index 15bc9e3..8fcbdf4 100644
--- a/frontend/components/AppNav.tsx
+++ b/frontend/components/AppNav.tsx
@@ -1,16 +1,18 @@
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
 
 function getInitials(email: string | undefined): string {
@@ -40,27 +42,25 @@ export default function AppNav() {
     return () => document.removeEventListener("mousedown", handleClickOutside);
   }, []);
 
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
               <Link
                 key={item.href}
diff --git a/frontend/components/Auth.tsx b/frontend/components/Auth.tsx
index 1b28c6f..b2d61a4 100644
--- a/frontend/components/Auth.tsx
+++ b/frontend/components/Auth.tsx
@@ -1,14 +1,15 @@
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
   const [email, setEmail] = useState("");
   const [password, setPassword] = useState("");
@@ -44,32 +45,38 @@ export default function Auth({ onAuthSuccess }: AuthProps) {
         <ThemeToggle />
       </div>
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
               <div>
                 <label htmlFor="email" className="field-label">
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

```
