# Serbia Journey Radar

A deployable MVP for monitoring Serbian transport disruptions and generating a daily operational briefing.

## What works in this starter

- Next.js + TypeScript dashboard
- Supabase/PostgreSQL persistence
- Scheduled Vercel Cron collection endpoint
- Configurable RSS and HTML-page source adapters
- Keyword-based incident classification, deduplication, source timestamps, and status tracking
- Daily briefing assembled from stored incidents
- Manual review labels to avoid presenting unverified information as fact

## Important data-quality note

The source URLs included in `.env.example` are starting points, not a guarantee that every site provides a stable RSS feed or permits automated extraction. Check each publisher's terms and robots policy before enabling collection. Some pages may be JavaScript-rendered or provide maps rather than machine-readable incidents. The collector records only what it can extract and logs failures; it does not invent incidents or delay estimates.

This MVP does **not** claim to calculate actual route-specific impact because no Flix route network has been provided. "Potential relevance" is a keyword-based triage label, not proof a journey is affected.

## 1. Create accounts

You need:
- GitHub account
- Vercel account
- Supabase account

## 2. Create the GitHub repository

1. On GitHub, create a new **private** repository named `serbia-journey-radar`.
2. Do not initialize it with a README, license, or `.gitignore` because this project already includes them.
3. Download and unzip this project.
4. In a terminal inside the unzipped project folder, run:

```bash
git init
git add .
git commit -m "Initial Serbia Journey Radar MVP"
git branch -M main
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/serbia-journey-radar.git
git push -u origin main
```

Replace `YOUR-GITHUB-USERNAME` with your GitHub username.

If Git is not installed, install it from https://git-scm.com/downloads. Alternatively, create the repository on GitHub and upload the extracted project files through the GitHub website.

## 3. Create the Supabase database

1. Create a Supabase project.
2. Open **SQL Editor**.
3. Paste and run the complete contents of `supabase/schema.sql`.
4. Open **Project Settings → API** (or the project's API settings page).
5. Copy the Project URL and `service_role` key. The service-role key is secret and must only be stored in server-side environment variables. Never put it in a `NEXT_PUBLIC_` variable or commit it to GitHub.

## 4. Configure environment variables

Copy `.env.example` to `.env.local` for local development and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` (use a long random secret)
- optional `SOURCE_URLS`

Example:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET=replace-with-a-long-random-secret
SOURCE_URLS=https://www.putevi-srbije.rs/index.php/sr/stanje-na-drzavnim-putevima,https://www.amss.org.rs/na-putu/stanje-na-putu/strana/mapa
```

Do not commit `.env.local`. The included `.gitignore` excludes it.

## 5. Install and run locally

Install Node.js LTS from https://nodejs.org, then run:

```bash
npm install
npm run dev
```

Open http://localhost:3000.

To run collection locally, send a POST request to:

```bash
curl -X POST http://localhost:3000/api/collect \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

The collector may report that a source failed or yielded no candidate incidents. That is preferable to fabricating data. Inspect the terminal logs and source website behavior.

## 6. Deploy to Vercel

1. In Vercel, select **Add New → Project** and import your GitHub repository.
2. Add the same environment variables from `.env.local` in Vercel Project Settings → Environment Variables.
3. Deploy.
4. Confirm the site loads.
5. Test the collector by invoking `POST https://YOUR-DOMAIN/api/collect` with `Authorization: Bearer YOUR_CRON_SECRET`.

`vercel.json` schedules collection daily at 05:00 UTC. Check Vercel's current Cron availability and execution limits for your plan before relying on the schedule. The endpoint is protected by `CRON_SECRET`.

## 7. How collection works

- RSS URLs are parsed as RSS/Atom when possible.
- HTML pages are parsed for links and visible text.
- Candidate entries are classified with conservative keyword rules.
- Entries are upserted by stable source URL/hash.
- The app stores source and collection timestamps.
- An entry is initially marked `needs_review`; it is not represented as a confirmed journey impact.
- A daily briefing shows the latest candidate items and their source links.

### Known MVP limitations

1. Public websites can change layout or block automated access.
2. The initial HTML extractor may not see content loaded only by JavaScript.
3. Traffic maps often do not expose individual incidents as text.
4. The keyword classifier can miss items or produce false positives.
5. This version does not provide live traffic speed, ETA, or verified delay-minute estimates.
6. Before operational use, validate the source coverage and incident accuracy manually.

## Suggested next milestones

1. Verify each source adapter against real pages and publisher terms.
2. Add explicit source-specific parsers for stable official announcement pages.
3. Add an incident review workflow and change history.
4. Add a geographic map and corridor matching once routes are known.
5. Add email delivery only after daily report accuracy is validated.
