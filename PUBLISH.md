# Publishing PDC Dashboard Studio → analytics.polecat.live

The Studio is a static site, so it hosts on GitHub Pages with no build step. **This repository *is*
the published site** — GitHub Pages serves the repo root directly, so there's no mirror/publish step:
push to the deploy branch and the live site updates.

## 1. Enable GitHub Pages on this repo

**Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)`.**

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

**Now — passcode (soft gate, already on).** `app/gate-config.js` holds the SHA-256 of the passcode.
Default passcode: **`pentaho-studio`**. Change it:

```bash
node -e 'console.log(require("crypto").createHash("sha256").update("YOUR NEW CODE").digest("hex"))'
# paste the hash into app/gate-config.js → window.STUDIO_GATE_SHA256, then commit + push
```

This is a speed-bump only — static assets are still downloadable. For **real** gating:

**Later — SSO / email allow-list (recommended).** Front the site with **Cloudflare Access** (Zero Trust,
free up to 50 users):
1. Put `polecat.live` on Cloudflare DNS (proxied), or add the subdomain as a Cloudflare Pages custom domain.
2. Zero Trust → Access → Applications → add `analytics.polecat.live`.
3. Policy: allow a named email list, a domain, or Google / Okta SSO.
Then every visitor authenticates before the site loads.

To disable the passcode once Access is in front, set `window.STUDIO_GATE_SHA256 = ""` and re-deploy.

## Notes

- **Live Pentaho features** (doQuery preview, import, push) need a server reachable from the browser —
  a public-cloud Studio can't reach a `localhost` Pentaho. Use it standalone (sample data + export),
  point connections at a reachable/CORS-enabled Pentaho, or run `tools/push.js` from a networked host.
- **First-run welcome tour** explains the demo; reopen any time via **ⓘ Tour**. Reset with
  `localStorage.removeItem('studio-welcome-seen')`.
- Re-deploy after any change by pushing to the Pages branch.
