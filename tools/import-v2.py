#!/usr/bin/env python3
"""import-v2.py — import the v2 PDC dashboards into the Dashboard Studio model.

Pure stdlib. Reads from the v2 content/dashboards dir and writes three outputs into
the dashboard-studio project:

  1. data/cda-catalog.json   — every *.cda parsed (connection + dataAccess defs + SQL + cols)
  2. data/sample-data.json   — deterministic synthetic rows per dataAccess id (offline charts)
  3. data/examples/<stem>.studio.json — each cde-*.cdfde board converted to a Studio spec

Re-run to regenerate; output is deterministic (no randomness, no time).
"""
import json, os, re, glob
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(HERE)                       # repo root
SRC  = os.path.join(PROJ, "reference", "dashboards")
DATA = os.path.join(PROJ, "data")
EXDIR = os.path.join(DATA, "examples")

# ──────────────────────────────────────────────────────────────────────────────
# 1. CDA catalog
# ──────────────────────────────────────────────────────────────────────────────

def _ws(s):
    """Collapse all whitespace runs to single spaces and trim."""
    return re.sub(r"\s+", " ", (s or "")).strip()

AS_RE = re.compile(r"\bAS\s+([A-Za-z_][A-Za-z0-9_]*)", re.IGNORECASE)

def cols_from_sql(sql):
    """Best-effort SELECT-list output aliases: every `AS <alias>` (case-insensitive),
    in order of appearance, de-duplicated (first occurrence wins)."""
    seen, out = set(), []
    for m in AS_RE.finditer(sql):
        a = m.group(1)
        if a.lower() not in seen:
            seen.add(a.lower())
            out.append(a)
    return out

def parse_cda(path):
    stem = os.path.splitext(os.path.basename(path))[0]
    root = ET.parse(path).getroot()
    conn = {"id": None, "jndi": None}
    c = root.find(".//{*}Connection")
    if c is None:  # namespace-free fallback
        c = root.find(".//Connection")
    if c is not None:
        conn["id"] = c.get("id")
        jndi = c.find("{*}Jndi")
        if jndi is None:
            jndi = c.find("Jndi")
        conn["jndi"] = (jndi.text.strip() if jndi is not None and jndi.text else None)

    accesses = []
    for da in root.iter():
        tag = da.tag.split("}")[-1]
        if tag != "DataAccess":
            continue
        name_el = da.find("{*}Name")
        if name_el is None:
            name_el = da.find("Name")
        name = (name_el.text.strip() if name_el is not None and name_el.text else "")
        params = []
        for p in da.iter():
            if p.tag.split("}")[-1] == "Parameter":
                params.append({"name": p.get("name"),
                               "type": p.get("type"),
                               "default": p.get("default")})
        q_el = da.find("{*}Query")
        if q_el is None:
            q_el = da.find("Query")
        sql = _ws(q_el.text if q_el is not None else "")
        cache = (da.get("cache", "false").lower() == "true")
        try:
            cache_dur = int(da.get("cacheDuration") or 0)
        except ValueError:
            cache_dur = 0
        accesses.append({
            "id": da.get("id"),
            "name": name,
            "params": params,
            "cache": cache,
            "cacheDuration": cache_dur,
            "sql": sql,
            "columns": cols_from_sql(sql),
        })
    return stem, {"file": stem + ".cda", "connection": conn, "dataAccesses": accesses}

def build_catalog():
    catalog = {}
    for path in sorted(glob.glob(os.path.join(SRC, "*.cda"))):
        try:
            stem, entry = parse_cda(path)
            catalog[stem] = entry
        except Exception as e:  # noqa: keep going, record skip
            SKIPPED_CDA.append((os.path.basename(path), str(e)))
    return catalog

SKIPPED_CDA = []

# ──────────────────────────────────────────────────────────────────────────────
# 2. Sample data — deterministic synthetic rows from column-name heuristics
# ──────────────────────────────────────────────────────────────────────────────

CATS   = ["Snowflake", "Amazon S3", "Oracle", "PostgreSQL", "SharePoint",
          "Databricks", "BigQuery", "Salesforce"]
SENS   = ["HIGH", "MEDIUM", "LOW", "Unclassified"]
OWNER  = ["A. Chen", "R. Patel", "M. Garcia", "—", "J. Kim"]
STATUS = ["Success", "Failed", "Aborted", "Running"]
APP    = ["Tableau", "PowerBI", "Looker", "Excel", "Custom API"]
EXT    = ["pdf", "xlsx", "csv", "docx", "json", "parquet"]
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

def _has(name, *subs):
    n = name.lower()
    return any(s in n for s in subs)

def is_label_col(name):
    """Columns that should hold category/string labels rather than numbers."""
    n = name.lower()
    if _has(n, "src", "source", "datasource", "platform", "system"):
        return "cat"
    if _has(n, "sens", "sensitivity"):
        return "sens"
    if _has(n, "owner"):
        return "owner"
    if _has(n, "status", "state"):
        return "status"
    if _has(n, "app", "application"):
        return "app"
    if _has(n, "extension"):
        return "ext"
    if _has(n, "term", "glossary", "category", "type", "restype"):
        return "term"
    if _has(n, "month", "ymn", "ym", "date") and not _has(n, "cumulative"):
        return "month"
    if _has(n, "name"):
        return "name"
    return None

def cell(name, i, n):
    """Deterministic value for column `name`, row index i (0-based), of n rows."""
    kind = is_label_col(name)
    if kind == "cat":
        return CATS[i % len(CATS)]
    if kind == "sens":
        return SENS[i % len(SENS)]
    if kind == "owner":
        return OWNER[i % len(OWNER)]
    if kind == "status":
        return STATUS[i % len(STATUS)]
    if kind == "app":
        return APP[i % len(APP)]
    if kind == "ext":
        return EXT[i % len(EXT)]
    if kind == "term":
        return "Type %s" % chr(ord("A") + (i % 12))
    if kind == "month":
        return MONTHS[i % 12]
    if kind == "name":
        return CATS[i % len(CATS)] + " asset %d" % (i + 1)

    # numeric heuristics
    nm = name.lower()
    if _has(nm, "cum", "cumulative"):
        # monotonically increasing
        return int(1200 * (i + 1))
    if _has(nm, "cost", "usd", "monthly", "annual", "reclaim", "savings"):
        return round(50000 / (i + 1))
    if _has(nm, "co2e", "tonnes"):
        return round(42.0 / (i + 1), 2)
    if _has(nm, "bytes"):
        return int((i + 1) * 1.3e11)
    if _has(nm, "tb"):
        return round(40 - (i * 38.0 / max(n - 1, 1)), 1)  # 40..2 range
    if _has(nm, "gb"):
        return round(900 - (i * 850.0 / max(n - 1, 1)), 1)  # 900..50 range
    if _has(nm, "pct", "rate", "percent", "completeness", "coverage"):
        return round(100 - (i * 95.0 / max(n - 1, 1)), 1)  # 100..5 descending
    if _has(nm, "count", "runs", "assets", "files", "total", "num") or nm == "n":
        return int(5000 - i * 600)
    # generic numeric: descending ints from ~1000
    return int(1000 - i * 90)

def gen_rows(columns, nrows=8):
    cols = list(columns)
    # The first column is usually the label/category; if it's not already a
    # recognised label kind, treat it as a category for nicer charts.
    rows = []
    # detect an x-axis month/date column to keep calendar order (gen_rows index is
    # already in calendar order because cell() maps i→MONTHS[i]).
    # The first column is the label/category axis: if it isn't a recognised
    # label kind, force category labels (avoids a numeric x-axis on bar/pie).
    first_is_label = bool(cols) and is_label_col(cols[0]) is not None
    for i in range(nrows):
        row = []
        for ci, c in enumerate(cols):
            v = cell(c, i, nrows)
            if ci == 0 and (v is None or (not first_is_label and isinstance(v, (int, float)))):
                v = CATS[i % len(CATS)]
            elif v is None:
                v = "Type %s" % chr(ord("A") + (i % 12))
            row.append(v)
        rows.append(row)
    return rows

def build_sample_data(catalog):
    out = {}
    for stem, entry in catalog.items():
        for da in entry["dataAccesses"]:
            did = da["id"]
            cols = da["columns"]
            if not cols:
                # no parseable columns -> skip (record once)
                if did not in out:
                    SKIPPED_DA.setdefault(did, "no AS aliases in SQL")
                continue
            if did in out:
                # keep the richer column set
                if len(cols) <= len(out[did]["cols"]):
                    continue
            out[did] = {"cols": cols, "rows": gen_rows(cols, 8)}
    return out

SKIPPED_DA = {}

# ──────────────────────────────────────────────────────────────────────────────
# 3. CDE board -> Studio spec
# ──────────────────────────────────────────────────────────────────────────────

def unescape_html(s):
    if s is None:
        return ""
    for a, b in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                 ("&quot;", '"'), ("&#39;", "'"), ("&apos;", "'")):
        s = s.replace(a, b)
    return s

def read_wcdf(stem):
    path = os.path.join(SRC, stem + ".wcdf")
    title, desc = stem, ""
    if os.path.exists(path):
        txt = open(path, encoding="utf-8").read()
        mt = re.search(r"<title>(.*?)</title>", txt, re.S)
        md = re.search(r"<description>(.*?)</description>", txt, re.S)
        if mt:
            title = unescape_html(mt.group(1).strip())
        if md:
            desc = unescape_html(md.group(1).strip())
    # strip a trailing " (CDE)"
    title = re.sub(r"\s*\(CDE\)\s*$", "", title)
    return title, desc

def infer_group(title):
    t = title.lower()
    if any(k in t for k in ("cost", "storage")):
        return "Storage & Cost"
    if any(k in t for k in ("governance", "compliance", "privacy")):
        return "Governance & Privacy"
    if any(k in t for k in ("pipeline", "quality", "freshness", "observability", "growth")):
        return "Observability"
    if any(k in t for k in ("application", "ownership", "glossary")):
        return "Usage & People"
    if any(k in t for k in ("integration", "movement")):
        return "Data Integration"
    return "Observability"

def title_case_id(da_id):
    """costBySource -> 'Cost By Source'. Split camelCase / on capitals + separators."""
    # split on non-alnum first
    parts = re.split(r"[_\-\s]+", da_id)
    words = []
    for p in parts:
        # split camelCase: insert boundary before a capital that follows a lowercase/digit
        sub = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", p)
        sub = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", " ", sub)
        words.extend(w for w in sub.split(" ") if w)
    return " ".join(w[:1].upper() + w[1:] for w in words)

CTYPE_MAP = {
    "ComponentscccBarChart": "bars",
    "ComponentscccPieChart": "donut",
    "ComponentscccLineChart": "line",
}

def props_to_dict(comp):
    d = {}
    for p in comp.get("properties", []):
        d[p.get("name")] = p.get("value")
    return d

def fmt_for(da_id, columns):
    blob = (da_id + " " + " ".join(columns)).lower()
    if "cost" in blob or "usd" in blob:
        return "money"
    if "tb" in blob or "gb" in blob or "bytes" in blob:
        return "gb"
    if "pct" in blob or "rate" in blob:
        return "pct"
    return "abbr"

def build_example(stem, catalog):
    cdfde_path = os.path.join(SRC, stem + ".cdfde")
    cdfde = json.load(open(cdfde_path, encoding="utf-8"))
    title, desc = read_wcdf(stem)

    # CDA defs for this stem (self-contained)
    cat = catalog.get(stem, {"connection": {}, "dataAccesses": []})
    da_by_id = {d["id"]: d for d in cat["dataAccesses"]}

    # map layout column name -> columnSpan
    span_by_colname = {}
    for row in cdfde.get("layout", {}).get("rows", []):
        if row.get("type") == "LayoutColumn":
            pd = props_to_dict(row)
            nm = pd.get("name")
            try:
                span_by_colname[nm] = int(pd.get("columnSpan") or 0)
            except ValueError:
                span_by_colname[nm] = 0

    panels = []
    skipped = []
    pi = 0
    for comp in cdfde.get("components", {}).get("rows", []):
        ctype = comp.get("type")
        if ctype not in CTYPE_MAP:
            # skip the "CHARTS" Label group row and anything non-CCC
            if ctype != "Label":
                skipped.append((stem, ctype))
            continue
        pd = props_to_dict(comp)
        da_id = pd.get("dataSource")
        da = da_by_id.get(da_id)
        columns = da["columns"] if da else []
        if len(columns) < 2:
            skipped.append((stem, "%s/%s (cols<2)" % (ctype, da_id)))
            continue
        label_col = columns[0]
        value_col = columns[1]
        kind = CTYPE_MAP[ctype]

        chart = {"type": kind, "da": da_id, "map": {"labelCol": label_col}}
        if kind == "line":
            chart["map"]["valueCol"] = value_col  # harmless; series is the driver
            chart["series"] = [{"col": value_col}]
        else:
            chart["map"]["valueCol"] = value_col

        opts = {"fmt": fmt_for(da_id, columns), "valuesVisible": True}
        if kind == "bars":
            opts["horizontal"] = (pd.get("orientation") == "horizontal")
        chart["opts"] = opts

        # span from the layout column matching htmlObject ${h:<colname>}
        ho = pd.get("htmlObject") or ""
        m = re.match(r"\$\{h:(.+)\}", ho)
        colname = m.group(1) if m else None
        cspan = span_by_colname.get(colname, 0)
        span = "full" if cspan == 24 else 1

        pi += 1
        panels.append({
            "id": "p%d" % pi,
            "title": title_case_id(da_id),
            "span": span,
            "chart": chart,
        })

    spec = {
        "schema": 1,
        "id": stem,
        "name": stem,
        "title": title,
        "description": desc,
        "group": infer_group(title),
        "cda": {
            "connection": cat["connection"],
            "dataAccesses": cat["dataAccesses"],
        },
        "gridCols": 2,
        "panels": panels,
    }
    return spec, skipped

# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

def main():
    os.makedirs(DATA, exist_ok=True)
    os.makedirs(EXDIR, exist_ok=True)

    catalog = build_catalog()
    with open(os.path.join(DATA, "cda-catalog.json"), "w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=2, ensure_ascii=False)

    sample = build_sample_data(catalog)
    with open(os.path.join(DATA, "sample-data.json"), "w", encoding="utf-8") as f:
        json.dump(sample, f, indent=2, ensure_ascii=False)

    written = []
    all_skipped_comps = []
    for cdfde in sorted(glob.glob(os.path.join(SRC, "cde-*.cdfde"))):
        stem = os.path.splitext(os.path.basename(cdfde))[0]
        spec, skipped = build_example(stem, catalog)
        all_skipped_comps += skipped
        out = os.path.join(EXDIR, stem + ".studio.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(spec, f, indent=2, ensure_ascii=False)
        written.append((stem, len(spec["panels"])))

    # ── validate every output parses ──
    json.load(open(os.path.join(DATA, "cda-catalog.json"), encoding="utf-8"))
    json.load(open(os.path.join(DATA, "sample-data.json"), encoding="utf-8"))
    for stem, _ in written:
        json.load(open(os.path.join(EXDIR, stem + ".studio.json"), encoding="utf-8"))

    print("catalog stems:      %d" % len(catalog))
    print("sample-data keys:   %d" % len(sample))
    print("example boards:     %d" % len(written))
    for stem, npanels in written:
        print("  %-26s panels=%d" % (stem, npanels))
    if SKIPPED_CDA:
        print("skipped CDA files:")
        for fn, err in SKIPPED_CDA:
            print("  %s: %s" % (fn, err))
    if all_skipped_comps:
        print("skipped components:")
        for s in all_skipped_comps:
            print("  %r" % (s,))
    if SKIPPED_DA:
        print("dataAccesses with no sample data (no AS aliases): %d" % len(SKIPPED_DA))
        for did, why in SKIPPED_DA.items():
            print("  %s: %s" % (did, why))

if __name__ == "__main__":
    main()
