### Task 4: Jobs list page + nav (without full generate yet)

**Files:**
- Create: `frontend/app/jobs/page.tsx`
- Modify: `frontend/components/AppNav.tsx` — replace Generator href with `/jobs` label `Jobs`
- Modify: `frontend/app/generator/page.tsx` — replace body with redirect:

```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GeneratorRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/jobs");
  }, [router]);
  return (
    <div className="flex h-full items-center justify-center text-sm text-slate-500">
      Redirecting to Jobs…
    </div>
  );
}
```

**Jobs page minimal v1 behavior:**

- `useAuth()` → `listJobsForUser(user.id)`
- Input + Add button → `addJobForUser`
- Table: URL (link), status `<select>`, created_at
- Filter by status; simple client pagination (30/50/100) optional but recommended
- Buttons: Open (`openJobForUser` then `window.open` with https prefix if needed), Copy URL, Delete (`removeMyJob`), bulk status if checkboxes feasible
- Empty / error toasts via existing `useToast`

Match existing page chrome (`page-header`, surfaces) from History/Dashboard — do not invent a new design language.

- [ ] **Step 1: Implement page + nav + redirect**
- [ ] **Step 2: Manual verify** on running app: two browsers/accounts share URL list; statuses independent; duplicate add doesn’t create second catalog row
- [ ] **Step 3: Commit**

```bash
git add frontend/app/jobs/page.tsx frontend/components/AppNav.tsx frontend/app/generator/page.tsx
git commit -m "feat: add Jobs page with shared URLs and per-user status"
```

---
