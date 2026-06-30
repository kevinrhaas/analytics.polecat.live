#!/bin/bash
################################################################################
# deploy-db.sh — provision the warehouse objects a target schema needs for the
#                PDC iteration dashboards, ADDITIVELY and idempotently.
#
# WHY THIS EXISTS
#   The dashboards (portable: they connect to the named PDC-BIDB-EXT datasource and
#   use UNQUALIFIED table names) need a fixed set of dimensions / facts / lineage
#   objects to exist in whatever schema the server's connection resolves to. A
#   freshly-pointed schema (e.g. prod `bidb_ext`) may be only partially built. This
#   script ensures the full set exists in the TARGET schema.
#
# HOW IT BUILDS
#   The canonical "build from source" DDL (content/ddl) rebuilds these matviews from
#   the FDW source catalog (10.80.230.246/bidb). When the target database cannot
#   reach that catalog (e.g. an AWS RDS with no route to the VPN), this script instead
#   CLONES each missing object from a REFERENCE schema in the SAME database that is
#   already fully built (default `bidb_ext_dev`). Because every PDC schema FDWs the
#   SAME source catalog, a clone is data-equivalent to a source build — and it works
#   without the catalog being reachable.
#
# SAFETY (important)
#   - ADDITIVE ONLY. For each object: if it already exists in the target schema it is
#     LEFT UNTOUCHED (skipped). Nothing is ever dropped, replaced, or altered.
#   - Never touches the reference schema (read-only) or any other schema.
#   - --dry-run shows exactly what it would create without writing anything.
#
# USAGE
#   PGPASSWORD=... ./deploy-db.sh [--dry-run] <target_schema> [ref_schema] [host] [db] [user]
#     target_schema           schema to provision (e.g. bidb_ext)
#     ref_schema  (bidb_ext_dev)   complete schema to clone from (same database)
#     host (airlinesample.cyj079bqebpx.us-west-2.rds.amazonaws.com)
#     db   (postgres)   user (postgres)
#
#   e.g.  PGPASSWORD=Password1 ./deploy-db.sh --dry-run bidb_ext
#         PGPASSWORD=Password1 ./deploy-db.sh bidb_ext
################################################################################
set -uo pipefail

DRY_RUN="false"; UPGRADE_STALE="false"
while [ $# -gt 0 ]; do
  case "${1:-}" in
    --dry-run)       DRY_RUN="true"; shift ;;
    --upgrade-stale) UPGRADE_STALE="true"; shift ;;   # also rebuild pre-existing objects that REF has extra columns for
    *) break ;;
  esac
done

TGT="${1:?target_schema required (e.g. bidb_ext)}"
REF="${2:-bidb_ext_dev}"
HOST="${3:-airlinesample.cyj079bqebpx.us-west-2.rds.amazonaws.com}"
DB="${4:-postgres}"
USER="${5:-postgres}"
: "${PGPASSWORD:?set PGPASSWORD for the target database}"
export PGPASSWORD

PSQL=(psql -h "$HOST" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -qtAX)

# Objects the dashboards require, in dependency order. Tables/views first so the
# v_stg view (which UNIONs the base + demo staging tables) resolves in the target.
# (Matviews are cloned WITH DATA, so they don't depend on the target's staging.)
TABLES=(stg_lineage_event stg_lineage_event_demo entity_storage_demo)
VIEWS=(v_stg_lineage_event)
MVIEWS=(dim_application dim_policy dim_temperature dim_lineage_event_type dim_lineage_job \
        fact_entity_application fact_entity_policy fact_extension_daily fact_temperature_daily \
        fact_pipeline_run fact_lineage_event fact_lineage_connection)

echo "==> deploy-db: provisioning schema '$TGT'  (clone source: '$REF')  @ $HOST/$DB"
[ "$DRY_RUN" = "true" ] && echo "    DRY RUN — no writes will be made"

exists() { # schema, relname  -> prints relkind or empty
  "${PSQL[@]}" -c "SELECT c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='$1' AND c.relname='$2';"
}
refcount() { "${PSQL[@]}" -c "SET search_path TO $REF,public; SELECT count(*) FROM $1;" 2>/dev/null; }

CREATED=0; SKIPPED=0; FAILED=0

run_sql() {
  if [ "$DRY_RUN" = "true" ]; then return 0; fi
  if "${PSQL[@]}" -c "$1"; then return 0; else return 1; fi
}

provision() { # relname  kind(r|v|m)
  local rel="$1" want="$2" have
  have="$(exists "$TGT" "$rel")"
  if [ -n "$have" ]; then
    printf "    [SKIP]   %-26s already in %s (relkind=%s)\n" "$rel" "$TGT" "$have"
    SKIPPED=$((SKIPPED+1)); return 0
  fi
  if [ -z "$(exists "$REF" "$rel")" ]; then
    printf "    [WARN]   %-26s not in reference %s — cannot clone\n" "$rel" "$REF"
    FAILED=$((FAILED+1)); return 0
  fi
  local n sql
  case "$want" in
    r) n="$(refcount "$rel")"; sql="CREATE TABLE $TGT.$rel AS SELECT * FROM $REF.$rel;" ;;
    m) n="$(refcount "$rel")"; sql="CREATE MATERIALIZED VIEW $TGT.$rel AS SELECT * FROM $REF.$rel WITH DATA;" ;;
    v) # recreate the view definition, retargeted from REF schema to TGT schema
       local def
       def="$("${PSQL[@]}" -c "SELECT pg_get_viewdef('$REF.$rel'::regclass, true);")"
       def="${def//$REF./$TGT.}"
       n="(view)"; sql="CREATE VIEW $TGT.$rel AS $def" ;;
  esac
  if [ "$DRY_RUN" = "true" ]; then
    printf "    [CREATE] %-26s <- %s.%s  (%s rows)\n" "$rel" "$REF" "$rel" "$n"
    CREATED=$((CREATED+1)); return 0
  fi
  if run_sql "$sql"; then
    printf "    [CREATE] %-26s <- %s.%s  (%s rows)\n" "$rel" "$REF" "$rel" "$n"
    CREATED=$((CREATED+1))
  else
    printf "    [FAIL]   %-26s\n" "$rel"; FAILED=$((FAILED+1))
  fi
}

echo "--> tables"; for r in "${TABLES[@]}"; do provision "$r" r; done
echo "--> views ";  for r in "${VIEWS[@]}";  do provision "$r" v; done
echo "--> materialized views"; for r in "${MVIEWS[@]}"; do provision "$r" m; done

# ── Optional: upgrade pre-existing objects that are STALE (REF has columns the
#    target lacks — e.g. an older partial build of dim_entity / fact_entity_snapshot).
#    SAFE: each stale object (and any dependents) is RENAMEd to <name>_preupg_<ts>
#    (preserved, reversible) and recreated as a clone of REF, all in ONE transaction
#    (all-or-nothing). REF columns must be a SUPERSET of the target's (verified).
UPGRADED=0
if [ "$UPGRADE_STALE" = "true" ]; then
  echo "--> upgrade-stale: scanning for pre-existing objects REF has extra columns for"
  TS="preupg_$(date +%Y%m%d%H%M%S)"
  # objects present in BOTH schemas where REF has at least one column the target lacks
  STALE="$("${PSQL[@]}" -c "
    WITH tcols AS (SELECT c.relname, a.attname FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='$TGT' AND a.attnum>0 AND NOT a.attisdropped),
         rcols AS (SELECT c.relname, a.attname FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='$REF' AND a.attnum>0 AND NOT a.attisdropped)
    SELECT DISTINCT r.relname FROM rcols r
    WHERE EXISTS (SELECT 1 FROM tcols t WHERE t.relname=r.relname)
      AND NOT EXISTS (SELECT 1 FROM tcols t WHERE t.relname=r.relname AND t.attname=r.attname)
    ORDER BY 1;")"
  if [ -z "$STALE" ]; then
    echo "    (none — all shared objects already current)"
  else
    # expand to include matview/view dependents in the target (recreate detaches them)
    local_set=""
    for s in $STALE; do
      deps="$("${PSQL[@]}" -c "
        SELECT DISTINCT dc.relname FROM pg_depend d
        JOIN pg_rewrite rw ON rw.oid=d.objid
        JOIN pg_class dc ON dc.oid=rw.ev_class JOIN pg_namespace dn ON dn.oid=dc.relnamespace
        JOIN pg_class sc ON sc.oid=d.refobjid JOIN pg_namespace sn ON sn.oid=sc.relnamespace
        WHERE sn.nspname='$TGT' AND sc.relname='$s' AND dc.relname<>'$s';")"
      local_set+=" $s $deps"
    done
    SET="$(echo $local_set | tr ' ' '\n' | sort -u | grep -v '^$')"
    echo "    stale+dependents to upgrade: $(echo $SET | tr '\n' ' ')"
    # build one transaction: rename-backup all, then recreate each as a REF clone
    TX="BEGIN;"
    for o in $SET; do TX+=" ALTER MATERIALIZED VIEW $TGT.$o RENAME TO ${o}_${TS};"; done
    for o in $SET; do
      k="$(exists "$REF" "$o")"
      case "$k" in
        m) TX+=" CREATE MATERIALIZED VIEW $TGT.$o AS SELECT * FROM $REF.$o WITH DATA;" ;;
        r) TX+=" CREATE TABLE $TGT.$o AS SELECT * FROM $REF.$o;" ;;
      esac
    done
    TX+=" COMMIT;"
    if [ "$DRY_RUN" = "true" ]; then
      echo "    [DRY] would run (rename->backup + recreate from $REF, single tx):"; echo "$TX" | tr ';' '\n' | sed 's/^ */      /'
    else
      if "${PSQL[@]}" -c "$TX"; then
        for o in $SET; do printf "    [UPGRADE] %-26s (old kept as ${o}_${TS})\n" "$o"; UPGRADED=$((UPGRADED+1)); done
      else
        echo "    [FAIL] upgrade transaction rolled back — target unchanged"; FAILED=$((FAILED+1))
      fi
    fi
  fi
fi

echo "==> done. created=$CREATED upgraded=$UPGRADED skipped=$SKIPPED failed=$FAILED"
[ "$FAILED" -gt 0 ] && exit 1 || exit 0
