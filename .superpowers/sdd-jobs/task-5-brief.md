### Task 5: Fold generate into Jobs + wire job_id on save

**Files:**
- Modify: `frontend/app/jobs/page.tsx` — “Generate” opens panel/drawer or secondary view
- Prefer: extract thin wrapper from current generator logic **or** embed by importing shared components already used on generator (`AnalysisResultCard`, session helpers). Avoid duplicating entire 800+ line page blindly.
- Recommended structure:
  - Jobs list remains default view
  - `selectedJobId` + `mode === "generate"` shows generate UI with `jobUrl` locked from catalog; on `createResumeWithArtifacts` pass `jobLink: url`, `jobId`, `bidStatus: currentStatus` (do **not** force `applied`)
- Modify generator call sites that currently pass `jobLink: null` when launched from Jobs path only

- [ ] **Step 1: Add Generate entry that loads generate UI for one job**
- [ ] **Step 2: Ensure save path sets `job_id` + `job_link`**
- [ ] **Step 3: Manual:** generate once → History shows link + status; Jobs still shows same status
- [ ] **Step 4: Commit**

```bash
git commit -m "feat: fold resume generation into Jobs workflow"
```

---
