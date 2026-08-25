# LifeLoop

LifeLoop is an AI-powered platform that helps you decide what to do with things
you no longer need. Scan an item and LifeLoop recommends whether to keep,
repair, reuse, resell, donate, or recycle it — helping reduce waste and give
everyday items a second life.

This includes a **full working backend**: real accounts, real password
security, a real ranked recommendation engine (with optional Gemini AI
upgrade), photo uploads, AI-generated repair/reuse/resale/donation/recycling
guides, scan history with search and filters, saved items, and real
usage-based dashboard stats — all running on your own computer.

## Quick start (one click)

1. Unzip this folder anywhere on your computer.
2. **Windows:** double-click `start.bat`
   **macOS / Linux:** double-click `start.sh` (or run `./start.sh` in a terminal)
3. The script installs everything it needs and opens LifeLoop in your browser
   at **http://localhost:3000**
4. Create an account on the sign-in page, then start scanning items.

Everything — your account, your password (safely hashed, never stored in
plain text), every item you scan, and any photos you upload — is stored
locally on your own machine in `backend/data/` and `backend/uploads/`.
Nothing is sent anywhere else, except optionally to Google's Gemini API for
the "Ask LifeLoop" chatbot and AI-generated guides (see below).

The **first account created** on a fresh install is automatically made an
administrator (reserved for future admin features).

To stop the app, close the terminal window / press Ctrl+C. To start it again
later, just run the start script again — it won't reinstall anything that's
already there, and your account and items are saved between runs.

## What's inside

- `frontend/` — the entire client-side app (HTML, CSS, JS, images), kept in
  its own folder for easy independent deployment:
  - `login.html` — sign in / create an account
  - `index.html` — scan items, see your recent scans and dashboard stats
  - `history.html` — search, filter, sort, and manage everything you've scanned
  - `community.html` — feed, create posts, search, leaderboard
  - `profile.html` — your (or anyone's) profile: bio, badges, challenges, posts
  - `css/`, `js/`, `assets/` — styles, scripts, and images (unchanged visual
    design from the original prototype; `js/chrome.js`, `js/itemView.js`, and
    `js/postCard.js` hold logic shared between pages; `js/icons.js` is a
    small shared library of inline SVG icons used throughout — no emoji or
    icon fonts anywhere in the UI)
- `backend/` — the Node.js/Express server:
  - `src/server.js` — entry point; serves both the API and the files in `frontend/`
  - `src/routes/auth.js` — register, login, logout, session check
  - `src/routes/items.js` — scan an item, list/search/filter, guides, stats, QR decode
  - `src/routes/community.js` — posts, comments, likes, follows, badges, challenges, leaderboard, moderation
  - `src/routes/jobs.js` — poll background job status
  - `src/services/recommendation.js` — the ranked recommendation + identification engine
  - `src/services/assistants.js` — repair/reuse/resell/donate/recycle guide generation
  - `src/services/ai/` — the provider-agnostic AI service; `providers/geminiProvider.js` is the active (Gemini) implementation
  - `src/services/badges.js`, `src/services/challenges.js` — gamification logic
  - `src/services/ocr.js` — text extraction from photos
  - `src/services/barcode.js` — QR code decoding
  - `src/services/jobQueue.js` — in-process background job runner
  - `src/middleware/` — authentication and rate limiting
  - `src/db.js` — simple JSON-file storage (no database software to install)
  - `openapi.json` — the API specification served at `/api-docs`
  - `data/` — where your accounts and scanned items are saved (created automatically)
  - `uploads/` — photos you scan or post are saved here
- `start.sh` / `start.bat` — one-click install-and-run scripts

## Core features

**Scanning**
- Name, category, condition, age, and up to 6 photos per item (front, back,
  damage close-ups, labels, etc.)
- Optional brand/model/material fields if you already know them

**Recommendations**
- Every scan ranks all six actions — keep, repair, reuse, resell, donate,
  recycle — each with a confidence level and a plain-language explanation,
  not just one hardcoded answer
- If a photo-based identification is uncertain, LifeLoop says so honestly
  instead of guessing a brand or model it can't actually see
- You can correct the identification (e.g. "that's not a chair, it's a
  stool") and LifeLoop re-analyzes with your correction

**Guides**
- For repair, reuse, resell, donate, or recycle recommendations, LifeLoop can
  generate a dedicated guide: a repair walkthrough with safety notes, several
  reuse ideas, a draft resale listing (with a clear "estimate, not a
  guarantee" disclaimer on any price), donation prep guidance, or recycling
  prep guidance

**Tracking**
- LifeLoop separately tracks what it *recommended* versus what you *actually
  did* with an item — dashboard statistics are based only on actions you've
  actually logged, never invented numbers

**History**
- Search by name, filter by category/condition/action/saved/completed, sort
  by newest/oldest/life-potential, and page through results
- Save items for later, add personal notes, mark items as done

## AI Integration

Out of the box, LifeLoop uses a built-in scoring model for scanning: it looks at an item's
category, condition, and age, and works out a life-potential score plus a
ranked, explained recommendation for all six possible actions. This works
completely offline, for free, with no setup.

If you want real AI-powered features for the **"Ask LifeLoop" chatbot** and
**detailed guides** (repair, reuse, resell, etc.), add your own
**Google Gemini API key** (Gemini has a free tier):

1. Get a free key at https://aistudio.google.com/apikey
2. Open `backend/.env` (created automatically on first run, from `backend/.env.example`)
3. Set `GEMINI_API_KEY=your-key-here`
4. Restart the app

That's it — no other setup. `GEMINI_MODEL` in `.env` controls which model is
used (default: `gemini-3.6-flash`, which supports image input and has been
available on Google's free tier). Google's free-tier lineup changes over
time; check https://ai.google.dev/pricing and update `GEMINI_MODEL` if the
default stops being free or gets replaced by a newer model.

If the Gemini call ever fails for any reason — missing/invalid key, rate limit, quota
exceeded, timeout, network issue, or an unparseable response — the chatbot will securely
display an error message without breaking the rest of the application. You'll never see 
an error from scanning, as it relies purely on the built-in heuristic model.

**Architecture note:** the AI integration is built as a provider-agnostic
service (`backend/src/services/ai/`) rather than being hardwired to Gemini
throughout the codebase. `recommendation.js` and `assistants.js` call this
service, not Gemini directly — so adding support for another AI provider
later means adding one new file under `services/ai/providers/`, not
rewriting the app. Which provider is active is controlled by `AI_PROVIDER`
in `.env` (only `gemini` is implemented today).

## Accounts and security

- Passwords are hashed with bcrypt before being stored.
- Sessions use a signed, httpOnly cookie, so JavaScript on the page can't
  read or tamper with your session token.
- Login and registration are rate-limited to slow down brute-force attempts.
- Uploaded photos are validated by file type and size, capped at 6 per scan,
  and their actual content is verified (not just the filename/MIME type a
  client claims) before being accepted.
- User-generated content (names, item names, comments, report reasons) is
  escaped before being inserted into the page, closing a stored-XSS path
  found during a security audit.
- API errors follow a consistent `{ success, error, message }` shape and
  never leak internal details like stack traces.
- No CORS is configured — the frontend and API are served from the same
  origin, so no cross-origin access is needed or granted.
- Standard security headers are set on every response (`X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`).
- Dependencies are kept free of known vulnerabilities (`npm audit` reports
  zero as of this writing).
- This app is built to run on your own computer at `localhost`. If you ever
  want to host it somewhere accessible over the internet, first change
  `JWT_SECRET` in `backend/.env` to a long random value, enable the
  `secure` cookie flag in `backend/src/routes/auth.js` (it's commented there),
  and put it behind HTTPS (e.g. via a reverse proxy) — LifeLoop itself
  doesn't terminate TLS, since that's normally handled by whatever serves it
  to the internet, not the application server itself.

**Items that don't apply to this architecture:** row-level security and
"use a public DB key" are concepts specific to hosted database platforms
like Supabase/Postgres; LifeLoop stores data in local JSON files with all
access already mediated by the Express backend, so there's no separate
database layer these would attach to. Parameterized queries likewise don't
apply — there's no SQL. Bot protection (e.g. CAPTCHA) isn't implemented;
for a single-user local app the realistic threat model doesn't call for it,
but rate limiting is in place as a lighter-weight mitigation for the same
class of abuse.

## Deploying Frontend and Backend Separately (e.g. Vercel + Render)

LifeLoop is configured to allow the frontend to be deployed independently of the backend (for example, hosting the frontend on Vercel and the backend API on Render).

To do this, you must set up the connection between them:
1. **Frontend**: Open `frontend/js/config.js` and change `API_BASE_URL` to point to your live backend URL (e.g., `https://your-backend.onrender.com/api`).
2. **Backend**: In your backend hosting dashboard (e.g., Render or Railway), add a new environment variable `FRONTEND_URL` and set it to your live frontend URL (e.g., `https://your-frontend.vercel.app`). This tells the backend to allow cross-origin requests (CORS) from your frontend.

*Note: Cross-origin authentication relies on `SameSite=None` cookies. Many browsers (like Safari) block these third-party cookies by default. If users cannot log in, they may need to disable tracking prevention, or you must host both on the same root domain.*

## Deploying beyond your own machine (Railway)

If you are deploying LifeLoop to a hosting platform like Railway, you must be aware of its architectural limitations. LifeLoop was designed to run locally, so it uses local files for data storage and memory for background jobs.

**1. Persistent Storage (CRITICAL)**
LifeLoop stores all accounts, items, posts, and uploaded photos as local JSON files and images. In an ephemeral environment like Railway, **your data will be permanently lost on every redeploy or restart** unless you attach a persistent volume.
- **Railway Volume Setup:**
  1. In your Railway project dashboard, click **Create** > **Volume**.
  2. Attach the volume to your LifeLoop service.
  3. Note the "Mount Path" you assign to the volume (e.g., `/app/data`).
  4. In the Railway Variables tab, set `DATA_DIR` and `UPLOADS_DIR` to point to folders inside that mount path (e.g. `DATA_DIR=/app/data/json` and `UPLOADS_DIR=/app/data/uploads`).

**2. Single-Instance Limitations**
The background job queue (used for generating AI guides) and the rate limiters (protecting login/registration) run purely in-memory. They **assume a single running process**.
- Do not scale your Railway service to multiple replicas/instances. If you do, background jobs and rate limits will not be shared across them. Keep it at a single instance.

**3. Railway Environment Variables**
Configure the following in the Railway dashboard "Variables" tab:
- `JWT_SECRET` (Required) — Set to a long, secure random string. The app will refuse to boot without this.
- `NODE_ENV` (Required) — Set to `production`. This enforces secure session cookies (HTTPS only).
- `DATA_DIR` (Required) — The absolute path inside your Railway volume for JSON files.
- `UPLOADS_DIR` (Required) — The absolute path inside your Railway volume for image uploads.
- `GEMINI_API_KEY` (Optional) — Enable the chatbot and AI features.
- `GEMINI_MODEL` (Optional) — e.g. `gemini-1.5-flash-latest`.

**4. Networking and Build**
- LifeLoop uses a `railway.json` file in the root to tell Railway to enter the `backend/` directory for builds (`npm install`) and start commands (`npm start`).
- Railway automatically injects a `PORT` environment variable, which the app will bind to securely (`0.0.0.0`).
- The frontend and API remain on the same origin (no CORS needed).

## Manual setup (if you don't want to use the start scripts)

```bash
cd backend
cp .env.example .env   # only needed the first time
npm install
npm start
```

Then open http://localhost:3000 in your browser.

Requires [Node.js](https://nodejs.org) 18 or later.

## Community & gamification

- **Posts** — share before/after photos and a description of what you did with an item; edit or delete your own posts
- **Likes & comments** — like posts, comment, delete your own comments
- **Follows & profiles** — follow other users, view anyone's profile (`profile.html?id=...`), edit your own bio
- **Badges** — 7 achievements (First Scan, First Repair, First Donation, Reuse Starter, Second-Life Builder, Sustainability Explorer, Community Contributor), automatically awarded based on your real activity — never something you can buy or fake
- **Challenges** — join sustainability challenges (e.g. "Repair 3 items"), progress is computed from your real logged actions after joining, not a separate counter that can drift out of sync
- **Leaderboard** — ranks users by real completed actions, badges, and completed challenges
- **Search** — find posts or people from the Community page
- **Reporting & moderation** — anyone can report a post/comment/user; the first account created on a fresh install is an administrator and can view open reports and resolve them (dismiss, remove content, suspend, or ban)

## Notifications

A notification bell in the header (visible on every page once signed in)
tracks:
- Someone liking your post
- Someone commenting on your post
- Someone following you
- Unlocking a new badge
- Completing a challenge

Click the bell to see recent notifications, or "Mark all read" to clear the
unread count. Notifications are in-app only — no email or push, and nothing
leaves your machine.

## OCR, QR codes, and background jobs

- **OCR (text extraction)** — when scanning an item, check "Extract text from the first photo" to have LifeLoop read any visible label/tag text using on-device OCR. This is opt-in because the very first use downloads a one-time language data file (~15MB); every use after that is fast and fully offline. If Gemini is configured, the extracted text is given to it as extra context (never treated as ground truth on its own).
- **QR code scanning** — the scanner includes a "Decode" button that reads a QR code from a photo and fills the item name field with it. Only QR codes are supported, not 1D barcodes (UPC/EAN) — see `backend/src/services/barcode.js` for why. LifeLoop doesn't look up scanned codes against any external product database by default (there's no broadly reliable free one to point to); you can configure your own via `BARCODE_LOOKUP_API_URL` in `backend/.env`.
- **Background jobs** — generating a repair/reuse/resell/donate/recycle guide runs as a background job rather than blocking the request, so a slower AI call doesn't tie up the connection. The frontend polls automatically; you won't notice anything different except that it doesn't hang. Job status survives a server restart (any job interrupted mid-run is marked failed rather than left hanging forever).

## API documentation

Interactive API docs (Swagger UI) are available at **http://localhost:3000/api-docs** once the server is running. The raw OpenAPI spec is at `/api/openapi.json`.

