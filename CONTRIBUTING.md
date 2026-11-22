# Contributing to Pastefix

Pastefix is static files in `public/`: `index.html` (the page), `engine.js` (check, fix, re-check, rollback) and
`axe.min.js` (axe-core, unmodified). The fixers are the `FIXER` function at the top of `engine.js`.

## Setup
```
cd public && python -m http.server 8000
python -m pip install pytest playwright && python -m playwright install chromium   # developer tests only
python -m pytest -q        # must pass before you push
```

## Rules
- Branch per task, pull request into `main`; don't merge a red test.
- Every number we show comes from a test in `tests/test_app.py`. No made-up numbers.
- The engine lists what it can't fix as "needs a person". Keep it that way: never guess a fix.
- Pasted HTML must stay sanitised (`Pastefix.sanitize`) before it is shown in a frame.
