# Payment Matcher

Finds payments and credits recorded against the wrong invoice or account, so a person can fix the books before a customer who already paid gets chased.

The full task is in [`docs/SPEC.md`](docs/SPEC.md). The input ledger is [`data/ledger.json`](data/ledger.json) (12 accounts, 79 invoices, 38 payments and credits, as of November 20, 2026).

Status: work in progress.

## Repository layout

| Path | What it holds |
|---|---|
| `docs/SPEC.md` | The take-home spec |
| `data/ledger.json` | The ledger: customers, invoices, payments and credits |
| `data/emails/` | The three sample "we already paid" emails |
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
