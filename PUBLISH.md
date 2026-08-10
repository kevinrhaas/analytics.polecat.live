# Publishing Analytics Dashboard Studio → analytics.polecat.live

The Studio is a static site with no build step, and **this repository *is* the published site** —
but it is no longer served straight off a branch. `.github/workflows/deploy.yml` assembles the
Pages artifact and publishes it, so there is still no mirror/publish step: **merging to `main`
is what ships.**

## 1. Enable GitHub Pages on this repo

**Settings → Pages → Build and deployment → Source → `GitHub Actions`.**

Not the branch-serving option GitHub offers by default — switching back to it would take this
repo's deploy workflow out of the path and, with it, the two preview stages below. `deploy.yml`
replaced the branch pipeline for two reasons its own header states: the branch pipeline has no
concurrency control (a newer push cancels an in-flight deploy instead of queueing behind it),
and the artifact it publishes now carries three trees rather than one:

| Path | Tree | What it is |
|---|---|---|
| `/` | the `main` branch | **production** — the real `sw.js`, indexed |
| `/stage/` | the `stage` branch | the release candidate — re-based paths, a self-unregistering SW stub, `noindex`, a stage banner |
| `/dev/` | the `dev` branch | integration, assembled the same way |

`tools/stage-preview.mjs` assembles the previews at deploy time from whichever of those refs
exist, so the artifact root is always production and the previews are always a rebuild rather
than a commit. **Only `main` deploys** — the `github-pages` environment refuses any other ref —
so a push to `dev` or `stage` re-dispatches this same workflow on `main`, which rebuilds the
whole artifact and refreshes both previews. **[docs/PIPELINE.md](docs/PIPELINE.md)** is how a
change travels dev → stage → main, and which gate has to be green at each hop.

The committed `CNAME` sets the custom domain to `analytics.polecat.live`.

## 2. DNS (GoDaddy — domain `polecat.live`)

In GoDaddy: **My Products → `polecat.live` → DNS → Manage Zones**, then add a record so the
`analytics` subdomain points at GitHub Pages:

```
Type    Name        Value                     TTL
CNAME   analytics   kevinrhaas.github.io      1 hour
```

> If you wanted the **apex** domain (`polecat.live`, no subdomain) you'd use four `A` records to
> GitHub's IPs (185.199.108.153, .109.153, .110.153, .111.153) instead. For the `analytics`
> subdomain, the single `CNAME` above is all you need.

After the DNS record propagates, GitHub provisions HTTPS automatically (Settings → Pages → "Enforce
HTTPS"). Allow a few minutes to an hour for the certificate.

## 3. Gating

**Now — sign-in (soft gate, already on).** Every page renders `app/gate.js`'s username/password
screen first, authenticating against the user store in `app/auth.js` — the local demo accounts
(`admin`/`admin`, `demo`/`demo`) out of the box, or the `users` table of whatever workspace backend
you connect the app to (Settings → Workspace, or "Connect to your workspace" right on the sign-in
screen). Manage accounts in-app under **Admin**, the admin-only rail section, which opens on the
user list; passwords are stored as salted PBKDF2 digests, never plaintext.

> The single site-wide **passcode** this section used to describe was retired when the sign-in
> screen landed. Its config file (`app/gate-config.js`, `window.STUDIO_GATE_SHA256`) had no readers
> left and was deleted in v852 (AUD-09) — there is nothing to rotate any more.

This is a speed-bump only — static assets are still downloadable. For **real** gating:

**Later — SSO / email allow-list (recommended).** Front the site with **Cloudflare Access** (Zero Trust,
free up to 50 users):
1. Put `polecat.live` on Cloudflare DNS (proxied), or add the subdomain as a Cloudflare Pages custom domain.
2. Zero Trust → Access → Applications → add `analytics.polecat.live`.
3. Policy: allow a named email list, a domain, or Google / Okta SSO.
Then every visitor authenticates before the site loads.

With Access in front, the app's own sign-in screen stays — it is what identifies the user *inside*
the app (per-user rights, saved layouts), so it is not redundant with the perimeter.

## Notes

- **Connections are made from the visitor's browser, not from a server.** Whatever a connection
  points at therefore has to be reachable from that browser and send CORS headers for this origin:
  a public-cloud Studio cannot reach a `localhost` database, Snowflake and Databricks need this
  origin allow-listed on the account, and the file-over-HTTP source types need CORS plus Range
  requests. With nothing reachable to point at, the app still works standalone — install a sample
  pack and export.
- **First-run welcome tour** explains the demo; reopen it any time from **⌘K → Take the tour**
  (**⌘K → Interactive tutorial** opens the longer in-app walkthrough instead). Reset it with
  `localStorage.removeItem('studio-welcome-seen')`.
- **Re-deploying is merging.** `deploy.yml` runs on the push, so a merge to `main` republishes the
  site and a merge to `dev` refreshes `/dev/` — nothing is published by hand.
