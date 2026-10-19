# Market Study App

An unbranded study app for the Nov 1 – Dec 8, 2026 market study (Market Study Prospectus, Ver. 1):

1. **Consent**: explains recording; nothing is real.
2. **Screener**: age, travel, vehicle, license, parking habits, rental scenarios. Under-18s stop immediately.
3. **Brand-blind survey**: the prospectus's Q1–Q9, plus trip length, distance to the airport, and sharing-economy history (marked *Added*).
4. **Qualification**: sorts people into Owner, Renter, or both using the prospectus persona rules. Dual-qualifiers get both journeys in random order, and the order is recorded.
5. **Guided prototype**: the real design screens, debranded, and set at the airport each participant picks (prefilled from their survey answers), run one task at a time. The 10 checkpoint questions (plus the added H2 earnings questions) pop up over the paused screen at the moments the prospectus specifies.
6. **Wrap-up**: interview opt-in (stored separately) and a personal referral link for recruiting.

Everything is tracked from consent onward:

- taps, dead taps, and rage taps, with position
- field focus and time spent (lengths only, never typed values)
- choices, scroll depth, idle time, and hidden tabs
- blocked links and back navigation
- per-screen active time and time to first tap
- full session replays (rrweb, with all inputs masked)

The admin area at `/admin` shows a funnel, survey charts, journey drop-off and timing, checkpoint results, click heatmaps, per-participant timelines and replays, a stratified interview sampler, and CSV exports.

## Stack

Next.js 15 (App Router) on Vercel · Supabase (Postgres, Storage, Auth for admins only) · rrweb · Tailwind 4 · Playwright.

## Setup

### 1. Supabase

1. Create a project.
2. In **SQL Editor**, run `supabase/migrations/20261017000000_init.sql`. This creates the tables, enables RLS with no public access, creates a private `replays` storage bucket, and adds the analysis views.
3. Add admins with `insert into admin_users (email) values ('you@example.com');`, or list them in `ADMIN_EMAILS`.
4. In **Authentication → URL Configuration**, set the Site URL to your Vercel URL and add `https://<your-domain>/admin/auth/callback` to the redirect URLs.
5. Supabase's built-in email only delivers to members of your Supabase organization. Either invite each admin under **Organization → Team**, or set up custom SMTP (for example Resend) under **Authentication → Emails**.

### 2. Vercel

Import the repo and set these environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_APP_NAME` | Name participants see on the screens (default "Airport Parking") |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key (used only for admin sign-in) |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key (server only) |
| `STUDY_SIGNING_SECRET` | output of `openssl rand -hex 32` |
| `ADMIN_EMAILS` | comma-separated admin emails |

Never set `STUDY_LOCAL_STORE` on Vercel. The app ignores it there anyway.

### 3. Local development

```bash
npm install
STUDY_LOCAL_STORE=1 npm run dev      # data goes to ./.data, /admin opens without login
```

`/?new=1` starts a fresh participant on the same browser.

## Changing things

| To change… | Edit |
|---|---|
| App name, price, fallback airport, **claims** (insurance, monitoring, shuttle, renter vetting) | `config/study.ts` |
| Screener, survey, and checkpoint wording | `config/questions.ts` |
| Journey order, task text, which checkpoint fires where | `config/journeys.ts` |
| The prototype screens themselves | `scripts/clean-screens.mjs`, then `npm run screens` |

### Regenerating screens from a new design export

```bash
mkdir -p design && cp path/to/Jeinus_Prototype.html design/prototype.html
npm run screens          # extract → screens/raw (git-ignored), clean → public/screens
npm run check:brand      # fails if any brand name, SFO, $50, Stripe or Square remains
```

Every patch in `clean-screens.mjs` must match exactly, so a design change that breaks a hook fails loudly instead of shipping a broken screen. The brand check also runs before every `npm run build`.

## How screens talk to the app

Each screen loads in a same-origin `srcdoc` iframe with a small bridge injected first (`src/lib/client/screens.ts`). Links, form submits, and `window.__nav` become **signals** like `nav:membership`. Patched moments in the screens call `__study.pause('book')` (freeze and ask checkpoints) or `__study.signal('confirmed')`. `config/journeys.ts` decides which signals advance, which pause, and which checkpoints follow. Navigation to an earlier step goes back. Anything else is blocked with a toast and logged.

## Data

| Table | Contents |
|---|---|
| `participants` | status, persona, journey order, device, referral, resume state |
| `responses` | one row per answer: `screener`, `survey`, `checkpoint`, `behavior` (e.g. rental opt-in, daily price, car chosen), `wrapup` |
| `events` | every interaction; `step_exit` rows carry the per-screen timing summary |
| `replay_chunks` + `replays` bucket | gzipped rrweb events |
| `interview_contacts` | kept apart so it can be deleted on its own |

Exports are at `/admin/export`. Spreadsheet formula injection is neutralized.

## Tests

```bash
npm run build
npx playwright test      # owner, renter, dual (both orders), screened out, under 18, admin; mobile + desktop
```

The tests run against a production build with local storage and assert on what was stored, including that typed emails and passwords never appear in events.
