### Task 2: Add Job UI — JD field

**Files:**
- Modify: `frontend/app/jobs/page.tsx`

**Interfaces:**
- State `jobDescription: string`
- `addJobForUser(user.id, jobUrl, jobDescription)`

- [ ] **Step 1: Update Add form layout**

Change the add form to stack on all sizes:

```tsx
<form onSubmit={handleAdd} className="card-soft flex flex-col gap-2 p-3">
  <div className="flex flex-col gap-2 sm:flex-row">
    <label htmlFor="job-url" className="sr-only">Job URL</label>
    <input id="job-url" ... value={jobUrl} ... placeholder="Paste a job URL" className="input-shell min-w-0 flex-1" />
    <button type="submit" className="btn-primary shrink-0 sm:min-w-24" disabled={adding}>
      {adding ? "Adding…" : "Add job"}
    </button>
  </div>
  <label htmlFor="job-description" className="sr-only">Job description</label>
  <textarea
    id="job-description"
    value={jobDescription}
    onChange={(e) => setJobDescription(e.target.value)}
    placeholder="Paste the job description (required for one-click Generate)"
    rows={4}
    className="input-shell min-w-0 w-full resize-y"
    disabled={adding}
  />
</form>
```

- [ ] **Step 2: Wire handleAdd**

```ts
const result = await addJobForUser(user.id, jobUrl, jobDescription);
// clear both fields on success
setJobUrl("");
setJobDescription("");
```

Ensure list state uses returned `item.job_description`.

- [ ] **Step 3: Manual smoke** — typecheck frontend

`npx tsc --noEmit -p frontend`

- [ ] **Step 4: Commit**

```bash
git add frontend/app/jobs/page.tsx
git commit -m "feat: add job description field to Jobs add form"
```

---
