## Global Constraints

- Shared URL catalog across all Cubi logins; status and resumes are per `auth.uid()`
- Normalized URL unique globally — never insert a duplicate `jobs.url`
- Status enum: `unapplied` | `opened` | `applied` | `interviewing` | `rejected` | `offer` | `accepted`
- Open link: `unapplied` → `opened` only; never downgrade `applied+`
- Generator folded into Jobs; `/generator` redirects to `/jobs`
- v1 out of scope: JSON import/export, status color picker, copy between users, global URL delete
- Spec: `docs/superpowers/specs/2026-07-16-jobs-tracker-design.md`
