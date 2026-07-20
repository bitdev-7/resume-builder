### Task 2: BrandMark component + wire nav, login, metadata

**Files:**
- Create: `frontend/components/BrandMark.tsx`
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/components/AppNav.tsx`
- Modify: `frontend/components/Auth.tsx`

**Interfaces:**
- Consumes: `APP_NAME`, `APP_ICON_SRC` from `@/lib/brand`
- Produces: `BrandMark` default export with props:
  - `size?: number` (default `36`)
  - `showWordmark?: boolean` (default `true`)
  - `className?: string` (wrapper)
  - `wordmarkClassName?: string`

- [ ] **Step 1: Create BrandMark**

Create `frontend/components/BrandMark.tsx`:

```tsx
import { APP_ICON_SRC, APP_NAME } from "@/lib/brand";

type BrandMarkProps = {
  size?: number;
  showWordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
};

export default function BrandMark({
  size = 36,
  showWordmark = true,
  className = "",
  wordmarkClassName = "",
}: BrandMarkProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`.trim()}>
      <img
        src={APP_ICON_SRC}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-xl"
        aria-hidden
      />
      {showWordmark ? (
        <span
          className={
            wordmarkClassName ||
            "font-display text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50"
          }
        >
          {APP_NAME}
        </span>
      ) : null}
    </span>
  );
}
```

- [ ] **Step 2: Update document title**

In `frontend/app/layout.tsx`, set metadata to:

```ts
export const metadata: Metadata = {
  title: "Cubi",
  description: "Generate optimized resumes tailored to job descriptions with AI",
};
```

(Next.js will pick up `app/icon.png` automatically; no extra `icons` field required.)

- [ ] **Step 3: Update AppNav brand link**

In `frontend/components/AppNav.tsx`:
- Add: `import BrandMark from "@/components/BrandMark";`
- Replace the `<Link href="/dashboard" ...>` children (the RT span + Resume Tailor span) with:

```tsx
        <Link href="/dashboard" className="group flex items-center gap-3">
          <BrandMark
            size={36}
            wordmarkClassName="font-display hidden text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:block"
          />
        </Link>
```

Remove the old `RT` gradient badge and `Resume Tailor` text.

- [ ] **Step 4: Update Auth login brand**

In `frontend/components/Auth.tsx`:
- Add: `import BrandMark from "@/components/BrandMark";`
- Replace the eyebrow pill that currently says `Resume Tailor` with:

```tsx
            <div className="mb-4">
              <BrandMark
                size={40}
                wordmarkClassName="font-display text-xl font-semibold tracking-tight text-white"
              />
            </div>
```

Keep the headline and “Sign in to continue tailoring resumes.” copy unchanged.

Also show brand on the form column (mobile has no left panel): above “Welcome back”, add:

```tsx
            <div className="mb-4 lg:hidden">
              <BrandMark size={36} />
            </div>
```

- [ ] **Step 5: Verify branding strings**

Run:

```powershell
Select-String -Path frontend/components/AppNav.tsx,frontend/components/Auth.tsx,frontend/app/layout.tsx -Pattern "Resume Tailor|Resume Generator|\bRT\b"
```

Expected: no matches (or only unrelated “Generate” feature copy outside those brand spots).

Run: `npm test -- lib/brand.test.ts`

Expected: PASS

With the app running at http://localhost:80:
- Open login: see Cubi icon + Cubi
- Sign in: nav shows Cubi icon + Cubi (wordmark from `sm` up)
- Browser tab title is Cubi; favicon is the cubi icon

- [ ] **Step 6: Commit**

```bash
git add frontend/components/BrandMark.tsx frontend/app/layout.tsx frontend/components/AppNav.tsx frontend/components/Auth.tsx
git commit -m "feat: show Cubi brand mark in nav, login, and tab title"
```

---
