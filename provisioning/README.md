# Provisioning — the data layer the dashboards read from

These artifacts stand up and load the warehouse that the PDC dashboards query. They were migrated
here from the previous monorepo's `iteration/v2/` (`content/ddl`, `content/utility`, and the
iteration deploy scripts).

| Folder | What it is |
|--------|------------|
| `ddl/` | Warehouse DDL — the full object tree: setup, staging, dimensions, facts, refresh, and seeds. `ddl/00-execute-all.sql` runs them in order; see `ddl/README.md`. |
| `etl/` | Pentaho **Kettle** jobs (`.kjb`) and transforms (`.ktr`) — lineage loaders, the sample variable manager, and the main refresh script — plus their `.properties`. |
| `deploy/` | Deployment scripts: `deploy-db.sh` (provision warehouse objects into a target schema, additively/idempotently), `deploy.sh` (publish the iteration's dashboard suite to a Pentaho server), `deploy-https.sh`, and `VERSION`. |

> Note: these scripts were authored for the iteration-v2 server layout (deploy path
> `/public/pdc-iteration/v2`) and a specific PDC environment. Review the variables at the top of each
> script before running against your own server.
