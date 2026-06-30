#!/usr/bin/env python3
"""gen-home.py — regenerate the i-home launcher console for THIS iteration.

A rich, interactive console: concept cards with Simple HTML ⇄ Framework toggle
(each concept once, not twice), thumbnail cards (served from the repo's thumbs/ subfolder),
live search, group + role/tech/topic facet chips, persona "Start Here" guided paths,
terminology glossary, counts, hover, and light/dark.
Version-aware (reads ../VERSION; links/thumbs at /public/pdc-iteration/<version>).
Regenerate thumbnails with the showcase build/thumbs.js (deployed by deploy.sh).
"""
import os, datetime, subprocess
from zoneinfo import ZoneInfo
CENTRAL = ZoneInfo("America/Chicago")
HERE = os.path.dirname(os.path.abspath(__file__))
ITER = os.path.dirname(HERE)
SE_REPO = os.path.normpath(os.path.join(ITER, "..", ".."))
VERSION = open(os.path.join(ITER, "VERSION")).read().strip()
PUBLISHED = datetime.datetime.now(CENTRAL).strftime("%Y-%m-%d %H:%M") + " CT"
CB = datetime.datetime.now().strftime("%Y%m%d%H%M")
DEPLOY = "/public/pdc-iteration/" + VERSION
BASE = "/pentaho/api/repos/" + DEPLOY.replace("/", ":") + ":"
OUT = os.path.join(ITER, "content", "dashboards", "i-home.html")

# ── "What's new" changelog ─────────────────────────────────────────────────────────────────────
_CL_TRAILERS = ("co-authored-by", "generated with", "co-authored", "\U0001f916")
_CL_SKIP = ("refresh dashboard showcase", "merge ", "status:", "wip", "fixup")
def _cl_clean(text):
    return " ".join(text.split()).replace("->", "→").replace(" x ", " × ")
def build_changelog(n=22, limit=15):
    try:
        out = subprocess.check_output(
            ["git", "-C", SE_REPO, "log", "-n", str(n), "--no-merges",
             "--pretty=format:%cI\x1f%s\x1f%b\x1e", "--", "iteration/"],
            stderr=subprocess.DEVNULL).decode("utf-8", "replace")
    except Exception:
        return []
    items, seen = [], set()
    for rec in out.split("\x1e"):
        rec = rec.strip()
        if "\x1f" not in rec: continue
        p = rec.split("\x1f")
        iso, subj, body = p[0], (p[1] if len(p) > 1 else ""), (p[2] if len(p) > 2 else "")
        subj = subj.strip()
        if subj.lower().startswith(_CL_SKIP): continue
        head = subj
        if ": " in head:
            pre = head.split(": ", 1)[0]
            if " " not in pre and pre.replace("-", "").isalnum():
                head = head.split(": ", 1)[1]
        head = _cl_clean(head[:1].upper() + head[1:])
        if head.lower() in seen: continue
        seen.add(head.lower())
        bullets = []
        body_txt = " ".join(l.strip() for l in body.splitlines()
                            if l.strip() and not any(t in l.lower() for t in _CL_TRAILERS))
        for s in body_txt.split(". "):
            s = _cl_clean(s).rstrip(".")
            if len(s) < 8: continue
            bullets.append(s[:160])
            if len(bullets) >= 2: break
        try:
            when = datetime.datetime.fromisoformat(iso).astimezone(CENTRAL).strftime("%Y-%m-%d %H:%M") + " CT"
        except Exception:
            when = iso[:16]
        items.append((when, head, bullets))
        if len(items) >= limit: break
    return items
def changelog_block(items):
    if not items: return ""
    lis = []
    for when, head, bullets in items:
        sub = "".join("<li>%s</li>" % esc(b) for b in bullets)
        sub = ('<ul class="clsub">%s</ul>' % sub) if sub else ""
        lis.append('<li><div class="when">%s</div><div class="what"><div class="clhl">%s</div>%s</div></li>'
                    % (esc(when), esc(head), sub))
    return ('<details class="changelog"><summary>What&#8217;s new · recent improvements to this dashboard suite</summary>'
            '<ul class="cllog">%s</ul></details>') % "".join(lis)

# ── Facet taxonomy ─────────────────────────────────────────────────────────────────────────────
ROLE_ORDER  = ["exec", "steward", "engineer", "architect"]
TECH_ORDER  = ["multi", "snowflake", "aws", "pdi", "postgres", "salesforce"]
TOPIC_ORDER = ["governance", "quality", "pii", "lineage", "freshness", "ops",
               "discovery", "cost", "storage", "glossary", "schema"]
ROLE_LABELS  = {"exec": "Executive", "steward": "Data Steward",
                "engineer": "Data Engineer", "architect": "Data Architect"}
TECH_LABELS  = {"multi": "Multi-source", "aws": "AWS / S3", "snowflake": "Snowflake",
                "postgres": "Postgres", "salesforce": "Salesforce", "pdi": "PDI / ETL"}
TOPIC_LABELS = {"governance": "Governance", "quality": "Quality", "pii": "PII / Privacy",
                "lineage": "Lineage", "freshness": "Freshness", "ops": "Operations",
                "discovery": "Discovery", "cost": "Cost", "storage": "Storage",
                "glossary": "Glossary", "schema": "Schema"}

# ── Concept registry ───────────────────────────────────────────────────────────────────────────
# Each entry is a dict with: title, sub, tags, custom (stem), cdf (stem), cde (stem)
# Omit cdf/cde keys (or set None) when no twin exists.
# Concept card shows ONE card per entry; if has both custom+cdf, renders a toggle.
GROUPS = [
 ("Executive", [
   {"title": "Unified Executive Scorecard",
    "sub": "one board — every domain's headline KPI, trend sparklines & drill-through into each domain",
    "tags": {"roles":["exec","steward","architect"],"tech":["multi"],"topics":["governance","quality","ops","freshness"]},
    "custom": "i-exec-scorecard", "cdf": "i-cdf-scorecard"},
 ]),
 ("Observability", [
   {"title": "Estate Observability Command Center",
    "sub": "single pane of glass — catalog health, governance, sensitivity, freshness & semicircle KPI gauges",
    "tags": {"roles":["exec","engineer","architect"],"tech":["multi"],"topics":["ops","governance","freshness","quality"]},
    "custom": "pdc-command-center", "cdf": "i-cdf-command-center"},
   {"title": "Pipeline & Job Observability",
    "sub": "run success/failure, runtimes, run-activity calendar, slowest jobs & failing-job drill",
    "tags": {"roles":["exec","engineer"],"tech":["pdi"],"topics":["ops","freshness"]},
    "custom": "pdc-pipeline-obs", "cdf": "i-cdf-pipeline-obs", "cde": "cde-pipeline-obs"},
   {"title": "Data Freshness & Staleness",
    "sub": "scan/access recency, stale-data detection, data temperature & catalog-scan activity calendar",
    "tags": {"roles":["exec","steward","engineer"],"tech":["multi"],"topics":["freshness","quality","discovery"]},
    "custom": "pdc-freshness", "cdf": "i-cdf-freshness", "cde": "cde-freshness"},
   {"title": "Data Quality & Metadata Completeness",
    "sub": "completeness scores, missing attributes, profiling coverage & remediation table",
    "tags": {"roles":["exec","steward","engineer"],"tech":["multi"],"topics":["quality","governance"]},
    "custom": "pdc-data-quality", "cdf": "i-cdf-data-quality", "cde": "cde-quality"},
   {"title": "Column Profiling & Statistics",
    "sub": "null rate, cardinality, uniqueness at the column level",
    "tags": {"roles":["engineer","steward","architect"],"tech":["multi"],"topics":["quality","schema"]},
    "custom": "i-profiling", "cdf": "i-cdf-profiling"},
   {"title": "Catalog Growth & Discovery",
    "sub": "cumulative growth trend, discovery velocity, assets by source",
    "tags": {"roles":["exec","steward","architect"],"tech":["multi"],"topics":["discovery","ops"]},
    "custom": "i-growth", "cdf": "i-cdf-growth", "cde": "cde-growth"},
   {"title": "Document & Unstructured Insights",
    "sub": "files, extensions, folder depth, scan volume — click extension for file detail",
    "tags": {"roles":["architect","steward","engineer"],"tech":["aws"],"topics":["storage","discovery","schema"]},
    "custom": "i-unstructured", "cdf": "i-cdf-unstructured"},
   {"title": "Catalog Observability",
    "sub": "single-pane catalog health — assets by source, governance, discovery trend, sensitivity scorecard",
    "tags": {"roles":["exec","steward"],"tech":["multi"],"topics":["governance","quality","ops","discovery"]},
    "custom": "i-overview", "cdf": "i-cdf-overview", "cde": "cde-observability"},
 ]),
 ("Governance & Privacy", [
   {"title": "Sensitive Data & Compliance Radar",
    "sub": "PII/regulated exposure, cross-boundary sensitive movement, restricted flow drill",
    "tags": {"roles":["exec","steward"],"tech":["multi"],"topics":["pii","governance","lineage"]},
    "custom": "pdc-compliance", "cdf": "i-cdf-compliance", "cde": "cde-compliance"},
   {"title": "Policy & Governance Coverage",
    "sub": "governed vs ungoverned, policy types, source-×-sensitivity risk heat matrix",
    "tags": {"roles":["exec","steward","architect"],"tech":["multi"],"topics":["governance","quality"]},
    "custom": "pdc-governance", "cdf": "i-cdf-governance", "cde": "cde-governance"},
   {"title": "Sensitive Data & Privacy",
    "sub": "PII/classification reach, exposure by source, term heatmap — click domain for entity detail",
    "tags": {"roles":["steward","exec"],"tech":["multi"],"topics":["pii","governance"]},
    "custom": "i-privacy", "cdf": "i-cdf-privacy", "cde": "cde-privacy"},
   {"title": "Catalog Adoption",
    "sub": "classification, governance & usage coverage — app ↔ source chord diagram",
    "tags": {"roles":["exec","steward","architect"],"tech":["multi"],"topics":["governance","discovery"]},
    "custom": "i-adoption", "cdf": "i-cdf-adoption"},
   {"title": "Sensitive Data Domains",
    "sub": "governance risk map — glossary domain × sensitivity; click domain for entity drill",
    "tags": {"roles":["steward","exec"],"tech":["multi"],"topics":["pii","governance","quality"]},
    "custom": "i-sensitive-domains", "cdf": "i-cdf-sensitive-domains"},
 ]),
 ("Storage & Cost", [
   {"title": "Storage Footprint & Capacity",
    "sub": "TB by source/type, top-heavy tables, footprint treemap",
    "tags": {"roles":["architect","exec"],"tech":["aws","snowflake"],"topics":["storage","cost"]},
    "custom": "pdc-storage", "cdf": "i-cdf-storage", "cde": "cde-storage"},
   {"title": "Cost Optimization & Sustainability",
    "sub": "cost by source, tiering candidates, CO2e footprint",
    "tags": {"roles":["exec","architect"],"tech":["aws","snowflake"],"topics":["cost","storage"]},
    "custom": "pdc-cost", "cdf": "i-cdf-cost", "cde": "cde-cost"},
 ]),
 ("Usage & People", [
   {"title": "Application & Access Reach",
    "sub": "application usage and data reach — app ↔ source chord, access-type breakdown",
    "tags": {"roles":["steward","architect","exec"],"tech":["salesforce","snowflake"],"topics":["discovery","governance"]},
    "custom": "pdc-applications", "cdf": "i-cdf-applications", "cde": "cde-applications"},
   {"title": "Ownership & Stewardship Gaps",
    "sub": "owned vs unowned, accountability gaps — click source for unowned entity detail",
    "tags": {"roles":["steward","exec","architect"],"tech":["multi"],"topics":["governance","quality"]},
    "custom": "pdc-ownership", "cdf": "i-cdf-ownership", "cde": "cde-ownership"},
   {"title": "Business Glossary & Term Reach",
    "sub": "glossary coverage, term-to-entity reach — click glossary for classified entity drill",
    "tags": {"roles":["steward","exec","architect"],"tech":["multi"],"topics":["glossary","governance"]},
    "custom": "pdc-glossary", "cdf": "i-cdf-glossary", "cde": "cde-glossary"},
   {"title": "Glossary Hierarchy & Term Stewardship",
    "sub": "defined-vs-used adoption gap, hierarchy, types, depth, reach",
    "tags": {"roles":["steward","architect"],"tech":["multi"],"topics":["glossary","governance"]},
    "custom": "i-term-stewardship", "cdf": "i-cdf-term-stewardship"},
 ]),
 ("Data Integration & Lineage", [
   {"title": "Data Integration Health",
    "sub": "platform-movement matrix, throughput, reliability — click integration for flow detail",
    "tags": {"roles":["engineer","architect"],"tech":["pdi","postgres","snowflake"],"topics":["lineage","ops"]},
    "custom": "i-data-integration", "cdf": "i-cdf-data-integration", "cde": "cde-data-integration"},
   {"title": "Data Movement Flows",
    "sub": "✨ Sankey animated flow ribbons of cross-platform data movement by GB",
    "tags": {"roles":["engineer","architect","exec"],"tech":["multi"],"topics":["lineage","ops"]},
    "custom": "i-data-flows", "cdf": "i-cdf-data-flows"},
   {"title": "Schema & Structure Explorer",
    "sub": "schemas, tables, columns, data types, key coverage — click schema for column drill",
    "tags": {"roles":["architect","engineer","steward"],"tech":["multi"],"topics":["schema","quality"]},
    "custom": "i-schema-explorer", "cdf": "i-cdf-schema-explorer"},
   {"title": "Column Health & Key Discovery",
    "sub": "key-candidate detection, dead/constant columns, type mix — click table for column drill",
    "tags": {"roles":["engineer","architect"],"tech":["multi"],"topics":["quality","schema"]},
    "custom": "i-column-health", "cdf": "i-cdf-column-health"},
   {"title": "Data Lineage Observability",
    "sub": "interactive source→target flow graph, blast radius, throughput (click nodes to explore)",
    "tags": {"roles":["engineer","architect","exec"],"tech":["multi"],"topics":["lineage","ops"]},
    "custom": "lineage-explorer"},
   {"title": "Data Movement Observability",
    "sub": "Pentaho CDF dashboard — lineage throughput trends & pipeline reliability",
    "tags": {"roles":["engineer","architect","exec"],"tech":["multi"],"topics":["lineage","ops"]},
    "cdf": "i-cdf-lineage"},
   {"title": "Catalog Data Movement",
    "sub": "CDE-authored .wcdf/.cdfde — editable in Pentaho CDE; GB by source/dest/integration",
    "tags": {"roles":["engineer","architect","exec"],"tech":["multi"],"topics":["lineage","ops"]},
    "cde": "cde-data-movement"},
 ]),
]

# ── Persona "Start Here" guided paths ──────────────────────────────────────────────────────────
# Curated 5-dashboard tour per persona. stem must match an entry in GROUPS above.
PERSONAS = [
    {
        "key": "exec", "label": "Executive", "color": "#e68c17",
        "desc": "Estate health, governance risk & cost at a glance",
        "steps": [
            ("Executive Scorecard",      "i-exec-scorecard"),
            ("Estate Command Center",    "pdc-command-center"),
            ("Policy & Governance",      "pdc-governance"),
            ("Compliance Radar",         "pdc-compliance"),
            ("Cost Optimization",        "pdc-cost"),
        ],
    },
    {
        "key": "steward", "label": "Data Steward", "color": "#059669",
        "desc": "Governance coverage, privacy, glossary & data freshness",
        "steps": [
            ("Policy & Governance",      "pdc-governance"),
            ("Sensitive Data & Privacy", "i-privacy"),
            ("Business Glossary",        "pdc-glossary"),
            ("Data Freshness",           "pdc-freshness"),
            ("Catalog Adoption",         "i-adoption"),
        ],
    },
    {
        "key": "engineer", "label": "Data Engineer", "color": "#0ea5e9",
        "desc": "Pipeline health, quality, column profiling & integration",
        "steps": [
            ("Pipeline Observability",        "pdc-pipeline-obs"),
            ("Data Quality & Completeness",   "pdc-data-quality"),
            ("Column Health & Key Discovery", "i-column-health"),
            ("Data Integration Health",       "i-data-integration"),
            ("Schema & Structure Explorer",   "i-schema-explorer"),
        ],
    },
    {
        "key": "architect", "label": "Data Architect", "color": "#764ba2",
        "desc": "Lineage, data movement, storage design & catalog growth",
        "steps": [
            ("Data Lineage Observability",    "lineage-explorer"),
            ("Data Movement Flows",           "i-data-flows"),
            ("Schema & Structure Explorer",   "i-schema-explorer"),
            ("Storage Footprint & Capacity",  "pdc-storage"),
            ("Catalog Growth & Discovery",    "i-growth"),
        ],
    },
]

# ── Terminology glossary ───────────────────────────────────────────────────────────────────────
GLOSSARY_TERMS = [
    ("Simple HTML",
     "Self-contained HTML build",
     "A dashboard built as a single HTML file that calls CDA REST endpoints directly. "
     "No Pentaho framework required — embeds anywhere: OEM products, portals, static hosting. "
     "Shown as the default in each concept card; toggle to Framework to see the CDF build."),
    ("CDA",
     "Community Data Access",
     "A Pentaho server-side REST API that wraps SQL queries into named DataAccess entries. "
     "Dashboards call CDA endpoints to fetch data — no database credentials in the browser; "
     "one governed data layer, many front-ends."),
    ("CDF",
     "Community Dashboard Framework",
     "The native Pentaho web framework for building interactive dashboards. CDF dashboards "
     "use CCC for charting and can be authored visually in CDE. Powers the 'Framework' "
     "builds — toggle any concept card to see the CDF version."),
    ("CDE",
     "Community Dashboard Editor",
     "A visual drag-and-drop designer inside Pentaho for authoring CDF dashboards without "
     "hand-coding. Produces .wcdf/.cdfde files stored in the Pentaho repository. "
     "Shown as a footnote link on cards that have a CDE edition."),
    ("CCC",
     "Community Chart Components",
     "The charting library used by Framework (CDF) dashboards. Supports bar, line, scatter, "
     "pie, heat-grid, sunburst, and more — all configured in a CDF component definition. "
     "The Simple HTML builds use D3/SVG directly instead."),
    ("PDC-BIDB-EXT",
     "JNDI Connection",
     "The named JNDI connection on the Pentaho server pointing to the catalog data warehouse. "
     "All CDA queries use this connection — no hard-coded credentials or schema prefixes. "
     "Click the ⓘ button on any dashboard to inspect the CDA queries it uses."),
]

def esc(s):
    return str(s).replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")

# ── URL helpers ────────────────────────────────────────────────────────────────────────────────
def href_for(stem):
    if not stem: return "#"
    if stem.startswith("cde-"): return BASE + stem + ".wcdf/generatedContent"
    return BASE + stem + ".html/content"

def thumb_for(stem):
    if not stem: return ""
    return BASE + "thumbs:" + stem + ".jpg/content?cb=" + CB

def dark_thumb_for(stem):
    # Dark-mode launcher thumb (Simple-HTML boards only). Empty when no dark variant.
    if not stem: return ""
    return BASE + "thumbs:" + stem + "-dark.jpg/content?cb=" + CB

# ── Concept card ───────────────────────────────────────────────────────────────────────────────
def concept_card(group, entry):
    title = entry["title"]
    sub   = entry["sub"]
    tags  = entry.get("tags", {})
    cs    = entry.get("custom")   # Custom / Simple HTML stem
    fs    = entry.get("cdf")      # Framework / CDF stem
    des   = entry.get("cde")      # CDE stem

    roles  = tags.get("roles", [])
    tech   = tags.get("tech", [])
    topics = tags.get("topics", [])

    text = " ".join([title, sub, group,
                     " ".join(ROLE_LABELS.get(r, r) for r in roles),
                     " ".join(TECH_LABELS.get(t, t) for t in tech),
                     " ".join(TOPIC_LABELS.get(tp, tp) for tp in topics)]).lower()

    # Primary display: Custom first, then Framework, then CDE
    if cs:
        primary_href  = href_for(cs)
        primary_thumb = thumb_for(cs)
        ph            = cs[0].upper()
        badge_cls     = "cu";  badge_lbl = "Simple HTML"
    elif fs:
        primary_href  = href_for(fs)
        primary_thumb = thumb_for(fs)
        ph            = fs[3].upper() if len(fs) > 3 else "F"
        badge_cls     = "fw";  badge_lbl = "Framework"
    else:
        primary_href  = href_for(des)
        primary_thumb = thumb_for(des)
        ph            = "C"
        badge_cls     = "cde"; badge_lbl = "CDE"

    # Dark-mode thumb exists only for the Simple-HTML (custom) build.
    primary_thumb_dark = dark_thumb_for(cs) if (cs and primary_thumb == thumb_for(cs)) else ""

    # Toggle row — only when has both Custom AND Framework
    toggle = ""
    if cs and fs:
        toggle = (
            '<div class="btrow">'
            '<button class="btb active" data-href="%s" data-thumb="%s" data-thumb-dark="%s" data-badge="cu" data-lbl="Simple HTML">'
            'Simple HTML</button>'
            '<button class="btb" data-href="%s" data-thumb="%s" data-badge="fw" data-lbl="Framework">'
            'Framework</button>'
            '</div>'
        ) % (esc(href_for(cs)), esc(thumb_for(cs)), esc(dark_thumb_for(cs)), esc(href_for(fs)), esc(thumb_for(fs)))

    # CDE footnote — small link when a CDE variant exists alongside Custom/Framework
    cde_note = ""
    if des and (cs or fs):
        cde_note = ('<a class="cde-note" href="%s" target="_blank" rel="noopener"'
                    ' onclick="event.stopPropagation()">Also: CDE (.wcdf) &#8599;</a>') % esc(href_for(des))

    return (
        '<div class="card" data-group="%s" data-roles="%s" data-tech="%s" data-topics="%s" data-text="%s">'
        '<a class="clink thumb" href="%s">'
        '<img loading="lazy" src="%s" data-thumb="%s" data-thumb-dark="%s" alt=""'
        ' onerror="this.style.display=\'none\';this.parentNode.classList.add(\'noimg\')"/>'
        '<span class="ph">%s</span><span class="open">Open &rarr;</span></a>'
        '<span class="meta">'
        '<span class="dt">%s <span class="badge %s">%s</span></span>'
        '%s%s'
        '<span class="ds">%s</span><span class="grp">%s</span></span></div>'
    ) % (
        esc(group),
        esc(" ".join(roles)), esc(" ".join(tech)), esc(" ".join(topics)),
        esc(text),
        primary_href, primary_thumb, primary_thumb, primary_thumb_dark, ph,
        esc(title), badge_cls, badge_lbl,
        toggle, cde_note,
        esc(sub), esc(group)
    )

# ── Persona Start-Here strip ───────────────────────────────────────────────────────────────────
def build_start_here():
    tiles = []
    for p in PERSONAS:
        color = p["color"]
        role  = p["key"]
        steps_li = "".join(
            '<li><a class="sh-lnk" href="%s" target="_blank" rel="noopener"'
            ' onclick="event.stopPropagation()">%s</a></li>'
            % (esc(href_for(stem)), esc(label))
            for label, stem in p["steps"]
        )
        tiles.append(
            '<div class="sh-tile" data-role="%s" style="--tc:%s" onclick="setRole(\'%s\')">'
            '<div class="sh-head" style="background:%s">'
            '<div class="sh-role">%s</div>'
            '<div class="sh-tagline">%s</div></div>'
            '<div class="sh-body">'
            '<div class="sh-hint">Recommended tour</div>'
            '<ol class="sh-path">%s</ol>'
            '<div class="sh-action">Filter these cards &#8594;</div>'
            '</div></div>'
            % (esc(role), color, esc(role), color,
               esc(p["label"]), esc(p["desc"]), steps_li)
        )
    return (
        '<section class="start-here"><div class="wrap">'
        '<div class="sh-bar">'
        '<span class="sh-label">Start Here &mdash; choose your role</span>'
        '<span class="sh-hint-bar">Click a tile to filter the grid; click any dashboard link to open it directly</span>'
        '<button class="sh-clear-btn hidden" id="shClear" onclick="clearRole()">'
        '&#10005;&nbsp;All roles</button>'
        '</div>'
        '<div class="sh-grid">%s</div>'
        '</div></section>'
        % "".join(tiles)
    )

# ── Terminology glossary ───────────────────────────────────────────────────────────────────────
def build_glossary():
    items = "".join(
        '<div class="gl-item">'
        '<div class="gl-abbr">%s</div>'
        '<div class="gl-full">%s</div>'
        '<div class="gl-def">%s</div>'
        '</div>'
        % (esc(abbr), esc(full), esc(defn))
        for abbr, full, defn in GLOSSARY_TERMS
    )
    return (
        '<details class="glossary">'
        '<summary>&#9432;&nbsp;Terminology &mdash; CDA, CDF, CDE, CCC explained for non-technical visitors</summary>'
        '<div class="gl-grid">%s</div>'
        '</details>'
        % items
    )

# ── Build all concept cards ────────────────────────────────────────────────────────────────────
ALL_ENTRIES = [(g, e) for g, items in GROUPS for e in items]
TOTAL   = len(ALL_ENTRIES)  # total concepts (not individual builds)
NPAIRED = sum(1 for _g, e in ALL_ENTRIES if e.get("custom") and e.get("cdf"))
NWCDE   = sum(1 for _g, e in ALL_ENTRIES if e.get("cde"))
# Individual build counts (for the header stat strip)
NCUST   = sum(1 for _g, e in ALL_ENTRIES if e.get("custom"))
NFRAM   = sum(1 for _g, e in ALL_ENTRIES if e.get("cdf"))
NCDE    = sum(1 for _g, e in ALL_ENTRIES if e.get("cde"))

cards_html      = "".join(concept_card(g, e) for g, e in ALL_ENTRIES)
group_names     = [g for g, _ in GROUPS]
start_here_html = build_start_here()
glossary_html   = build_glossary()

# ── Group chips ───────────────────────────────────────────────────────────────────────────────
chips = '<button class="chip active" data-f="group" data-v="">All areas</button>' + \
        "".join('<button class="chip" data-f="group" data-v="%s">%s</button>' % (esc(g), esc(g)) for g in group_names)

# ── Role / Tech / Topic facet chips ──────────────────────────────────────────────────────────
def _facet_chips(facet_key, order, labels, css_class):
    all_btn = '<button class="chip sm %s active" data-f="%s" data-v="">All</button>' % (css_class, facet_key)
    btns = "".join(
        '<button class="chip sm %s" data-f="%s" data-v="%s">%s</button>'
        % (css_class, facet_key, v, esc(labels.get(v, v)))
        for v in order
    )
    return all_btn + btns

rchips  = _facet_chips("role",  ROLE_ORDER,  ROLE_LABELS,  "role")
tpchips = _facet_chips("topic", TOPIC_ORDER, TOPIC_LABELS, "topic")
tcchips = _facet_chips("tech",  TECH_ORDER,  TECH_LABELS,  "tech")

HTML = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Pentaho Data Catalog Analytics Demo Console &mdash; Iteration %(ver)s</title>
<style>
/* Palette aligned to the modern Pentaho console (uikit): primary blue #1775e0, login blue→purple
   gradient (#1775e0→#764ba2), Pentaho accents orange #e68c17 / green #63a621. */
:root{--pdc:#1775e0;--pdc2:#764ba2;--bg:#eef2f8;--panel:#fff;--border:#e2e8f2;--ink:#0f1d2e;--muted:#64748b;--fw:#764ba2;--cu:#1775e0;--cde:#00897b;--accent:#e68c17;}
[data-theme=dark]{--bg:#0d1622;--panel:#15212f;--border:#243343;--ink:#e8eef6;--muted:#90a2b7;}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--ink)}
a{color:inherit;text-decoration:none}
.top{background:linear-gradient(115deg,var(--pdc),var(--pdc2));color:#fff;padding:30px 0 26px;box-shadow:0 8px 30px rgba(5,40,90,.22)}
.wrap{max-width:1340px;margin:0 auto;padding:0 22px}
.brand{display:flex;align-items:center;gap:13px}
.logo{width:38px;height:38px;border-radius:10px;background:rgba(255,255,255,.18);display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:21px}
.bt{font-weight:850;font-size:21px;letter-spacing:.2px}.bs{font-size:13px;opacity:.9}
.spacer{flex:1}
.darkbtn{background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:9px;padding:8px 13px;font-size:13px;font-weight:600;cursor:pointer}
.darkbtn:hover{background:rgba(255,255,255,.28)}
.extlink{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:9px;padding:8px 13px;font-size:13px;font-weight:650;margin-right:9px;white-space:nowrap}
.extlink:hover{background:rgba(255,255,255,.28)}
footer a.extfoot{color:var(--pdc);font-weight:700}
.pubstamp{color:#fff;opacity:.92;font-size:10.5px;line-height:1.3;text-align:right;text-transform:uppercase;letter-spacing:.4px;margin-right:6px}
.pubstamp b{font-size:12.5px;letter-spacing:0;text-transform:none;font-weight:800}
.stats{display:flex;gap:26px;margin-top:18px;flex-wrap:wrap}
.stat .n{font-size:25px;font-weight:850}.stat .l{font-size:11px;text-transform:uppercase;letter-spacing:.7px;opacity:.85}
.search{margin-top:20px;position:relative;max-width:560px}
.search input{width:100%%;padding:13px 16px 13px 42px;border-radius:11px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.14);color:#fff;font-size:15px;outline:none}
.search input::placeholder{color:rgba(255,255,255,.75)}
.search input:focus{background:rgba(255,255,255,.22);border-color:rgba(255,255,255,.6)}
.search svg{position:absolute;left:14px;top:13px;opacity:.85}
/* ── Persona Start-Here strip ──────────────────────────────────────────────────────────────── */
.start-here{background:var(--panel);border-bottom:2px solid var(--border);padding:20px 0 16px}
.sh-bar{display:flex;align-items:center;gap:12px;margin-bottom:13px;flex-wrap:wrap}
.sh-label{font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--pdc)}
.sh-hint-bar{font-size:12px;color:var(--muted);flex:1}
.sh-clear-btn{background:none;border:1px solid var(--border);border-radius:999px;padding:4px 13px;font-size:11.5px;cursor:pointer;color:var(--muted);transition:.13s}
.sh-clear-btn:hover{border-color:var(--pdc);color:var(--pdc)}
.sh-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
@media(max-width:860px){.sh-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:520px){.sh-grid{grid-template-columns:1fr}}
.sh-tile{border:2px solid var(--border);border-radius:12px;overflow:hidden;cursor:pointer;transition:transform .15s,box-shadow .15s,border-color .15s}
.sh-tile:hover,.sh-tile.sh-active{transform:translateY(-2px);box-shadow:0 8px 24px rgba(10,40,90,.14);border-color:var(--tc,var(--pdc))}
.sh-head{padding:12px 14px 10px;color:#fff}
.sh-role{font-weight:800;font-size:14px;margin-bottom:3px}
.sh-tagline{font-size:11px;opacity:.92;line-height:1.4}
.sh-body{padding:10px 14px 12px;background:var(--bg)}
.sh-hint{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);margin-bottom:5px}
.sh-path{margin:0;padding:0 0 0 16px;list-style:decimal}
.sh-path li{font-size:12px;line-height:1.8;color:var(--ink)}
.sh-lnk{color:var(--ink);text-decoration:none;font-weight:600}
.sh-lnk:hover{color:var(--pdc);text-decoration:underline}
.sh-action{margin-top:8px;font-size:11px;color:var(--muted);font-style:italic;transition:.13s}
.sh-tile:hover .sh-action,.sh-tile.sh-active .sh-action{color:var(--pdc);font-style:normal;font-weight:700}
/* ── Terminology glossary ───────────────────────────────────────────────────────────────────── */
.glossary{max-width:760px;margin:20px auto 4px;text-align:left;background:var(--panel);border:1px solid var(--border);border-radius:13px;padding:2px 18px;box-shadow:0 2px 8px rgba(20,40,80,.05)}
.glossary summary{cursor:pointer;font-weight:750;color:var(--pdc);padding:12px 2px;list-style:none;user-select:none;font-size:13px}
.glossary summary::-webkit-details-marker{display:none}
.glossary summary::before{content:"\\25B8  ";color:var(--muted)}
.glossary[open] summary::before{content:"\\25BE  "}
.gl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;padding:4px 2px 16px}
.gl-item{background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px 14px}
.gl-abbr{font-size:18px;font-weight:850;color:var(--pdc);margin-bottom:2px}
.gl-full{font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px}
.gl-def{font-size:12.5px;color:var(--ink);line-height:1.5}
/* ── Main layout ────────────────────────────────────────────────────────────────────────────── */
.toolbar{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--border);padding:10px 0}
.chips{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.frow{margin-top:8px;padding-top:8px;border-top:1px solid var(--border)}
.flabel{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);white-space:nowrap;padding-right:3px}
.chip{border:1px solid var(--border);background:var(--panel);color:var(--ink);border-radius:999px;padding:7px 14px;font-size:13px;font-weight:650;cursor:pointer;transition:.14s}
.chip.sm{padding:5px 11px;font-size:12px;font-weight:600}
.chip:hover{border-color:var(--pdc)}
.chip.active{background:var(--pdc);color:#fff;border-color:var(--pdc)}
/* Role facet — sky blue */
.chip.role:hover{border-color:#0ea5e9}
.chip.role.active{background:#0ea5e9;border-color:#0ea5e9;color:#fff}
/* Topic facet — emerald green */
.chip.topic:hover{border-color:#059669}
.chip.topic.active{background:#059669;border-color:#059669;color:#fff}
/* Tech facet — amber */
.chip.tech:hover{border-color:#d97706}
.chip.tech.active{background:#d97706;border-color:#d97706;color:#fff}
.sep{width:1px;height:22px;background:var(--border);margin:0 3px;flex-shrink:0}
main{padding:26px 0 60px}
.count{color:var(--muted);font-size:13px;margin:2px 2px 16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px}
/* Concept card — <div> with <a class="clink thumb"> inside for navigation */
.card{background:var(--panel);border:1px solid var(--border);border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(20,40,80,.06);transition:transform .16s,box-shadow .16s,border-color .16s;display:flex;flex-direction:column}
.card:hover{transform:translateY(-4px);box-shadow:0 18px 40px rgba(10,40,80,.18);border-color:var(--pdc)}
.clink.thumb{position:relative;display:block;height:174px;background:linear-gradient(135deg,#0b2238,#163a5c);overflow:hidden;line-height:0;text-decoration:none}
.clink.thumb img{display:block;width:100%%;height:100%%;object-fit:cover;object-position:top center;transition:transform .35s}
.card:hover .clink.thumb img{transform:scale(1.05)}
.clink.thumb .ph{position:absolute;inset:0;display:none;align-items:center;justify-content:center;color:#fff;font-size:54px;font-weight:850;opacity:.5}
.clink.thumb.noimg .ph{display:flex}
.clink.thumb .open{position:absolute;right:11px;bottom:10px;background:rgba(0,40,80,.62);color:#fff;border-radius:8px;padding:5px 11px;font-size:12px;font-weight:700;opacity:0;transform:translateY(6px);transition:.18s}
.card:hover .open{opacity:1;transform:none}
.meta{padding:12px 16px 14px;display:flex;flex-direction:column;flex:1}
.dt{font-weight:800;font-size:14.5px;line-height:1.3;display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
/* Build toggle: Simple HTML ⇄ Framework pill buttons */
.btrow{display:flex;gap:5px;margin-bottom:7px;flex-wrap:wrap}
.btb{background:var(--bg);border:1px solid var(--border);border-radius:999px;padding:4px 12px;font-size:11.5px;font-weight:700;cursor:pointer;color:var(--muted);transition:.13s;white-space:nowrap}
.btb:hover{border-color:var(--pdc);color:var(--pdc)}
.btb.active{background:var(--cu);border-color:var(--cu);color:#fff}
.btb.active[data-badge="fw"]{background:var(--fw);border-color:var(--fw)}
/* CDE footnote link */
.cde-note{display:inline-block;font-size:10.5px;color:var(--cde);font-weight:700;margin-bottom:6px;border-bottom:1px dashed var(--cde);padding-bottom:1px}
.cde-note:hover{opacity:.75}
.ds{color:var(--muted);font-size:12.5px;line-height:1.45;flex:1}
.grp{margin-top:8px;font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);font-weight:700}
.badge{font-size:9.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;padding:2px 8px;border-radius:999px;white-space:nowrap}
.badge.cu{background:rgba(0,91,181,.12);color:var(--cu)}
.badge.fw{background:rgba(125,60,152,.13);color:var(--fw)}
[data-theme=dark] .badge.cu{background:rgba(46,139,208,.2);color:#7bb6e8}
[data-theme=dark] .badge.fw{background:rgba(155,89,182,.22);color:#c79be0}
.badge.cde{background:rgba(0,137,123,.14);color:var(--cde)}
[data-theme=dark] .badge.cde{background:rgba(0,137,123,.24);color:#4db6ac}
.empty{display:none;text-align:center;color:var(--muted);padding:50px;font-size:15px}
footer{text-align:center;color:var(--muted);font-size:12.5px;padding:30px 0 50px}
.changelog{max-width:760px;margin:34px auto 0;text-align:left;background:var(--panel);border:1px solid var(--border);border-radius:13px;padding:2px 18px;box-shadow:0 2px 8px rgba(20,40,80,.05)}
.changelog summary{cursor:pointer;font-weight:750;color:var(--pdc);padding:13px 2px;list-style:none;user-select:none;font-size:13.5px}
.changelog summary::-webkit-details-marker{display:none}
.changelog summary::before{content:"\\25B8  ";color:var(--muted)}
.changelog[open] summary::before{content:"\\25BE  "}
.cllog{list-style:none;margin:0;padding:2px 0 14px;max-height:380px;overflow:auto}
.cllog>li{display:flex;gap:14px;padding:11px 2px;border-top:1px solid var(--border)}
.cllog .when{color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums;flex:0 0 108px;font-size:11.5px;padding-top:2px}
.cllog .what{flex:1;min-width:0}
.cllog .clhl{font-weight:700;font-size:13px;color:var(--ink);line-height:1.35}
.cllog .clsub{margin:5px 0 0;padding:0 0 0 17px;color:var(--muted);font-size:12px;line-height:1.5}
.cllog .clsub li{margin:1px 0}
.hidden{display:none!important}
</style></head>
<body>
<header class="top"><div class="wrap">
  <div class="brand"><span class="logo">P</span>
    <div><div class="bt">Pentaho Data Catalog Analytics Demo Console</div><div class="bs">demo &middot; iteration %(ver)s &middot; sample dashboards over real catalog metadata</div></div>
    <div class="spacer"></div>
    <div class="pubstamp" title="When this server&#39;s launcher was last published">published<br><b>%(published)s</b></div>
    <a class="extlink" href="https://analytics.polecat.live" target="_blank" rel="noopener" title="Open the public analytics showcase">Public showcase &#8599;</a>
    <button class="darkbtn" id="darkBtn" onclick="toggleTheme()">&#9790; Dark</button>
  </div>
  <div class="stats">
    <div class="stat"><div class="n">%(total)d</div><div class="l">Concepts</div></div>
    <div class="stat"><div class="n">%(npaired)d</div><div class="l">With Framework twin</div></div>
    <div class="stat"><div class="n">%(ncust)d</div><div class="l">Simple HTML builds</div></div>
    <div class="stat"><div class="n">%(nfram)d</div><div class="l">Framework builds</div></div>
    <div class="stat"><div class="n">%(ncde)d</div><div class="l">CDE builds</div></div>
    <div class="stat"><div class="n">%(ngrp)d</div><div class="l">Domains</div></div>
  </div>
  <div class="search">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
    <input id="q" type="text" placeholder="Search by title, topic, role, platform&hellip;" autocomplete="off"/>
  </div>
</div></header>
%(start_here)s
<div class="toolbar"><div class="wrap">
  <div class="chips">%(chips)s</div>
  <div class="chips frow">
    <span class="flabel">Role</span>%(rchips)s
    <span class="sep"></span>
    <span class="flabel">Topic</span>%(tpchips)s
    <span class="sep"></span>
    <span class="flabel">Tech</span>%(tcchips)s
  </div>
</div></div>
<main><div class="wrap">
  <div class="count" id="count"></div>
  <div class="grid" id="grid">%(cards)s</div>
  <div class="empty" id="empty">No dashboards match your filters.</div>
  %(changelog)s
  %(glossary)s
</div></main>
<footer><div class="wrap">Pentaho Data Catalog Analytics &middot; iteration %(ver)s &middot; published <b>%(published)s</b> &middot; click any card thumbnail to open the live dashboard &middot; each card shows Simple HTML and Framework (CDF) builds via the toggle &middot; data via CDA over <code>PDC-BIDB-EXT</code><br>Public showcase: <a class="extfoot" href="https://analytics.polecat.live" target="_blank" rel="noopener">analytics.polecat.live &#8599;</a></div></footer>
<script>
var fG="",fR="",fTp="",fTc="",q="";
function toggleTheme(){var d=document.documentElement,c=d.getAttribute('data-theme')==='dark'?'light':'dark';d.setAttribute('data-theme',c);localStorage.setItem('pdc-theme',c);document.getElementById('darkBtn').innerHTML=c==='dark'?'&#9728; Light':'&#9790; Dark';applyThumbTheme();}
(function(){var t=localStorage.getItem('pdc-theme')||'light';document.documentElement.setAttribute('data-theme',t);var b=document.getElementById('darkBtn');b.innerHTML=t==='dark'?'&#9728; Light':'&#9790; Dark';})();
var cards=[].slice.call(document.querySelectorAll('.card'));
function thumbSrc(el){var dark=document.documentElement.getAttribute('data-theme')==='dark';var d=el.getAttribute('data-thumb-dark');return (dark&&d)?d:el.getAttribute('data-thumb');}
function applyThumbTheme(){document.querySelectorAll('.clink img[data-thumb]').forEach(function(img){var s=thumbSrc(img);if(s)img.src=s;});}
function hasTag(val,list){return !val||(' '+list+' ').indexOf(' '+val+' ')>=0;}
function apply(){var n=0;cards.forEach(function(c){
  var ok=(!fG||c.dataset.group===fG)
        &&hasTag(fR,c.dataset.roles)
        &&hasTag(fTp,c.dataset.topics)
        &&hasTag(fTc,c.dataset.tech)
        &&(!q||c.dataset.text.indexOf(q)>=0);
  c.classList.toggle('hidden',!ok);if(ok)n++;});
  document.getElementById('count').textContent=n+' of '+cards.length+' concepts';
  document.getElementById('empty').style.display=n?'none':'block';}
document.getElementById('q').addEventListener('input',function(e){q=e.target.value.trim().toLowerCase();apply();});
/* Facet chip click handler — keeps persona tiles in sync */
document.querySelectorAll('.chip').forEach(function(ch){ch.addEventListener('click',function(){
  var f=ch.dataset.f,v=ch.dataset.v;
  if(f==='group')fG=v;
  else if(f==='role'){fR=v;_syncTiles(v);var clr=document.getElementById('shClear');if(clr)clr.classList.toggle('hidden',!v);}
  else if(f==='topic')fTp=v;else if(f==='tech')fTc=v;
  document.querySelectorAll('.chip[data-f="'+f+'"]').forEach(function(x){x.classList.toggle('active',x===ch);});
  apply();});});
/* Persona tile helpers */
function _syncTiles(role){
  document.querySelectorAll('.sh-tile').forEach(function(t){
    t.classList.toggle('sh-active',!!role&&t.dataset.role===role);});
}
function setRole(role){
  fR=role;
  document.querySelectorAll('.chip[data-f="role"]').forEach(function(ch){
    ch.classList.toggle('active',ch.dataset.v===role);});
  _syncTiles(role);
  var clr=document.getElementById('shClear');if(clr)clr.classList.toggle('hidden',!role);
  apply();
  var tb=document.querySelector('.toolbar');
  if(tb)tb.scrollIntoView({behavior:'smooth',block:'start'});
}
function clearRole(){setRole('');}
/* Build toggle: switch Simple HTML ⇄ Framework within a concept card */
document.querySelectorAll('.btb').forEach(function(btn){
  btn.addEventListener('click',function(e){
    e.preventDefault();e.stopPropagation();
    var card=btn.closest('.card');
    card.querySelectorAll('.btb').forEach(function(b){b.classList.remove('active');});
    btn.classList.add('active');
    var link=card.querySelector('.clink');
    if(link&&btn.dataset.href)link.href=btn.dataset.href;
    var img=card.querySelector('.clink img');
    if(img&&btn.dataset.thumb){img.setAttribute('data-thumb',btn.dataset.thumb);img.setAttribute('data-thumb-dark',btn.dataset.thumbDark||'');img.src=thumbSrc(img);}
    var badge=card.querySelector('.badge');
    if(badge){badge.className='badge '+btn.dataset.badge;badge.textContent=btn.dataset.lbl;}
  });
});
apply();applyThumbTheme();
</script>
</body></html>"""

CHANGELOG = changelog_block(build_changelog())
html = HTML % {"ver": VERSION, "total": TOTAL, "npaired": NPAIRED, "ncust": NCUST,
               "nfram": NFRAM, "ncde": NCDE, "ngrp": len(group_names),
               "chips": chips, "rchips": rchips, "tpchips": tpchips, "tcchips": tcchips,
               "cards": cards_html, "published": PUBLISHED, "changelog": CHANGELOG,
               "start_here": start_here_html, "glossary": glossary_html}
open(OUT, "w").write(html)
print("i-home console regenerated for %s (%d bytes, %d concepts, %d paired / %d Custom / %d Framework / %d CDE)"
      % (VERSION, len(html), TOTAL, NPAIRED, NCUST, NFRAM, NCDE))
