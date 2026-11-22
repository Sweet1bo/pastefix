// Pastefix engine, in the browser: axe-core checks the page, the fixers repair it, axe-core checks again.
// The fixer below runs inside the page being checked (an iframe), so it reads that page's own DOM and styles.
(function () {
const FIXER = async ([rule, selector, extra]) => {
  const el = document.querySelector(selector);
  if (!el) return {skip: "element not found"};
  const human = s => (s || "").replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\s+/g, " ").trim();
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const set = (attr, v, source) => { el.setAttribute(attr, v); return {attr, value: v, source}; };
  // A stable CSS path for an element we change that axe didn't point at (used by the fix script).
  const path = n => {
    const parts = [];
    while (n && n.nodeType === 1 && n !== document.documentElement) {
      if (n.id && /^[A-Za-z][\w-]*$/.test(n.id)) { parts.unshift("#" + n.id); break; }
      let i = 1, s = n; while ((s = s.previousElementSibling)) if (s.tagName === n.tagName) i++;
      parts.unshift(n.tagName.toLowerCase() + ":nth-of-type(" + i + ")"); n = n.parentElement;
    }
    return parts.join(" > ") || "html";
  };
  // Where a name can honestly come from, in order of trust. Returns [name, source] or null.
  const nameClue = (node = el) => {
    const t = node.getAttribute("title") || node.getAttribute("value");
    if (t && t.trim()) return [t.trim(), "its own title"];
    const svgT = node.querySelector("svg title"); if (svgT && svgT.textContent.trim()) return [svgT.textContent.trim(), "its icon's title"];
    const img = node.querySelector("img[alt]:not([alt=''])"); if (img) return [img.getAttribute("alt").trim(), "its image's description"];
    const mat = node.querySelector(".material-icons, .material-symbols-outlined, .material-symbols-rounded");
    if (mat && /^[a-z_]+$/.test(mat.textContent.trim())) return [cap(human(mat.textContent.trim())), "its icon name"];
    const cls = [node, ...node.querySelectorAll("[class]")].map(n => n.getAttribute("class") || "").join(" ");
    const icon = cls.match(/(?:^|\s)(?:fa|fas|far|fab|bi|icon|glyphicon|mdi|ti|lni|ri)[-_]([a-z][a-z0-9-]*)/i);
    if (icon && !/^(lg|xs|sm|[0-9]x|fw|solid|regular|brands|light|duotone|spin|pulse|inverse|stack|icon)$/i.test(icon[1]))
      return [cap(human(icon[1])), "its icon class"];
    if (node.tagName === "A" && node.getAttribute("href")) {
      try {
        let href = node.getAttribute("href");
        const js = href.match(/^javascript:\s*(?:window\.)?location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i);
        if (js) href = js[1];  // an old-style link that only navigates: use where it goes
        const u = new URL(href, location.href);
        if (!/^https?:$/.test(u.protocol)) return null;
        if (u.hostname !== location.hostname) return [u.hostname.replace(/^www\./, ""), "the link address"];
        const seg = u.pathname.split("/").filter(Boolean).pop();
        if (!seg) return ["Home", "the link address"];
        const word = human(decodeURIComponent(seg).replace(/\.[a-z0-9]+$/i, ""));
        if (/^[a-z][a-z\s]{2,}$/i.test(word)) return [cap(word), "the link address"];
      } catch (e) { return null; }
    }
    return null;
  };

  if (rule === "image-alt" || rule === "input-image-alt") {
    if (extra === "") return set("alt", "", "judged decorative by the vision model");
    if (extra) return set("alt", extra, "the vision model");
    // A linked image with no text IS the link's name, so it is never decorative; WCAG says it should say where
    // the link goes. Checked first, before any "looks decorative" rule.
    const parentLink = el.closest("a[href]");
    if (parentLink && !(parentLink.textContent || "").trim()) {
      const linkClue = nameClue(parentLink);
      if (linkClue) return set("alt", linkClue[0], "where its link goes");
      return {skip: "the only content of a link, with no clue where it goes; needs the vision model or a person"};
    }
    const box = el.getBoundingClientRect();  // judge size as shown on the page, not the file's own size
    const w = Math.round(box.width) || el.naturalWidth || el.width, h = Math.round(box.height) || el.naturalHeight || el.height;
    const file = (el.getAttribute("src") || "").split(/[?#]/)[0].split("/").pop().toLowerCase();
    if ((w && h && w <= 16 && h <= 16) || /(spacer|blank|pixel|shim|clear|transparent|border|corner|divider|dot)[^/]*\.(gif|png|jpe?g|svg|webp)$/.test(file))
      return set("alt", "", "a tiny spacer or border graphic, so marked decorative");
    const thin = w && h && Math.min(w, h) <= 30;
    if (thin && /(^|[_-])(end|left|right|top|bottom|bg|back|background|line|shadow|edge|corner|border|spacer|filler|cap|slice)([_.-]|$)/.test(file))
      return set("alt", "", "a thin layout slice of the page design, so marked decorative");
    const link = el.closest("a[title], a[aria-label], button[title], button[aria-label]");
    if (link) { const t = (link.getAttribute("aria-label") || link.getAttribute("title")).trim(); if (t) return set("alt", t, "the link around it"); }
    const cap2 = el.closest("figure") && el.closest("figure").querySelector("figcaption");
    if (cap2 && cap2.textContent.trim()) return set("alt", cap2.textContent.trim().slice(0, 120), "its caption");
    if (el.getAttribute("title")) return set("alt", el.getAttribute("title").trim(), "its own title");
    // An SVG image that contains real words (logos, banners): describe it with those words.
    const src = el.getAttribute("src") || "";
    if (/^data:image\/svg\+xml|\.svg(\?|#|$)/i.test(src)) {
      try {
        let markup;
        if (src.startsWith("data:")) {
          const body = src.slice(src.indexOf(",") + 1);
          markup = /;base64,/i.test(src.slice(0, src.indexOf(",") + 1)) ? atob(body) : decodeURIComponent(body);
        } else {
          markup = await (await fetch(new URL(src, location.href))).text();
        }
        const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
        const words = [...doc.querySelectorAll("title, text")].map(n => n.textContent.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        if (words.length >= 2 && /[a-z]/i.test(words)) return set("alt", words.slice(0, 150), "the text inside the image");
      } catch (e) { /* unreadable SVG: fall through to the honest skip */ }
    }
    return {skip: "no honest clue to describe it; needs the vision model or a person"};
  }
  if (rule === "button-name" || rule === "link-name" || rule === "aria-command-name") {  // last: role=button/link/menuitem
    if (/^(presentation|none)$/.test(el.getAttribute("role") || ""))
      return {skip: "it is hidden from screen readers with role presentation; a person must decide if it should be"};
    if (extra) return set("aria-label", extra, "the vision model");
    const c = nameClue();
    if (!c) return {skip: "no honest clue to name it from; needs the vision model or a person"};
    return set("aria-label", c[0], c[1]);
  }
  if (rule === "label" || rule === "select-name") {
    let name = el.getAttribute("placeholder") || el.getAttribute("title") ||
               human(el.getAttribute("name")) || human(el.id), source = "its placeholder, name or id";
    if (!name && el.tagName === "SELECT" && el.options.length) {
      const first = el.options[0].textContent.trim();
      if (first && !/^[\d\s.,-]+$/.test(first)) { name = first.replace(/[.:…]+$/, ""); source = "its first option"; }
    }
    if (!name) return {skip: "no placeholder, name or id to label it from"};
    return set("aria-label", name, source);
  }
  if (rule === "tabindex") return set("tabindex", "0", "positive tab order replaced so keyboard order follows the page");
  if (rule === "link-in-text-block") {
    el.style.setProperty("text-decoration", "underline", "important");
    return {attr: "style.text-decoration", value: "underline", source: "links in text must not rely on colour alone"};
  }
  if (rule === "aria-required-parent" || rule === "aria-required-children") {
    const role = el.getAttribute("role");
    if (!role) return {skip: "no explicit role to remove"};
    el.removeAttribute("role");
    return {attr: "role", value: null, source: `role "${role}" was used without the structure it requires; no ARIA beats bad ARIA`};
  }
  if (rule === "region" || rule === "landmark-one-main") {
    let main = document.querySelector("main, [role=main]");
    if (!main) {
      const skip = n => /^(HEADER|NAV|FOOTER|ASIDE)$/.test(n.tagName) || /^(banner|navigation|contentinfo|complementary)$/.test(n.getAttribute("role") || "");
      const h1 = document.querySelector("h1");
      const block = n => /^(DIV|SECTION|ARTICLE|FORM|TABLE|CENTER)$/.test(n.tagName);  // never a heading or inline element
      // A main area must not swallow the page header or footer (they'd stop being landmarks), so when the best
      // block wraps them, look one level deeper.
      const wrapsChrome = n => n.querySelector("header, footer, [role=banner], [role=contentinfo]");
      let parent = document.body, pick = null;
      for (let depth = 0; depth < 6 && !pick; depth++) {
        const kids = [...parent.children].filter(n => !skip(n) && block(n));
        const best = (h1 && kids.find(k => k.contains(h1))) ||
                     kids.sort((a, b) => (b.innerText || "").length - (a.innerText || "").length)[0];
        if (!best) break;
        if (wrapsChrome(best)) parent = best; else pick = best;
      }
      if (!pick) return {skip: "the content isn't wrapped in a block; a person must add a <main> element"};
      pick.setAttribute("role", "main"); main = pick;
      return {attr: "role", value: "main", target: path(pick), source: "marked the block holding the page's main content as the main area"};
    }
    if (rule === "region" && main.contains(el)) return {attr: "role", value: "main", target: path(main), source: "now inside the main area"};
    // Last honest option: the content sits in a block with its own heading, so name that block as a region after
    // its heading. Screen-reader users can then jump to it by name. Never when it would nest landmarks.
    const LANDMARK = "main,header,footer,nav,aside,form[aria-label],section[aria-label],[role=main],[role=banner]," +
                     "[role=contentinfo],[role=navigation],[role=complementary],[role=region],[role=search]";
    const namedRegion = (fallback) => {
      const ours = el.closest("[role=region][aria-label]");
      if (ours) return {attr: "role", value: "region", target: path(ours), also: [["aria-label", ours.getAttribute("aria-label")]],
                        source: `now inside the region named "${ours.getAttribute("aria-label")}"`};
      let box = el;
      while (box && box !== document.body && !box.querySelector("h1,h2,h3,h4,h5,h6")) box = box.parentElement;
      if (!box || box === document.body || !/^(DIV|SECTION|ARTICLE)$/.test(box.tagName) || box.getAttribute("role") ||
          box.closest(LANDMARK) || box.querySelector(LANDMARK)) return {skip: fallback};
      const h = box.querySelector("h1,h2,h3,h4,h5,h6"), name = (h.innerText || h.textContent || "").trim().replace(/\s+/g, " ");
      if (!name || name.length > 60) return {skip: fallback};
      // Two regions with one name confuse screen readers (carousels clone their slides), so the name must be unique.
      const same = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(x => (x.innerText || x.textContent || "").trim().replace(/\s+/g, " ") === name);
      if (same.length > 1 || document.querySelector(`[aria-label="${CSS.escape(name)}"]`)) return {skip: fallback};
      box.setAttribute("role", "region"); box.setAttribute("aria-label", name);
      return {attr: "role", value: "region", target: path(box), also: [["aria-label", name]],
              source: `its own heading "${name}", so it became a named region`};
    };
    if (rule === "region") {
      // Content outside main: if its top-level block names itself clearly, give it that landmark.
      let top = el; while (top.parentElement && top.parentElement !== document.body) top = top.parentElement;
      const nameOf = ((top.id || "") + " " + (top.getAttribute("class") || "")).toLowerCase();
      if (top.getAttribute("role")) return namedRegion("inside a block that already has a role; a person must decide");
      let role = null;
      if (/(^|[\s_-])(nav|navbar|navigation|menu|menubar)([\s_-]|$)/.test(nameOf)) role = "navigation";
      else if (/(^|[\s_-])(header|masthead|topbar|top|banner|site-header)([\s_-]|$)/.test(nameOf)) role = "banner";
      else if (/(^|[\s_-])(footer|site-footer|bottom)([\s_-]|$)/.test(nameOf)) role = "contentinfo";
      const existing = {banner: "header, [role=banner]", contentinfo: "footer, [role=contentinfo]"}[role];  // <footer> counts too
      if (!role || existing && document.querySelector(existing))
        return namedRegion("content outside every landmark; a person must decide which landmark it belongs to");
      top.setAttribute("role", role);
      return {attr: "role", value: role, target: path(top), source: `its block is named "${nameOf.trim()}", so marked as ${role}`};
    }
    return {skip: "content outside every landmark; a person must decide which landmark it belongs to"};
  }
  if (rule === "html-has-lang") {
    const text = document.body ? document.body.innerText : "";
    const ascii = text.replace(/[^\x00-\x7F]/g, "").length / Math.max(text.length, 1);
    if (ascii < 0.95) return {skip: "page is not clearly English; language must be set by a person"};
    return set("lang", "en");
  }
  if (rule === "document-title") {
    const h1 = document.querySelector("h1");
    if (!h1 || !h1.innerText.trim()) return {skip: "no main heading to title the page from"};
    document.title = h1.innerText.trim();
    return {attr: "title", value: document.title};
  }
  if (rule === "frame-title") {
    try { return set("title", "Embedded content from " + new URL(el.src).hostname); }
    catch (e) { return {skip: "frame has no usable source"}; }
  }
  if (rule === "color-contrast") {
    // extra = {fg, bg, ratio} from axe. Move the text colour towards black or white until it passes.
    const parse = c => {
      if (c[0] === "#") {
        const h = c.length === 4 ? [...c.slice(1)].map(x => x + x).join("") : c.slice(1, 7);
        return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
      }
      return c.match(/[\d.]+/g).slice(0, 3).map(Number);
    };
    const lum = ([r, g, b]) => {
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    if (!extra || !extra.fg || !extra.bg) return {skip: "colours not known (image or gradient background)"};
    // Text inside a fading or rotating slideshow: colours are measured mid-fade and the slide changes before
    // the re-check, so no fix can be proven. Say so instead of applying one.
    const stateful = /(active|current|selected)[^\s>]*(slide|item)|(slide|item)[^\s>]*(active|current|selected)/i.test(selector);
    let fading = false;
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      if (parseFloat(getComputedStyle(a).opacity) < 1) { fading = true; break; }
    }
    if (stateful || fading) return {skip: "inside a moving slideshow; contrast can't be fixed and proven while it animates, needs a person"};
    const fg = parse(extra.fg), bg = parse(extra.bg), target = (extra.ratio || 4.5) + 0.1;
    const toward = lum(bg) > 0.18 ? [0, 0, 0] : [255, 255, 255];
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const c = fg.map((v, i) => Math.round(v + (toward[i] - v) * t));
      if (contrast(c, bg) >= target) {
        const v = `rgb(${c.join(", ")})`;
        el.style.setProperty("color", v, "important");
        return {attr: "style.color", value: v};
      }
    }
    return {skip: "no text colour reaches the required contrast on this background"};
  }
  return {skip: "rule not handled"};
};

const NAME_RULES = new Set(["image-alt", "input-image-alt", "button-name", "link-name", "aria-command-name"]);
const FIXABLE = new Set([...NAME_RULES, "label", "select-name", "html-has-lang", "document-title", "color-contrast",
  "frame-title", "region", "landmark-one-main", "aria-required-parent", "aria-required-children", "tabindex", "link-in-text-block"]);
const STRUCTURAL = new Set(["region", "landmark-one-main", "aria-required-parent", "aria-required-children"]);

let axeSrc = null;
async function loadAxe() {
  if (!axeSrc) axeSrc = await (await fetch("axe.min.js")).text();
  return axeSrc;
}

// Load a page (a same-origin address, or sanitised HTML) into a visible iframe and wait until it has settled.
function load(frame, page) {
  return new Promise(resolve => {
    frame.onload = () => setTimeout(resolve, 250);
    if (page.src) {
      try { frame.contentWindow.location.replace(page.src); } catch (e) { frame.src = page.src; }
    } else frame.srcdoc = page.html;
  });
}

async function audit(frame) {
  const w = frame.contentWindow;
  if (!w.axe) {
    const s = w.document.createElement("script");
    s.textContent = await loadAxe();
    w.document.head.appendChild(s);
  }
  const res = await w.axe.run(w.document, {resultTypes: ["violations"]});
  const wcag = tags => {
    const out = [];
    for (const t of tags) { const m = /^wcag(\d)(\d)(\d+)$/.exec(t); if (m) { const c = m.slice(1).join("."); if (!out.includes(c)) out.push(c); } }
    return out;
  };
  const list = [];
  for (const v of res.violations) for (const n of v.nodes) {
    const tg = n.target.every(t => typeof t === "string") ? n.target.join(" ") : JSON.stringify(n.target);
    list.push({rule: v.id, impact: v.impact, help: v.help, help_url: v.helpUrl || "", wcag: wcag(v.tags || []),
               target: tg, html: n.html.slice(0, 200), data: ((n.any || [])[0] || {}).data || null});
  }
  return list;
}

// Same problem on the same element. Random ids change on every load, and carousels move their "active" slide.
function key(v) {
  let t = v.target.replace(/[0-9a-f]{8,}/g, "#");
  if (/owl-item|slick-slide|swiper-slide|carousel-item|splide__slide|glide__slide/.test(t)) {
    t = t.replace(/\.(active|cloned|current|selected|is-active|is-selected|slick-active|slick-current|slick-cloned|swiper-slide-(?:active|next|prev|duplicate))\b/g, "");
    t = t.replace(/:nth-child\(\d+\)/g, "");
  }
  return v.rule + "\u0000" + t;
}

function fixerFor(frame) {
  const w = frame.contentWindow;
  return new w.Function("return (" + FIXER.toString() + ")")();
}

async function applyAll(frame, before) {
  const fix = fixerFor(frame), out = [];
  for (const v of before) {
    if (!FIXABLE.has(v.rule)) { out.push({...v, status: "not fixed", why: "needs a person (rule not auto-fixable)"}); continue; }
    let extra = null;
    if (v.rule === "color-contrast" && v.data) {
      const d = v.data;
      extra = {fg: d.fgColor, bg: d.bgColor, ratio: d.expectedContrastRatio && parseFloat(String(d.expectedContrastRatio).split(":")[0])};
    }
    let r;
    try { r = await fix([v.rule, v.target, extra]); } catch (e) { r = {skip: "fixer error: " + String(e.message || e).slice(0, 80)}; }
    if (r.skip) out.push({...v, status: "not fixed", why: r.skip});
    else {
      const shown = r.value === null ? "removed" : `"${r.value}"`;
      out.push({...v, status: "applied", attr: r.attr, value: r.value, also: r.also || [], fix_target: r.target || v.target,
                source: r.source || "", change: `${r.attr} = ${shown}` + (r.source ? ` (from ${r.source})` : "")});
    }
  }
  return out;
}

// Re-apply a fixed list of already-decided fixes to a freshly loaded copy (used by the safety net).
function replay(frame, fixes) {
  const d = frame.contentWindow.document;
  for (const f of fixes) {
    const target = f.fix_target || f.target;
    for (const [attr, value] of [[f.attr, f.value], ...(f.also || [])]) {
      let el; try { el = d.querySelector(target); } catch (e) { el = null; }
      if (!el) continue;
      if (attr === "title" && el === d.documentElement) d.title = value;
      else if (attr.startsWith("style.")) el.style.setProperty(attr.slice(6), value, "important");
      else if (value === null) el.removeAttribute(attr);
      else el.setAttribute(attr, value);
    }
  }
}

function fixScript(label, fixes, onlyVerified = true) {
  const proven = [];
  for (const f of fixes) {
    if (f.status !== "verified" && onlyVerified) continue;
    const target = f.fix_target || f.target;
    for (const [attr, value] of [[f.attr, f.value], ...(f.also || [])])
      if (!proven.some(p => p[0] === target && p[1] === attr && p[2] === value)) proven.push([target, attr, value]);
  }
  return `/* Pastefix fixes for ${label}: ${proven.length} fixes, each proven by re-check. Add before </body>: <script src="pastefix.js"></script> */\n` +
`(function () {
  var fixes = ${JSON.stringify(proven)};
  function apply() {
    fixes.forEach(function (f) {
      var el = document.querySelector(f[0]);
      if (!el) return;
      if (f[1] === 'title' && el === document.documentElement) document.title = f[2];
      else if (f[1].indexOf('style.') === 0) el.style.setProperty(f[1].slice(6), f[2], 'important');
      else if (f[2] === null) el.removeAttribute(f[1]);
      else el.setAttribute(f[1], f[2]);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})();
`;
}

// A rough view of what a screen reader announces for the controls on the page (not a full accessibility tree).
function readerView(frame) {
  const d = frame.contentWindow.document, lines = [];
  const text = n => (n.textContent || "").replace(/\s+/g, " ").trim();
  const nameOf = el => {
    const al = el.getAttribute("aria-label"); if (al && al.trim()) return al.trim();
    const lb = el.getAttribute("aria-labelledby");
    if (lb) { const t = lb.split(/\s+/).map(i => d.getElementById(i)).filter(Boolean).map(text).join(" ").trim(); if (t) return t; }
    if (el.id) { const l = d.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l && text(l)) return text(l); }
    const wl = el.closest("label"); if (wl && text(wl)) return text(wl);
    if (el.tagName === "IMG") return el.getAttribute("alt") === "" ? null : (el.getAttribute("alt") || "").trim();
    const t = text(el); if (t) return t;
    const sub = el.querySelector("img[alt]:not([alt=''])"); if (sub) return sub.getAttribute("alt").trim();
    return (el.getAttribute("title") || el.getAttribute("placeholder") || "").trim();
  };
  for (const el of d.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, img, [role=button], [role=link], h1, h2, h3")) {
    const tag = el.tagName.toLowerCase(), type = (el.getAttribute("type") || "").toLowerCase();
    let role = el.getAttribute("role") || ({a: "link", button: "button", select: "combobox", textarea: "textbox", img: "image",
      h1: "heading 1", h2: "heading 2", h3: "heading 3"}[tag]) ||
      (/^(button|submit|reset)$/.test(type) ? "button" : /^(checkbox|radio)$/.test(type) ? type : "textbox");
    if (/^(presentation|none)$/.test(el.getAttribute("role") || "")) continue;
    if (tag === "img" && el.getAttribute("alt") === "") continue;
    const n = nameOf(el);
    lines.push(n ? `${role}: "${n.slice(0, 70)}"` : `${role}: (no name)`);
  }
  return lines.join("\n") || "(nothing to announce)";
}

// Check, fix, re-check, roll back anything that made the page worse. `frames` = {before, after} iframes.
async function run(frames, page, label, progress = () => {}) {
  progress("Loading the page and running the accessibility check...");
  await load(frames.before, page);
  const before = await audit(frames.before);
  const readerBefore = readerView(frames.before);

  progress("Fixing what can be fixed honestly...");
  await load(frames.after, page);
  const t0 = performance.now();
  const fixes = await applyAll(frames.after, before);
  let after = await audit(frames.after);
  let still = new Set(after.map(key));
  for (const f of fixes) if (f.status === "applied") f.status = still.has(key(f)) ? "failed re-check" : "verified";
  const beforeKeys = new Set(before.map(key));
  let fresh = after.filter(a => !beforeKeys.has(key(a)));

  if (fresh.length) {
    progress("A fix created a new problem. Rolling back...");
    const rules = [...new Set(fixes.filter(f => f.status === "verified" || f.status === "failed re-check").map(f => f.rule))]
      .sort((a, b) => (STRUCTURAL.has(a) ? 0 : 1) - (STRUCTURAL.has(b) ? 0 : 1) || (a < b ? -1 : 1));
    const first = new Map(fixes.map(f => [f, f.status]));
    const candidates = [new Set(), ...rules.map(r => new Set([r])), STRUCTURAL, null];
    for (const dropped of candidates) {
      const keep = fixes.filter(f => first.get(f) === "verified" && dropped !== null && !dropped.has(f.rule));
      await load(frames.after, page);
      replay(frames.after, keep);
      after = await audit(frames.after);
      still = new Set(after.map(key));
      fresh = after.filter(a => !beforeKeys.has(key(a)));
      for (const f of fixes) if (first.get(f) === "verified" || first.get(f) === "failed re-check") {
        if (keep.includes(f)) { f.status = still.has(key(f)) ? "failed re-check" : "verified"; delete f.why; }
        else { f.status = "rolled back"; f.why = "undone automatically: with it applied, the re-check found a new problem"; }
      }
      if (!fresh.length) break;
    }
  }
  const final = new Set(after.map(key));
  for (const f of fixes) if (f.status === "not fixed" && !final.has(key(f))) { f.status = "resolved"; f.why = "gone on the re-check after a related fix"; }

  const w = frames.after.contentWindow;
  const patched = (w.document.doctype ? "<!doctype html>\n" : "") + w.document.documentElement.outerHTML;
  return {label, before: before.length, after: after.length,
          verified: fixes.filter(f => f.status === "verified").length, resolved: fixes.filter(f => f.status === "resolved").length,
          new_problems: fresh, fixes, reader_before: readerBefore, reader_after: readerView(frames.after),
          patched_html: patched, fix_script: fixScript(label, fixes), seconds: (performance.now() - t0) / 1000};
}

// Pasted HTML is shown in a frame that shares this page's origin, so strip everything that could run.
function sanitize(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, iframe, object, embed, base, meta[http-equiv]").forEach(n => n.remove());
  doc.querySelectorAll("*").forEach(n => {
    for (const a of [...n.attributes]) {
      if (/^on/i.test(a.name) || (/^(href|src|action|formaction|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name);
    }
  });
  return "<!doctype html>\n" + doc.documentElement.outerHTML;
}

window.Pastefix = {run, sanitize};
})();
