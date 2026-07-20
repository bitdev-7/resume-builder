### Task 6: History + dashboard compatibility

**Files:**
- Modify: `frontend/app/history/page.tsx` — selects/filters already use `BID_STATUSES` (auto-picks new values once types updated); ensure `resolveBidStatus` doesn’t map `unapplied`/`opened` away incorrectly
- Modify: `lib/dashboard-stats.ts` if needed — treat `unapplied`/`opened` as non-success / not rejected (same as not-yet-applied); do not count as “applied” for success rates incorrectly
- Modify: interview auto-promote (`applied` → `interviewing`) — leave as-is; only when status is `applied`

- [ ] **Step 1: Grep for hard-coded status unions / exhaustive switches; update**
- [ ] **Step 2: Run** `npm test` (full)
- [ ] **Step 3: Commit**

```bash
git commit -m "fix: support unapplied/opened statuses in history and stats"
```

---
