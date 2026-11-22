# Pastefix

**Try it live:** https://lumen-fceccf1e.vercel.app

**Demo video:** [`demo-video/pastefix-demo.mp4`](demo-video/pastefix-demo.mp4)

**Pick a page, get an accessible one back, with proof.** Pastefix finds what blocks blind, low-vision and
keyboard users, fixes what it can honestly fix, and proves every fix by running the same accessibility check
a second time. It is a static web app: everything runs in your browser, with no server and nothing uploaded.

The name is the idea: paste a page, get it fixed.

Entered in AITEX Summit Fall 2026 under **AI for Society**, the track whose brief includes accessibility.

## Why it matters
The [WebAIM Million 2026](https://webaim.org/projects/million/) tested the home pages of the top
1,000,000 websites and found 56.1 errors per page on average. The most common failures are the ones Pastefix targets:

| Failure | Share of home pages | What Pastefix does |
|---|---|---|
| Low contrast text | 83.9% | Moves the text colour until it passes |
| Missing image descriptions | 53.1% | Marks spacers decorative; names images from captions, link titles or the words inside them |
| Missing form labels | 51% | Labels from placeholder, name, id or first option |
| Empty links | 46.3% | Names from icon title, icon class, image description or link address |
| Empty buttons | 30.6% | Same as links |
| Missing page language | 13.5% | Sets it when the page is clearly English |

## What it does
1. **Check.** Loads the page in a frame and runs [axe-core](https://github.com/dequelabs/axe-core) 4.10.2.
2. **Fix.** Deterministic fixers, each saying where its fix came from ("Name added: Cart, from its icon class").
   When there is no honest clue, the problem is listed for a person and never guessed.
3. **Re-check.** Runs axe-core again. A fix counts only if the same rule no longer flags the same element.
   Problems that vanish because of a related fix are reported as "also resolved".
4. **Safety net.** If the re-check finds any new problem, Pastefix reloads the page and retries with fewer fixes
   (one kind at a time, then all structural changes, then none) and marks what it undid as "rolled back".
5. **Ship.** Download a one-line fix script holding only the proven fixes, the fixed page, or a printable report.
6. **Show.** A before/after view of the page, every fix in plain language with its WCAG criterion and severity,
   and an approximate list of what a screen reader would announce for links, buttons, fields and images.

Paste anywhere: copy a page's HTML (or a web address) and press Ctrl+V anywhere on the page to start.

## Results (from `tests/test_app.py`)
| Demo page | Problems found | Left after fixing | Fixes proven | New problems |
|---|---|---|---|---|
| Flight booking | 10 | 0 | 10 | 0 |
| Icons, forms and layout images | 12 | 0 | 12 | 0 |
| Wrapped site | 14 | 5 (listed for a person) | 9 | 0 |
| Slideshow | 2 | 1 (text inside a moving slideshow cannot be proven) | 1 | 0 |

- The safety net is tested by sabotaging a fixer on purpose: an invalid page language is undone automatically,
  the other nine fixes stay proven, and the shipped script leaves the bad one out.
- Our own page has 0 problems on our own check, at desktop and phone width (also in the tests).
- Pasted HTML is stripped of scripts and event handlers before it is shown.

## Not an overlay
Accessibility overlay widgets are widely criticised by blind users ([Overlay Fact Sheet](https://overlayfactsheet.com/en/)):
they add toolbars, fight screen readers and guess. Pastefix does the opposite: no widget, no toolbar, no tracking,
only the same attribute changes a developer would make, listed so they can be copied into the real source.

## Run it
It is plain static files in `public/`. Open them from any static host or locally:
```
cd public && python -m http.server 8000     # then open http://localhost:8000
```
Deploy by pointing any static host (Vercel, Netlify, GitHub Pages) at `public/`.

Tests (developer-only; they drive the page in a headless browser):
```
python -m pip install pytest playwright && python -m playwright install chromium
python -m pytest -q
```

## Known limits
- Browsers do not let one website read another, so Pastefix checks the bundled demo pages and HTML you paste.
  Web addresses work only for sites that allow cross-origin reads.
- The fix script repairs pages in the browser; editing the site's own source (a pull request) is the next step.
- No AI image descriptions in this version: images with no honest clue are listed for a person.
- Heading order, missing headings and content outside every landmark that isn't clearly named need a person.
- Pasted pages load without their own scripts, so script-built content is not checked.

axe-core is included unmodified under the Mozilla Public License 2.0 (`public/axe.min.js`).
