### Task 1: Brand constants + icon assets

**Files:**
- Create: `lib/brand.ts`
- Create: `lib/brand.test.ts`
- Create: `frontend/public/cubi-icon.png` (binary copy)
- Create: `frontend/app/icon.png` (binary copy of same PNG)

**Interfaces:**
- Produces: `APP_NAME: "Cubi"`, `APP_ICON_SRC: "/cubi-icon.png"`

- [ ] **Step 1: Write the failing test**

Create `lib/brand.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { APP_ICON_SRC, APP_NAME } from "./brand";

describe("brand", () => {
  it("exposes Cubi name and public icon path", () => {
    expect(APP_NAME).toBe("Cubi");
    expect(APP_ICON_SRC).toBe("/cubi-icon.png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/brand.test.ts`

Expected: FAIL (cannot find module `./brand` or similar)

- [ ] **Step 3: Write minimal implementation**

Create `lib/brand.ts`:

```ts
export const APP_NAME = "Cubi";
export const APP_ICON_SRC = "/cubi-icon.png";
```

Copy the session PNG to both destinations (PowerShell):

```powershell
$src = "C:\Users\henzz\.cursor\projects\d-Projects-Services-resuma\assets\c__Users_henzz_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_Cubi-37af58a3-2628-416b-ab6b-0e8980f11e5e.png"
Copy-Item $src "D:\Projects\Services\resuma\frontend\public\cubi-icon.png" -Force
Copy-Item $src "D:\Projects\Services\resuma\frontend\app\icon.png" -Force
```

If `frontend/public` does not exist, create it first:

```powershell
New-Item -ItemType Directory -Force -Path "D:\Projects\Services\resuma\frontend\public" | Out-Null
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/brand.test.ts`

Expected: PASS

Also verify files exist and are non-empty:

```powershell
(Get-Item frontend/public/cubi-icon.png).Length -gt 1000
(Get-Item frontend/app/icon.png).Length -gt 1000
```

Expected: both `True`

- [ ] **Step 5: Commit**

```bash
git add lib/brand.ts lib/brand.test.ts frontend/public/cubi-icon.png frontend/app/icon.png
git commit -m "feat: add Cubi brand constants and icon assets"
```

---
