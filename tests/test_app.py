"""Developer tests. Pastefix itself needs no server or browser install; these drive the built page in a headless
browser to check the numbers we claim. Run: python -m pip install pytest playwright && python -m playwright install chromium
then: python -m pytest -q"""
import functools
import http.server
import pathlib
import threading

import pytest
from playwright.sync_api import sync_playwright

PUBLIC = pathlib.Path(__file__).resolve().parent.parent / "public"
AXE = (PUBLIC / "axe.min.js").read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def base():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(PUBLIC))
    handler.log_message = lambda *a, **k: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_port}/"
    srv.shutdown()


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def check_demo(browser, base, index, page_route=None):
    pg = browser.new_page(viewport={"width": 1280, "height": 900})
    if page_route:
        pg.route("**/engine.js", page_route)
    pg.goto(base, wait_until="networkidle")
    pg.click(f'#demos button[data-i="{index}"]')
    pg.wait_for_selector("#summary:not([hidden])", timeout=60000)
    out = pg.evaluate("""() => ({line: document.getElementById('line').innerText, proven: document.getElementById('c-proven').innerText,
        person: document.getElementById('c-person').innerText, failed: document.getElementById('failed').innerText,
        script: document.getElementById('dljs').href})""")
    out["pg"] = pg
    return out


def test_flight_page_all_ten_fixed_and_proven(browser, base):
    r = check_demo(browser, base, 0)
    assert r["line"].startswith("10 problems found, 0 left after fixing, 0 new problems") and r["proven"] == "(10)"


def test_second_page_all_twelve_proven(browser, base):
    r = check_demo(browser, base, 1)
    assert r["line"].startswith("12 problems found, 0 left") and r["person"] == "(0)"


def test_wrapped_page_keeps_what_it_cannot_prove_for_a_person(browser, base):
    r = check_demo(browser, base, 2)
    assert r["line"].startswith("14 problems found, 5 left after fixing, 0 new problems")
    assert r["proven"] == "(9)" and r["person"] == "(5)"


def test_slideshow_text_is_skipped_not_failed(browser, base):
    r = check_demo(browser, base, 3)
    assert r["proven"] == "(1)" and r["person"] == "(1)" and r["failed"] == ""


def test_a_fix_that_creates_a_new_problem_is_rolled_back(browser, base):
    js = (PUBLIC / "engine.js").read_text(encoding="utf-8")
    bad = js.replace('return set("lang", "en");', 'return set("lang", "xx-not-a-language");')
    assert bad != js
    r = check_demo(browser, base, 0, lambda route: route.fulfill(body=bad, content_type="text/javascript"))
    assert "0 new problems" in r["line"] and r["proven"] == "(9)"
    assert "undone automatically" in r["failed"]


def test_pasted_html_is_sanitised_and_checked(browser, base):
    pg = browser.new_page(viewport={"width": 1280, "height": 900})
    pg.goto(base, wait_until="networkidle")
    pg.fill("#url", '<html><body><h1>Shop</h1><img src=x onerror="window.__pwn=1"><script>window.__pwn=2</script>'
                    '<button><i class="fa fa-cart"></i></button></body></html>')
    pg.click("#go")
    pg.wait_for_selector("#summary:not([hidden])", timeout=60000)
    assert pg.evaluate("window.__pwn") is None
    assert 'Name added: "Cart"' in pg.inner_text("#proven")


@pytest.mark.parametrize("size", [(1280, 900), (390, 800)])
def test_our_own_page_has_no_problems(browser, base, size):
    pg = browser.new_page(viewport={"width": size[0], "height": size[1]})
    pg.goto(base, wait_until="networkidle")
    pg.evaluate(AXE)
    assert pg.evaluate("axe.run(document, {resultTypes: ['violations']}).then(r => r.violations.map(v => v.id))") == []
