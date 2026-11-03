# 💰 Family Spending Tracker

A private, shareable spending tracker for your family. Add expenses, organize
them with categories, set up recurring entries, and browse/filter your full
history — all behind a single family password.

Built to run on **Render** (web service) with a **Neon** Postgres database,
deployed straight from **GitHub**.

---

## Features

- **Categories** — start with sensible defaults, add/edit/delete your own anytime (each with a color).
- **Entries** — add, edit, and delete expenses with a description, amount, date, and category.
- **Recurring entries** — mark an expense as daily / weekly / monthly / yearly, and either set a date to stop or keep it going **forever**. Recurring expenses are automatically expanded into each occurrence in your history.
- **History + filters** — see every entry, and filter by **month**, **year**, and/or **category**. A running total and count update with your filters.
- **Password protected** — one shared family password gates the whole site. Logins use a signed, HTTP-only session cookie and are rate-limited.
- **Responsive & themed** — works on phones, tablets, and desktops, with automatic light/dark mode.

---

## Tech stack

| Layer     | Choice                                    | Why |
|-----------|-------------------------------------------|-----|
| Server    | Node.js + Express                         | Single long-lived process — ideal for Render |
| Database  | Neon Postgres via `pg` connection pool    | Neon's recommended setup for persistent servers like Render |
| Frontend  | Vanilla HTML/CSS/JS (no build step)       | Nothing to compile means nothing to break on deploy |
| Auth      | Shared password → signed cookie           | Simple family-level access |

---

## Deploy it (Render + Neon + GitHub)

You said you'll handle the account setup — here's exactly what these files
expect so it "just works."

### 1. Create a Neon database
1. In the [Neon console](https://neon.com), create a project.
2. Copy the **pooled** connection string (the host contains `-pooler`).
   It looks like:
   `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require`

### 2. Push this repo to GitHub
```bash
git init
git add .
git commit -m "Initial commit: family spending tracker"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

### 3. Create the Render web service
1. In [Render](https://render.com), **New → Web Service** and connect your GitHub repo.
2. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Health check path:** `/healthz`
3. Add **Environment Variables**:
   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | your Neon **pooled** connection string |
   | `APP_PASSWORD` | the shared family password |
   | `SESSION_SECRET` | a long random string (see below) |
   | `NODE_ENV` | `production` |

   Generate a session secret:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
4. Deploy. On first boot the app **automatically creates its tables and seeds
   default categories** — no manual migration step needed.

> Prefer a one-click setup? This repo includes `render.yaml`, so you can use
> Render's **Blueprint** import instead and just fill in `DATABASE_URL` and
> `APP_PASSWORD`.

---

## Run it locally

```bash
npm install
cp .env.example .env     # then fill in DATABASE_URL, APP_PASSWORD, SESSION_SECRET
npm run migrate          # optional — the server also migrates on startup
npm run dev              # starts on http://localhost:3000
```

---

## Environment variables

| Variable         | Required | Description |
|------------------|----------|-------------|
| `DATABASE_URL`   | ✅       | Neon pooled Postgres connection string |
| `APP_PASSWORD`   | ✅       | The shared family password |
| `SESSION_SECRET` | ✅       | Long random string used to sign session cookies |
| `PORT`           | —        | Port to listen on (Render sets this automatically) |
| `SESSION_DAYS`   | —        | Days a login stays valid (default `30`) |
| `NODE_ENV`       | —        | Set to `production` on Render (enables secure cookies) |

---

## Project structure

```
.
├── public/              # Frontend (served statically)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── src/
│   ├── server.js        # Express app + startup
│   ├── auth.js          # Password check + signed session cookies
│   ├── recurrence.js    # Expands recurring entries into occurrences
│   ├── db/
│   │   ├── pool.js      # Neon/pg connection pool
│   │   ├── schema.sql   # Tables
│   │   └── migrate.js   # Applies schema + seeds categories
│   └── routes/
│       ├── auth.js
│       ├── categories.js
│       └── entries.js
├── render.yaml          # Render Blueprint
├── .env.example
└── package.json
```

---

## A note on currency

Amounts are displayed in Canadian dollars (e.g. `$1,234.50`). To change the
currency, edit the `money` formatter near the top of `public/app.js`.
