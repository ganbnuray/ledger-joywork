# Payment Matcher: take-home spec

Copied from the JoyWork engineering take-home page. The ledger it refers to is in `data/ledger.json`, and the three sample emails are in `data/emails/`.

Build and deploy a small app that finds payments recorded against the wrong invoice, before anyone chases a customer who already paid. Then show how well it works.

- Walkthrough after you submit: about 30 minutes
- Time left: about 24 hours
- Plan on about 4 hours of work

**Share your AI sessions.** If you use any AI tools (Claude, ChatGPT, Copilot, Cursor or others), include the full logs of those sessions with your submission. We read how you directed the AI and how you checked what it gave you. That counts as much as the code.

The deadline is short on purpose. At a startup, urgent requests come up, and we're looking for people who can take one and ship a good solution in time: fast and right. Decide what matters most and make that solid. Unfinished is fine; say what's missing.

## 1. The situation

JoyWork chases unpaid invoices on behalf of service businesses. Many of their customers are billed the same amount every month, and when a payment comes in, someone at the business records which invoice it pays. That step often goes wrong: the money lands on last month's invoice instead of this month's, on a sister location's account, or sits unapplied.

The customer believes they've paid, the books say they haven't, and a reminder goes out anyway. Chasing a customer who already paid damages the relationship. Missing a real unpaid invoice costs money. Your app finds these mistakes so a person can fix the books first.

## 2. What to build

### Findings

Load the ledger and give every payment and credit exactly one status. Where something is wrong, say which invoice the money most likely belongs to, the amount involved, and the evidence. Store the results in a database (Postgres is a plus), with enough information to explain how each was reached.

| Status | Meaning |
|---|---|
| `ok` | Recorded against the invoice the customer meant, or nothing suggests otherwise. |
| `misapplied` | Right account, wrong invoice. |
| `wrong_account` | Meant for an invoice on a different account. |
| `unapplied` | Money (all or part) not applied to any invoice, while the account has open invoices. |
| `needs_human` | The data can't settle it, or a person has to decide. |

### One web app, deployed

Vercel, Railway, Render or similar; one URL is enough. It shows:

- a list of findings with their status and details;
- a review queue for findings the system isn't sure about;
- a way for a person to confirm a finding or correct its status;
- a way to paste in a customer's "we already paid" email and see what the ledger says about it. Three examples are in section 4.

### AI session logs

If you used AI tools, include every session, start to finish: commit the exported transcripts to an `ai-logs/` folder in your repo, or put share links in the README. Export the full conversation, not a summary. Remove API keys and other secrets before you commit.

### Evaluation

Label all 38 payments and credits yourself and commit your labels. Show, per status, how often your system agrees with your labels: precision and recall, in the app or in the README.

## 3. The README matters as much as the code

- A sketch of how the system fits together.
- Which decisions does a model make, and which does plain code make?
- What you verified, and how.
- Where your system is wrong, and why.
- What happens when the model is down, slow, or returns something unusable.
- Whether anything in the data tried to manipulate the system, and how you handled it.
- Anything in the data you think is broken, and what you did about it.
- How you used AI tools while building, and how you checked what they produced.
- What you'd do next with more time.

## 4. The data: one ledger

All made up. Brightline Facility Services bills 12 customer accounts monthly, June through November 2026. The ledger is as of November 20, 2026.

- **customers**: `id`, `name`, `parent` (accounts with the same parent belong to one organization), `billing_email`.
- **invoices**: `number`, `customer_id`, `issue_date`, `due_date`, `amount`, `currency`, `description`, and `status`: `posted` or `void` (a void invoice has a `void_note`). The balance isn't stored: work it out from the payments.
- **payments**: `id`, `type` (`payment` or `credit_memo`), `customer_id` (the account it was recorded on; null if nobody could tell), `received_date`, `amount`, `method`, `reference`, `memo` (whatever the customer wrote with the payment), and `applications`: the invoices it was recorded against, and how much went to each.

### Three customer emails to try in your app

See `data/emails/`.

## 5. Ground rules

- A small thing that works and is honestly described beats a big thing that half works.
- Any language and framework. TypeScript is a plus (our stack is TypeScript, Node and Postgres), not a requirement.
- Any AI tools and model provider, at your own cost. Free tiers should cover hosting. Never commit API keys.
- Presentation counts. Build it like a product someone uses every day: clean, clear, and easy to review and correct.
- Correctness, handling of tricky cases, and honesty about limits count too.
- This is for the interview only. The data is made up, the code stays yours, and we won't use it.

## 6. To submit

Reply to Skylar's email with the repository link (public, or shared with GitHub user `skylarch`), the deployed URL, your AI session logs (in the repo's `ai-logs/` folder or as links in the README), and anything you want us to know.

At the walkthrough, you'll show what you built, and we'll try a few customer emails you haven't seen.
