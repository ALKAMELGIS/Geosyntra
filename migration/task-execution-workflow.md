# Task execution workflow

## Branch policy (2026-06-17)

**Stay on `feature/axum-migration`.** All active work continues on the feature branch. **There is no merge to `main`** — production deploys and hardening (Task 27) run on the feature branch only. The branch has diverged from `main` (~90 commits); that is intentional until a future cutover decision.

| Phase | Tasks |
|-------|-------|
| Deploy hardening | **27.0–27.4** (active — wasm SSR, Mapbox proxy, deploy scripts, rollback docs) |
| Tenant cache (optional) | 23.6 |
| GIS parity follow-ups | 28.8+ |
| Desktop | 29–30 |
| Mobile / PWA | 31–32 |

## Active priority (2026-06-17)

**Tasks 23.5, 25, 26 (local), 28 MVP, 33, and 34 are ✅ complete.** **Task 27** deploy hardening is the primary track. Execute **one subtask at a time**, run tests, **commit**, then proceed.

| Now | Next |
|-----|------|
| **Task 27.0** — Mapbox proxy + release wasm bundle | **27.1–27.4** — deploy scripts, rollback docs |
| | **23.6** Redis cache (optional, parallel) |
| | **28.8+** GIS layer/index parity (optional, parallel) |

**Detail:** [axum-migration-plan.md](./axum-migration-plan.md) · [dioxus-gis-map-plan.md](./dioxus-gis-map-plan.md)

## Completed tracks (reference)

| Task | Status |
|------|--------|
| 23.5 — RBAC/ABAC + tenant isolation | ✅ |
| 25 — Playwright (46 specs) | ✅ |
| 26 — Local staging sign-off | ✅ |
| 28 — GIS map MVP (no React iframe) | ✅ |
| 33 — Governance + field parity | ✅ |
| 34 — Admin table + stepper modals | ✅ |

## Planned commits (Task 27 next)

Execute in order; run `bash scripts/run-all-tests.sh` before each commit.

| # | Commit message (draft) | Scope |
|---|------------------------|-------|
| 1 | `Task 27.0: Mapbox proxy and release wasm bundle` | API + web build |
| 2 | `Task 27.1–27.4: deploy scripts and rollback docs` | Nix/scripts/docs |
| 3+ | Tasks 23.6, 28.8+, 29–32 as needed | See axum-migration-plan |

Docs-only updates may fold into the next implementation commit or commit as `docs: …`.

---

Every task and subtask follows this order:

1. **Implement** scoped change only.
2. **Add tests** for all new behavior.
3. **Run** `bash scripts/run-all-tests.sh` (set `REDIS_URL` when Redis code changed; `RUN_API_INTEGRATION=1` for API suites).
4. **Fix** failures; re-run until **all tests pass**.
5. **Commit** with a focused message (one task/subtask per commit).
6. **Only then** start the next task or subtask.

## Do not

- Skip tests for small subtasks.
- Commit with failing tests.
- Batch unrelated tasks in one commit.

## Cursor rule

- `.cursor/rules/playwright-dev-stack.mdc` — cold restart Axum/Dioxus, tail logs during Playwright, fix compile/runtime errors before re-run
- `.cursor/rules/task-execution.mdc` (local IDE guidance; `.cursor/` is gitignored)
