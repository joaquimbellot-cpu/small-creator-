# Launch plan: one website, a private login, and Claude in the back office

Status: approved by the owner on 22 November 2026 through their answers to four questions. Building.

## What the owner asked for

1. A **Log in** link in the website's drop-down menu. It is for the owner only, and it leads into the back office.
2. A **Claude page** in the back office. The owner types what they want, and Claude does the work using the back office's own tools.
3. Everything in the repository, so the owner can launch the website with **one deploy**.

## Decisions (the owner's answers)

| Question | Answer |
|---|---|
| How Claude connects | A chat page inside the back office (not a connector for the Claude app) |
| What Claude may do | Claude may freely read and write email drafts. Every other change is a proposal that the owner approves with a click. |
| How it goes online | One Vercel project serves both the website and the back office. "Log in" goes to `/login`. |
| Website forms | Apply creates a new creator with status New. Contact goes to an Inbox page. |

## How it fits together

- **One project.** The Next.js app in `admin/` also serves the static website.
  - When the app is built, it builds the website from `src/` (with `build.js`) into `admin/public/`.
  - `/` shows the website's home page, and every other public page keeps its current address (for example `/how-it-works.html`).
  - The back office keeps its own addresses: `/login`, `/overview`, `/creators` and the rest.
  - The website pages can be found by search engines. The back office pages keep `noindex`.
- **Log in link.** It sits in the website's drop-down menu only, not in the top bar. The address is set in `src/content/site.json`.
- **Forms.**
  - The Apply and Contact forms post to `/api/public/apply` and `/api/public/contact`. The server checks each one before saving it:
    - the request comes from the same site;
    - a hidden trap field catches bots;
    - each visitor is limited to a few sends per hour;
    - every field is validated.
  - An application with an email address that is already on file creates nothing new, and the visitor sees the same success message either way.
- **Claude page (`/claude`, owner only).**
  - Claude can read:
    - the Overview stats;
    - creators: name, channel, niche, subscribers, status and deals. Claude **never** receives email addresses, phone numbers or notes.
    - deals, the email log, templates, and the Inbox (without the senders' email addresses).
  - Claude can write email drafts. They go to Review as usual, and the owner still approves and clicks Send.
  - Claude can **propose** these changes, and the owner clicks Approve on each one:
    - add a creator;
    - edit a creator;
    - move a deal to another stage.

    Approve runs the change as the owner, with the usual checks.
  - Claude can never send, delete, export, or change Settings or staff. It says where to click instead.
  - Website text (creator names, contact messages) is passed to Claude marked as untrusted data, never as instructions.
  - Conversations are stored in the owner's own database, with row-level security, and recorded in the audit log.
  - Model: `claude-opus-5-5`, with the server-side fallback switched on. It can be changed with `ANTHROPIC_ASSISTANT_MODEL`. Each message is capped at a set number of steps, and there is a daily limit.
  - Without `ANTHROPIC_API_KEY`, the page says that Claude is not connected yet.
- **Why the conversation runs inside the app, not on Anthropic's hosted Managed Agents.**
  - Every tool Claude uses is the owner's own database, behind the owner's login.
  - Conversations that mention creators stay in the owner's database instead of being kept on Anthropic's servers until someone deletes them.
  - It can be tested end to end with a fake Claude. Managed Agents is the other option if the owner prefers it later.

## Team (each agent owns its files)

| Agent | Model | Builds |
|---|---|---|
| Site | sonnet | One-project launch, website build step, headers, the Log in link |
| Forms | sonnet | Database tables for website forms, the two public form routes, the Inbox page, the navigation links |
| Claude | sonnet | The Claude page, its tools and proposals, and a fake Claude for tests (the leader reviews it line by line) |
| Security | sonnet, read-only | A review of everything new |
| QA | haiku | End-to-end checks added to `admin/tests/run-all.sh` |
| Docs | haiku | `admin/README.md`, `.env.example`, this plan |

## Not in this round

- A connector for the Claude app.
- Claude sending emails, deleting, exporting, or changing Settings.
- Automatic actions on a schedule.
- CAPTCHA on the forms (the hidden trap field and the per-visitor limit come first).
