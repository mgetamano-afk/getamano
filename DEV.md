# Development workflow · getamano

## CI/CD (V16.5)

Every commit / PR runs:

1. **`ruff check`** on the backend (bug-detection rules: `F, E701, E702, E711, E712, E741, E402, F821, F632`). Hard fail on any finding.
2. **`eslint`** on the frontend (non-blocking until baseline is clean).
3. **`pytest`** on the V16 critical slice — always runs.
4. **Full pytest suite** — only on pushes to `main` / `develop` (slower; skipped on PRs to keep feedback fast).

CI config: `.github/workflows/ci.yml`. Runs in <90s for PRs.

## Pre-commit hooks

Install once:

```bash
pip install pre-commit
pre-commit install
```

Each `git commit` will then run:

- `ruff --fix` on Python files you changed (auto-fix where possible).
- Whitespace + EOF + YAML checks.
- `pytest` on the V16 smoke slice (~30s) — only if you changed backend or V16 tests.

Manual full pass:

```bash
pre-commit run --all-files
```

## Editor setup

- **VSCode**: install the `charliermarsh.ruff` extension. It picks up our rule set from `backend/pyproject.toml` automatically.
- **PyCharm**: enable Ruff in `Settings → Tools → Ruff`.

## Why these specific rules

We selectively enable **bug-detection** rules and skip pure style rules:

| Code | What it catches |
|------|-----------------|
| `F` | Pyflakes — unused imports/vars, undefined names |
| `E701/E702` | Multiple statements on one line (hides bugs) |
| `E711/E712` | `== None` instead of `is None` (subtle equality bugs) |
| `E741` | Ambiguous variable names (`l`, `O`, `I`) |
| `E402` | Module-level imports not at top of file |
| `F821` | Undefined names at runtime |
| `F632` | `is` comparison with a literal (identity vs equality bug) |

We **intentionally skip** `E5XX` (line-too-long), `D` (docstrings), `ANN` (type hints) at the CI gate — they generate noise without catching bugs. Type hints are added incrementally on touched files.

## Local test credentials

Tests read credentials from env vars (V16.4 audit fix). To override the defaults:

```bash
export TEST_PROVIDER_EMAIL=...
export TEST_PROVIDER_PASSWORD=...
export TEST_CLIENT_EMAIL=...
export TEST_CLIENT_PASSWORD=...
pytest backend/tests/
```

Defaults live in `backend/tests/test_config.py` and match the seeded demo accounts in `/app/memory/test_credentials.md`.
