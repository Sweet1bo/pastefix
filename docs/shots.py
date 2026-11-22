"""Take the README screenshots from the real page: python docs/shots.py -> docs/screenshots/*.png (1440 px wide).
Developer-only: needs `pip install playwright && python -m playwright install chromium`. Serves public/ itself."""
import functools
import http.server
import pathlib
import threading

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "screenshots"


def at(page, selector, name, offset=40):
    page.evaluate("([s, o]) => { const e = document.querySelector(s); scrollTo(0, e.getBoundingClientRect().top + scrollY - o); }", [selector, offset])
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / name)); print("saved", name)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT / "public"))
    handler.log_message = lambda *a, **k: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    app = f"http://127.0.0.1:{srv.server_port}/"
    with sync_playwright() as p:
        page = p.chromium.launch().new_page(viewport={"width": 1440, "height": 900})
        page.goto(app, wait_until="networkidle"); page.wait_for_timeout(800)
        page.screenshot(path=str(OUT / "01-pick-a-page.png")); print("saved 01-pick-a-page.png")
        page.click('#demos button[data-i="0"]'); page.wait_for_selector("#summary:not([hidden])", timeout=60000)
        at(page, "#h-res", "02-result.png")
        at(page, "#h-proven", "03-fixed-and-proven.png")
        at(page, "#rb", "04-screen-reader-before-after.png", 160)
        at(page, ".shots", "05-see-the-difference.png", 160)
        at(page, ".ship", "06-ship-the-fixes.png", 160)
        page.goto(app, wait_until="networkidle"); page.click('#demos button[data-i="2"]'); page.wait_for_selector("#summary:not([hidden])", timeout=60000)
        at(page, "#h-res", "07-wrapped-site.png")
    srv.shutdown()
