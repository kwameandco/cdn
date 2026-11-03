# cdn.kwameand.co: one-time Cloudflare setup

The publish workflow can deploy the plugins to our own domain, `https://cdn.kwameand.co`, but only
once two secrets exist in this repo. Until then every run says "skipping the cdn.kwameand.co
deploy" and jsDelivr carries on as before. This is the setup, start to finish. About 15 minutes.

Written 2026-11-03 by OpieChild from Cloudflare's docs and the studio runbooks. Nobody has clicked
through it yet, so where a label is marked "label may differ", look for the nearest match and
correct this file afterwards.

## What gets made

| Thing | Value |
|---|---|
| Cloudflare account | Kwame's (`websitesbykwame@gmail.com`), the one that already holds `kwameand.co` |
| Worker | `kwameandco-cdn` (created by the first deploy, not by hand) |
| Domain | `cdn.kwameand.co`, a Worker custom domain (also created by the first deploy) |
| API token | `GitHub Actions - kwameandco/cdn`, its own token so it can be revoked on its own |
| GitHub secrets | `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in `kwameandco/cdn` |

There is no "Import a repository" step. The Worker is deployed by this repo's GitHub Actions
workflow, not by Workers Builds, because the workflow is what builds the files.

## Step 1. Check nothing already uses `cdn.kwameand.co`

1. Open https://dash.cloudflare.com and sign in as `websitesbykwame@gmail.com`.
2. Click the domain **kwameand.co**.
3. Left menu: **DNS** → **Records**.
4. In the search box type `cdn`.
5. **Success:** no record named `cdn`. Go to step 2.
   **If a `cdn` record exists:** stop and tell the session what it points at. The first deploy
   cannot create the custom domain over an existing record, and something may be using it.

## Step 2. Copy the Account ID

1. Still on the **kwameand.co** domain page, click **Overview** in the left menu.
2. Scroll the right-hand column to the **API** section (label may differ).
3. Next to **Account ID**, click **Click to copy**.
4. Paste it into Notepad for now. It is a 32-character string of letters and numbers. It is not
   secret, but keep it out of chat anyway.

(Also shown under **Workers & Pages** → right-hand column → **Account ID**.)

## Step 3. Create the API token

1. Top right of the dashboard: the person icon → **My Profile** (label may differ: **Profile**).
2. Left menu: **API Tokens**.
3. Click **Create Token**.
4. Find the template **Edit Cloudflare Workers** and click **Use template** next to it.
5. At the top, click the pencil next to the token name and rename it to
   `GitHub Actions - kwameandco/cdn`.
6. Leave **Permissions** as the template sets them. They include Account → Workers Scripts → Edit
   (to upload the Worker) and Zone → Workers Routes → Edit (to create `cdn.kwameand.co`).
7. **Account Resources:** `Include` → the Kwame account (the one holding kwameand.co). Not
   "All accounts".
8. **Zone Resources:** `Include` → `Specific zone` → `kwameand.co`. Not "All zones".
9. **Client IP Address Filtering:** leave empty (GitHub's runners have no fixed IP).
10. **TTL:** leave empty, so it does not expire silently. Put a reminder to rotate it yearly.
11. Click **Continue to summary**, check it lists one account and the one zone, then
    **Create Token**.
12. Click **Copy** on the token. **It is shown once only.** Paste it into Notepad next to the
    Account ID. Never paste it into a chat.

## Step 4. Add both secrets to GitHub

1. Open https://github.com/kwameandco/cdn/settings/secrets/actions
   (or: the repo → **Settings** → left menu **Secrets and variables** → **Actions**).
2. Click **New repository secret**.
3. **Name:** `CLOUDFLARE_API_TOKEN`. **Secret:** the token from step 3. Click **Add secret**.
4. Click **New repository secret** again.
5. **Name:** `CLOUDFLARE_ACCOUNT_ID`. **Secret:** the Account ID from step 2. Click **Add secret**.
6. **Success:** the list under **Repository secrets** shows `CLIENTS_READ_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
7. Delete the Notepad text without saving it.

## Step 5. Run the workflow once

1. Open https://github.com/kwameandco/cdn/actions/workflows/publish-plugins.yml
2. Click **Run workflow** (right side) → leave `plugin` as `all`, leave `dry_run` unticked →
   green **Run workflow**.
3. Click the run that appears and open the **publish** job.
4. **Success:** the last step, **Deploy to cdn.kwameand.co**, is green and its log ends with lines
   like `Uploaded kwameandco-cdn`, `Deployed kwameandco-cdn triggers` and `cdn.kwameand.co (custom
   domain)`. The first deploy can take a few minutes while the certificate is issued.

**Likely failures:**

| What the log says | What it means and what to do |
|---|---|
| `skipping the cdn.kwameand.co deploy` (a notice, step is green) | A secret is missing or misnamed. Re-check step 4: the names must match exactly. |
| `Authentication error [code: 10000]` | The token lacks a permission or is scoped to the wrong account or zone. Redo step 3, replace the `CLOUDFLARE_API_TOKEN` secret (click it → **Update secret**), run again. |
| Fails at the custom domain with a permissions error, after `Uploaded kwameandco-cdn` | The Worker went up but the token cannot create the domain. Add it by hand: **Workers & Pages** → **kwameandco-cdn** → **Settings** → **Domains & Routes** → **Add** → **Custom Domain** → `cdn.kwameand.co` → **Add Custom Domain**. Then run the workflow again; it should go green. |
| `already has externally managed DNS records` (or similar) | A `cdn` record exists. See step 1. |
| Any other red step **above** Deploy | Not this setup. jsDelivr publishing has its own problem; read that step's log. |

## Step 6. Check it from your machine

Open **PowerShell** (Start menu → type PowerShell → Windows PowerShell). Any folder will do.
Run each block in turn.

A versioned file (should be cached for a year):

```powershell
$r = Invoke-WebRequest -Method Head -UseBasicParsing "https://cdn.kwameand.co/kw-filter/1.6.1/kw-filter.min.js"
$r.StatusCode; $r.Headers["Cache-Control"]; $r.Headers["Content-Type"]; $r.Headers["Access-Control-Allow-Origin"]
```

**Success** looks like:

```
200
public, max-age=31536000, immutable
text/javascript; charset=utf-8
*
```

The latest alias (should be cached for five minutes):

```powershell
$r = Invoke-WebRequest -Method Head -UseBasicParsing "https://cdn.kwameand.co/kw-filter/latest/kw-filter.min.js"
$r.StatusCode; $r.Headers["Cache-Control"]
```

**Success:** `200` then `public, max-age=300`.

A file that does not exist (should be a 404 that is never cached):

```powershell
try { Invoke-WebRequest -Method Head -UseBasicParsing "https://cdn.kwameand.co/kw-filter/9.9.9/nope.js" } catch { $_.Exception.Response.StatusCode.value__; $_.Exception.Response.Headers["Cache-Control"] }
```

**Success:** `404` then `no-store`. (PowerShell 5.1 treats a 404 as an error, which is why this
one is wrapped in `try`.)

**If the first command fails** with "The remote name could not be resolved", the domain is not
set up yet: wait five minutes and try again, then check **Workers & Pages** → **kwameandco-cdn**
→ **Settings** → **Domains & Routes** lists `cdn.kwameand.co`. If it says "Could not establish
trust relationship" the certificate is still being issued: wait ten minutes.

## Step 7. Tell the session

Say "cdn.kwameand.co is live" and paste the output of step 6. The next job is switching each
site's embeds from jsDelivr to the new URLs (`kwameandco/clients` → `tasks/open/44`), site by
site. jsDelivr keeps working throughout.

## Afterwards

- **Privacy:** Worker logs, traces and observability are switched off in `wrangler.jsonc`. Leave
  them off. If the dashboard ever shows **Observability** → **Logs** as enabled for
  `kwameandco-cdn`, a deploy from this repo turns it back off.
- **Rotating the token:** create a new one (step 3), update the secret (step 4, **Update
  secret**), run the workflow, then delete the old token under **My Profile** → **API Tokens**.
- **Removing it:** delete both secrets; runs skip the deploy again. The Worker stays up serving
  its last files until it is deleted in the dashboard.
