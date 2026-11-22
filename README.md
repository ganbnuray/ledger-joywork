# Payment Matcher

Finds payments and credits recorded against the wrong invoice or account, so a person can fix the books before a customer who already paid gets chased.

The full task is in [`docs/SPEC.md`](docs/SPEC.md). The input ledger is [`data/ledger.json`](data/ledger.json) (12 accounts, 79 invoices, 38 payments and credits, as of November 20, 2026).

Status: work in progress.

## Setup

Requires Node 20 or newer and a Postgres database.

```bash
npm install
cp .env.example .env
```

Then fill in `.env`:

| Variable | Needed for | If missing |
|---|---|---|
| `DATABASE_URL` | The web app and `npm run db:seed` | The web app cannot start |
| `ANTHROPIC_API_KEY` | Reading emails with the model | Emails are read with rules only, and the app says so |

## Commands

### Web app

| Command | What it does |
|---|---|
| `npm run dev` | Starts the app in development mode at http://localhost:3000, reloading on every change. |
| `npm run build` | Builds the app for production. |
| `npm start` | Runs the production build from `npm run build` at http://localhost:3000. |
| `npm run db:seed` | Creates the tables if needed, runs the matcher and writes all 38 findings to the database. Reviews already in the database are kept. Reads `DATABASE_URL` from `.env`. |

The app also seeds itself on the first page load if the database is empty, or if the stored findings come from an older matcher (`MATCHER_VERSION` in `src/matcher/match.ts`). So after changing a rule or a model prompt, add an entry to `VERSIONS` in `src/matcher/versions.ts` and the deployed app recomputes the findings once. The old version's findings are kept in the `finding_versions` table, manual reviews are never deleted, and the Versions page (`/versions`) compares any two versions side by side.

With `ANTHROPIC_API_KEY` set, seeding also has the model check every memo for injection attempts. A flagged memo sends its payment to "needs a person". The model can add this flag but never remove one the rules raised.

### Matcher and email checker in the terminal

These read `data/ledger.json` directly. They need no database and change nothing.

| Command | What it does |
|---|---|
| `npm run match` | Runs the rules (and the model's memo check, if `ANTHROPIC_API_KEY` is set in your shell) and prints one line per payment or credit: id, status, account it was recorded on, confidence, amount involved, and the invoices the money most likely belongs to. Ends with a count per status. |
| `npm run match -- --verbose` | The same, plus the evidence behind each finding. |
| `npm run check-email -- data/emails/*.txt` | Checks each email file against the ledger: the account, matching payments, each invoice's answer (paid, still owed, hold reminder) and a summary. Pass any `.txt` file with the email text. |

`check-email` uses the model only if `ANTHROPIC_API_KEY` is set in your shell, for example `export ANTHROPIC_API_KEY=...` first. Without it, the output says "read by rules".

### Checks

| Command | What it does |
|---|---|
| `npm test` | Runs all tests once: matcher statuses for every discussed case, balances, memo parsing, email reading and the model fallback. |
| `npm run typecheck` | Checks the TypeScript types without building. |

### AI session logs

| Command | What it does |
|---|---|
| `python3 scripts/export-ai-log.py <session.jsonl> <output.md> ["title"]` | Turns a Claude Code session transcript into a readable Markdown log for `ai-logs/`. Removes system reminders, Gmail addresses and API keys, and cuts tool results longer than 4,000 characters. The title is optional. |

Claude Code keeps session transcripts in `~/.claude/projects/<project folder>/<session id>.jsonl`.

## Repository layout

| Path | What it holds |
|---|---|
| `docs/SPEC.md` | The take-home spec |
| `data/ledger.json` | The ledger: customers, invoices, payments and credits |
| `data/emails/` | The three sample "we already paid" emails |
| `src/ledger/` | Loading the ledger (money in cents) and computing balances |
| `src/matcher/` | The rules that give each payment and credit its finding |
| `src/email/` | Reading a pasted email (rules, plus the model as a helper) and checking it against the ledger |
| `src/db/` | Postgres tables for findings and reviews |
| `app/` | The web app: findings, review queue, email checker |
| `scripts/` | The terminal commands above |
| `tests/` | Tests, using real payments from the ledger |
| `ai-logs/` | Full transcripts of the AI sessions used to build this |

## Still to write

- How the system fits together
- Which decisions a model makes and which plain code makes
- What I verified, and how
- Where the system is wrong, and why
- What happens when the model is down, slow, or returns something unusable
- Manipulation attempts in the data, and how they are handled
- Broken data, and what I did about it
- How I used AI tools, and how I checked their output
- Precision and recall per status
- What I'd do next with more time
