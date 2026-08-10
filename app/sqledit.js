/* Analytics Dashboard Studio — © 2026 Polecat.live. See LICENSE. */
/* ============================================================================
   sqledit.js — N44 slice 1: ONE SQL editing component, adopted everywhere.

   Before this file, every SQL surface in the app was a bare <textarea>: no
   highlighting, no column help, no checking of any kind — the seven per-adapter
   query boxes in the connection/dataset wizard, the dataset editor's .dsx-sql,
   and the Jobs SQL step. A grep for autocomplete/syntax/highlight machinery
   across app/ returned only autocomplete="off" on credential inputs.

   Studio.SQLEdit.attach(textarea, opts) is the whole API. It ENHANCES the
   element in place — same node, same .value, same events, same host CSS — so a
   caller's save loop, its oninput and its tests are untouched, and a surface
   that never calls attach() keeps working exactly as it does today. Three
   things arrive together:

     1. HIGHLIGHTING — a styled overlay behind a transparent-text textarea
        (the no-build-step, no-runtime-deps constraint from CLAUDE.md rules out
        CodeMirror/Monaco, so this is hand-rolled). Padding, font and border are
        COPIED from the host element's computed style rather than restated in
        CSS, which is what lets one component sit under .dsx-sql, .jobs-sql-box
        and the wizard's boxes without knowing anything about them.
     2. COMPLETION — a small popup over the caret listing the columns and tables
        the caller declares, plus SQL keywords. Keyboard (↑↓ Enter Tab Esc,
        Ctrl-Space to summon) and tap both work; mobile is a release gate, so
        the popup is clamped inside the field and options are ≥36px.
     3. CHECKING, SCOPED TO WHAT IS HONESTLY CHECKABLE — balanced quotes,
        comments and parentheses, and whether the statement opens with
        SELECT/WITH. This is the app's EXISTING check, not a new one:
        Studio.sqlLint (app/model.js, LF63 slice 3) has done exactly this under
        the dashboard-only data-source builder since July, so the shared editor
        adopts it and slice 1 strengthened that one function in place instead of
        shipping a rival with different wording for the same finding. It does
        NOT parse dialect SQL and never claims the query is valid: a green tick
        that is sometimes wrong is worse than no tick, so the status line says
        something only when it has found something.

   opts:
     schema   — object or function → { columns: [...], tables: [...], params: [...] }
                Called on every completion, so a caller can hand over columns it
                only learns at Preview time. Entries are strings or {name,type}.
     expectSelect — false to drop the "should begin with SELECT/WITH" note
                (the Jobs step and gviz-style boxes are not plain SELECTs).
     declaredColumns — passed through to Studio.sqlLint's drift check, for a
                surface that declares its columns up front (the data-source
                builder's chips). The dataset editor declares none, so it gets
                no "column never appears" guesswork.
     onLint   — optional callback(messages) for a caller that wants its own UI.

   Loads after tooltip.js, before studio.js (app/index.html).
   ============================================================================ */
(function () {
  "use strict";
  var Studio = window.Studio = window.Studio || {};

  var KEYWORDS = ("SELECT FROM WHERE GROUP BY ORDER HAVING LIMIT OFFSET AS ON JOIN INNER LEFT RIGHT FULL OUTER CROSS " +
    "UNION ALL EXCEPT INTERSECT DISTINCT WITH RECURSIVE CASE WHEN THEN ELSE END AND OR NOT NULL IS IN EXISTS BETWEEN " +
    "LIKE ILIKE ASC DESC INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE VIEW DROP ALTER ADD PRIMARY KEY FOREIGN " +
    "REFERENCES DEFAULT CAST OVER PARTITION WINDOW FILTER USING NATURAL TRUE FALSE").split(" ");
  var KW = {};
  KEYWORDS.forEach(function (k) { KW[k] = 1; });

  // Offered by the completer only — never highlighted as keywords, because a
  // column legitimately called "count" or "min" is not a syntax error.
  var FUNCS = ("count sum avg min max round abs coalesce nullif cast concat lower upper trim length substr " +
    "date_trunc extract now current_date row_number rank dense_rank lag lead").split(" ");

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ── tokenizer ─────────────────────────────────────────────────────────────
     One pass, one regex. Ordered so a keyword inside a string or a comment can
     never be recoloured: comments and strings match FIRST and swallow their
     contents whole. Each alternative consumes at least one character, so the
     exec loop cannot stall. */
  var TOKEN = new RegExp([
    "(--[^\\n]*|/\\*[\\s\\S]*?(?:\\*/|$))",        // 1 comment (line + block, unterminated included)
    "('(?:''|[^'])*'?)",                            // 2 string ('' is an escaped quote)
    "(\"(?:\"\"|[^\"])*\"?|`[^`]*`?)",              // 3 quoted identifier
    "(\\{\\{\\s*[\\w.$-]+\\s*\\}\\})",              // 4 {{param}} placeholder
    "(\\b\\d[\\w.]*)",                              // 5 number
    "([A-Za-z_][\\w$]*)",                           // 6 word (keyword / function / plain)
    "([-+*/%<>=!|,;()])"                            // 7 operator or punctuation
  ].join("|"), "g");

  function span(cls, text) { return '<span class="sqe-' + cls + '">' + esc(text) + "</span>"; }

  function highlight(src) {
    var out = "", last = 0, m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(src)) !== null) {
      if (m.index > last) out += esc(src.slice(last, m.index));
      last = TOKEN.lastIndex;
      if (m[1]) out += span("c", m[1]);
      else if (m[2]) out += span("s", m[2]);
      else if (m[3]) out += span("id", m[3]);
      else if (m[4]) out += span("p", m[4]);
      else if (m[5]) out += span("n", m[5]);
      else if (m[6]) {
        // a word directly before "(" reads as a call, whatever it is named
        var rest = src.slice(last);
        out += KW[m[6].toUpperCase()] ? span("k", m[6])
          : (/^\s*\(/.test(rest) ? span("f", m[6]) : esc(m[6]));
      } else out += span("o", m[7]);
    }
    out += esc(src.slice(last));
    // a trailing newline collapses in a block box; the caret needs the line
    return out + "\n";
  }

  /* ── the checks ────────────────────────────────────────────────────────────
     NOT a second checker. app/model.js's Studio.sqlLint (LF63 slice 3) has run
     this exact class of check under the dashboard-only data-source builder since
     July — the N44 item's "a grep for autocomplete/syntax/highlight machinery
     returns nothing" was true of those three words and missed it. So the shared
     editor ADOPTS it, and N44 slice 1's contribution to the checking half was to
     make that one function stronger (a real left-to-right scan: block comments,
     backticks, a stray ")" told apart from an unclosed "(") rather than to grow
     a rival with different wording for the same finding.
     Structural only, by design: it does not know your dialect, your tables or
     your types, so it stays silent about them and never renders an all-clear. */
  function lint(src, opts) {
    opts = opts || {};
    if (!Studio.sqlLint) return [];
    return Studio.sqlLint(src, opts.declaredColumns || [], { expectSelect: opts.expectSelect });
  }

  /* ── completion sources ────────────────────────────────────────────────── */
  function nameOf(x) { return typeof x === "string" ? x : (x && x.name) || ""; }

  function candidates(schema, prefix) {
    var seen = {}, out = [];
    function push(name, kind, detail) {
      name = nameOf(name);
      if (!name) return;
      var key = kind + " " + name.toLowerCase();
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ name: name, kind: kind, detail: detail || "" });
    }
    (schema.columns || []).forEach(function (c) { push(c, "column", (c && c.type) || ""); });
    (schema.tables || []).forEach(function (t) { push(t, "table", (t && t.schema) || ""); });
    (schema.params || []).forEach(function (p) { push(p, "param", ""); });
    FUNCS.forEach(function (f) { push(f, "function", ""); });
    KEYWORDS.forEach(function (k) { push(k, "keyword", ""); });
    var p = prefix.toLowerCase();
    if (!p) return out.slice(0, 8);
    var starts = [], contains = [];
    out.forEach(function (c) {
      var lc = c.name.toLowerCase();
      if (lc === p) return;                       // already typed in full
      if (lc.indexOf(p) === 0) starts.push(c);
      else if (c.kind !== "keyword" && lc.indexOf(p) > 0) contains.push(c);
    });
    return starts.concat(contains).slice(0, 8);
  }

  /* ── attach ───────────────────────────────────────────────────────────────
     Everything below is per-textarea state. Nothing is global except the one
     document-level click that closes an open popup. */
  var acSeq = 0;

  function attach(ta, opts) {
    if (!ta || ta.sqEdit) return ta && ta.sqEdit;
    opts = opts || {};
    var doc = ta.ownerDocument || document;

    var wrap = doc.createElement("div");
    wrap.className = "sqe";
    wrap.setAttribute("data-sqe", "1");
    ta.parentNode.insertBefore(wrap, ta);
    var hl = doc.createElement("div");
    hl.className = "sqe-hl";
    hl.setAttribute("aria-hidden", "true");
    wrap.appendChild(hl);
    wrap.appendChild(ta);
    ta.classList.add("sqe-ta");
    ta.spellcheck = false;
    ta.setAttribute("autocomplete", "off");
    ta.setAttribute("autocapitalize", "off");
    ta.setAttribute("autocorrect", "off");
    ta.setAttribute("aria-autocomplete", "list");

    var status = doc.createElement("div");
    status.className = "sqe-status";
    status.setAttribute("role", "status");
    status.hidden = true;
    wrap.parentNode.insertBefore(status, wrap.nextSibling);

    var ac = doc.createElement("div");
    ac.className = "sqe-ac";
    ac.setAttribute("role", "listbox");
    ac.id = "sqe-ac-" + (++acSeq);
    ac.hidden = true;
    wrap.appendChild(ac);
    ta.setAttribute("aria-controls", ac.id);

    var items = [], sel = -1, mirror = null;

    // The overlay has to sit exactly under the text, and the host CSS owns the
    // font and padding — so mirror the computed values instead of duplicating
    // them. Re-run whenever the box changes (the field is resize:vertical).
    function syncBox() {
      var cs = getComputedStyle(ta);
      ["fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight", "tabSize",
        "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
        "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
        "textIndent", "whiteSpace", "wordSpacing"].forEach(function (k) {
          hl.style[k] = cs[k];
        });
      hl.style.whiteSpace = "pre-wrap";
      hl.style.borderStyle = "solid";
      hl.style.borderColor = "transparent";
      hl.style.borderRadius = cs.borderRadius;
      if (mirror) mirror.style.cssText = hl.style.cssText;
    }

    function paint() {
      hl.innerHTML = highlight(ta.value);
      hl.scrollTop = ta.scrollTop;
      hl.scrollLeft = ta.scrollLeft;
      var msgs = lint(ta.value, opts);
      if (!ta.value.trim() || !msgs.length) {
        status.hidden = true; status.textContent = ""; status.className = "sqe-status";
      } else {
        status.hidden = false;
        status.className = "sqe-status" + (msgs.some(function (m) { return m.level === "warn"; }) ? " warn" : "");
        status.textContent = msgs.map(function (m) { return m.msg; }).join(" ");
      }
      if (opts.onLint) opts.onLint(msgs);
    }

    /* caret geometry, measured rather than estimated: a hidden copy of the
       overlay holding the text up to the caret, with a marker at the end. */
    function caretXY() {
      if (!mirror) {
        mirror = doc.createElement("div");
        mirror.className = "sqe-hl sqe-mirror";
        mirror.setAttribute("aria-hidden", "true");
        wrap.appendChild(mirror);
        mirror.style.cssText = hl.style.cssText;
      }
      mirror.style.width = ta.clientWidth + "px";
      var head = ta.value.slice(0, ta.selectionStart);
      mirror.innerHTML = esc(head) + '<span class="sqe-caret">​</span>';
      var mark = mirror.querySelector(".sqe-caret");
      return { x: mark.offsetLeft - ta.scrollLeft, y: mark.offsetTop - ta.scrollTop, h: mark.offsetHeight || 16 };
    }

    function schemaNow() {
      var s = typeof opts.schema === "function" ? opts.schema() : opts.schema;
      return s || {};
    }

    function prefixAt() {
      var head = ta.value.slice(0, ta.selectionStart);
      // never complete inside a string or a comment the caret is sitting in
      var line = head.slice(head.lastIndexOf("\n") + 1);
      if (line.indexOf("--") >= 0) return null;
      var quotes = (head.match(/'/g) || []).length;
      if (quotes % 2) return null;
      var m = head.match(/[A-Za-z_][\w$]*$/);
      return m ? m[0] : "";
    }

    function closeAc() {
      if (ac.hidden) return;
      ac.hidden = true; ac.innerHTML = ""; items = []; sel = -1;
      ta.removeAttribute("aria-expanded");
      ta.removeAttribute("aria-activedescendant");
    }

    function openAc(force) {
      var prefix = prefixAt();
      if (prefix === null || (!force && prefix.length < 1)) return closeAc();
      items = candidates(schemaNow(), prefix);
      if (!items.length) return closeAc();
      ac.innerHTML = "";
      items.forEach(function (it, i) {
        var b = doc.createElement("button");
        b.type = "button";
        b.className = "sqe-ac-opt";
        b.id = ac.id + "-" + i;
        b.setAttribute("role", "option");
        b.innerHTML = '<span class="sqe-ac-name">' + esc(it.name) + "</span>" +
          '<span class="sqe-ac-kind">' + esc(it.detail || it.kind) + "</span>";
        // mousedown, not click: the textarea must not lose the caret first
        b.addEventListener("mousedown", function (e) { e.preventDefault(); accept(i); });
        ac.appendChild(b);
      });
      var at = caretXY();
      ac.hidden = false;
      var maxLeft = Math.max(0, wrap.clientWidth - ac.offsetWidth - 4);
      ac.style.left = Math.max(0, Math.min(at.x, maxLeft)) + "px";
      var below = at.y + at.h + 2;
      // flip above the caret when the popup would fall out of the field
      ac.style.top = (below + ac.offsetHeight > wrap.clientHeight && at.y - ac.offsetHeight > 0
        ? at.y - ac.offsetHeight - 2 : below) + "px";
      ta.setAttribute("aria-expanded", "true");
      setSel(0);
    }

    function setSel(i) {
      var opt = ac.children;
      if (sel >= 0 && opt[sel]) opt[sel].classList.remove("on");
      sel = (i + items.length) % items.length;
      if (opt[sel]) {
        opt[sel].classList.add("on");
        opt[sel].setAttribute("aria-selected", "true");
        ta.setAttribute("aria-activedescendant", opt[sel].id);
        if (opt[sel].scrollIntoView) opt[sel].scrollIntoView({ block: "nearest" });
      }
    }

    function accept(i) {
      var it = items[i];
      if (!it) return;
      var start = ta.selectionStart;
      var head = ta.value.slice(0, start);
      var m = head.match(/[A-Za-z_][\w$]*$/);
      var from = start - (m ? m[0].length : 0);
      var text = it.kind === "keyword" ? it.name.toUpperCase() : it.name;
      ta.value = ta.value.slice(0, from) + text + ta.value.slice(start);
      ta.selectionStart = ta.selectionEnd = from + text.length;
      closeAc();
      ta.focus();
      // the host's own oninput does the saving — go through the real event
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // The popup follows TYPING, not every value change: `beforeinput` fires for
    // real edits (including on a phone keyboard, where keydown reports
    // "Unidentified") and never for a programmatic .value write, so the schema
    // browser's insertAtCursor and a caller re-filling the field don't pop a
    // menu the user didn't ask for.
    var typed = false;
    ta.addEventListener("beforeinput", function (e) {
      var t = e.inputType || "";
      typed = t.indexOf("insert") === 0 || t.indexOf("delete") === 0;
    });
    ta.addEventListener("input", function () { paint(); if (typed) openAc(false); else closeAc(); typed = false; });
    ta.addEventListener("scroll", function () { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; closeAc(); });
    ta.addEventListener("blur", function () { setTimeout(closeAc, 120); });
    ta.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === " ") { e.preventDefault(); openAc(true); return; }
      if (ac.hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setSel(sel + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSel(sel - 1); }
      else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); accept(sel); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeAc(); }
    });

    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { syncBox(); if (!ac.hidden) closeAc(); });
      ro.observe(ta);
    }

    syncBox();
    paint();

    var api = {
      el: ta, wrap: wrap, refresh: paint,
      lint: function () { return lint(ta.value, opts); },
      complete: function () { openAc(true); },
      close: closeAc
    };
    ta.sqEdit = api;
    return api;
  }

  Studio.SQLEdit = {
    attach: attach,
    lint: lint,
    highlight: highlight,
    KEYWORDS: KEYWORDS
  };
})();
