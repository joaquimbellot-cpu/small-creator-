# The Smallfold back office

The back office is a private app for the owner and the staff. It runs the company side of
Smallfold: finding creators, sending them emails, and tracking deals. It lives in this
`admin/` folder. It is not part of the public website, and search engines are told to
leave it alone.

This guide has three parts. Read the first part to learn what the app does. Use the second
part to try it on your computer with fake data. Use the third part to put it online.

## What it is

This is **Section 1 (Company)** of the back office. The brands and creators sections come later.

The app has five pages:

| Page | What it does |
|---|---|
| Overview | Shows the main numbers: how many creators, emails sent, replies, deals, and commission earned. Also a chart and a list of recent activity. |
| Creators | The list of YouTube channels, with search, filters, sorting, and CSV import and export. Can refresh subscriber counts from YouTube. |
| Deals | Each deal with a creator, a brand, a stage, and an amount. Commission is worked out for you. |
| Emails | Writes drafts with Claude, lets you review and approve them, sends them when you click Send, keeps a log of every email, and stores templates. |
| Settings | Sending limits and test mode, sender details, staff accounts, two-step login, and the audit log. |

There are two roles. A role decides what a person may do.

| Role | Can do | Cannot do |
|---|---|---|
| Owner | Everything. Including deleting records, exporting creators to CSV, changing Settings, inviting and removing staff, and reading the audit log. | Nothing is blocked. |
| Worker | View and edit creators, deals, and templates. Draft and send emails (only after a click). Import creators from CSV. | Delete creators, deals, or templates. Export. Change Settings. Manage staff. Read the audit log. |

The rules are checked by the app and again by the database, so a worker cannot get around them.

## Run it on your computer (test data only)

Use this part to try the app. Everything is fake. The local test stack runs on Linux only. No real email can be sent from your
computer, because the local mail server only catches messages and shows them to you.

**You need these first:**

1. **Node.js, version 22 or newer.** Check with `node --version`. Get it from nodejs.org.
2. **Docker.** A program that runs the test database and login services in containers.
   Install it and make sure it is running.
3. **PostgreSQL, version 16.** The test database. The start script looks for it at
   `/usr/lib/postgresql/16`.

**Then do this:**

1. Open a terminal in the main project folder (the one that contains `admin/`).
2. Start the test stack:
   ```
   bash admin/dev/start.sh
   ```
   The first run takes a few minutes. It starts the test database, the test login service,
   and the mail catcher, and it loads about 60 invented creators. It also creates
   `admin/.env.local` with random test keys. The script is ready when it prints
   "Local stack is up."
3. Start the app. Run these two commands:
   ```
   cd admin
   npm install
   npm run dev
   ```
   Run `npm install` only the first time.
4. Open http://localhost:3000 in your browser.
5. Log in with one of the test accounts. The emails and passwords are in
   `admin/supabase/seed/EXPECTED.md`. The owner account can do everything. The worker
   account is useful for checking the limits on what a worker may do.
6. To see the emails the app would send, open the mail catcher at http://localhost:8025.
7. To stop everything, run this from the main project folder:
   ```
   bash admin/dev/stop.sh
   ```
   Your test data is kept.
8. To wipe the test data and start again with fresh fake data, run:
   ```
   bash admin/dev/reset.sh
   ```
   A reset also makes new local test keys. Stop the app and start it again afterwards
   (`npm run dev`). If you test the built app with `npm run start`, run `npm run build` again first,
   because the build keeps the old public key.

Log files are in `admin/dev/.logs/`. The file `admin/.env.local` holds test secrets. Git
ignores it, so it is never uploaded.

## Put it online, step by step

You will make accounts with four services and one hosting company. Do the steps in order.
Keep every key you copy in a password manager. Never paste a key into a chat or an email.

### Step 1: Supabase (the database and the login)

Supabase is a service that hosts the database and handles logins and invitations.

1. Go to supabase.com and create a free project. Choose a region and a database password.
2. **Create the tables.** Open the **SQL Editor**. Open each file below, in this order,
   copy the whole file, paste it into the editor, and click **Run**:
   1. `20261121000100_extensions_and_types.sql`
   2. `20261121000200_tables.sql`
   3. `20261121000300_helpers_and_triggers.sql`
   4. `20261121000400_functions.sql`
   5. `20261121000500_rls_and_grants.sql`
   6. `20261121000600_recent_activity.sql`
   7. `20261121000700_recent_activity_exclusions.sql`
   8. `20261121000800_security_hardening.sql`

   All eight files are in `admin/supabase/migrations/`. Do not skip the last one: it holds the
   security fixes, including two-step login checked by the database. Never run the seed files
   (`admin/supabase/seed/`) on the online project. They create test logins with known passwords.
3. **Switch off public sign-up.** In the **Authentication** settings, turn **off**
   "Allow new users to sign up". Only the owner can invite people.
4. **Set the email links.** In **Authentication**, open the **Invite user** email template
   and the **Reset password** email template. In each, change the link to these:
   - Invite: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
5. **Connect Supabase's own email.** In the Authentication settings, find **SMTP** (custom
   SMTP). Enter the same Gmail details from Step 2. Then invites and password-reset emails
   are sent from your Gmail account.
6. **Copy three values** from **Project Settings, then API**: the Project URL, the `anon`
   key, and the `service_role` key. You will need them in Step 5. The `service_role` key is
   secret.
7. **Site URL and Redirect URLs.** Do this part again after Step 5, when you know the
   Vercel address. Set the **Site URL** to that address. Add it to the **Redirect URLs** list
   as `https://your-app.example.com/**`, using your own address.
8. **Security settings.** In **Authentication**, set the minimum password length to 12. Turn on
   **Secure password change**. Keep the built-in sign-in rate limits, and lower them if Supabase
   offers that. Keep sign-ups OFF (part 3).
9. **Keep the secret key secret.** The `service_role` key stays only in Vercel's server settings
   (Step 5). Never put it in a file, in the browser, or in a chat.

### Step 2: Gmail (sends the emails)

1. Sign in to your Google account. Go to **Security**, then **2-Step Verification**, and turn it on.
2. In the same place, open **App passwords**. Create one. Name it "Smallfold back office".
3. Copy the 16-letter password. Google shows it once.

Use these settings everywhere the app asks for mail details:

| Setting | Value |
|---|---|
| Host | `smtp.gmail.com` |
| Port | `465` |
| Secure | `true` |
| User | your Gmail address |
| Password | the 16-letter app password |

### Step 3: Anthropic (writes the email drafts)

1. Go to console.anthropic.com and sign in.
2. Open **API Keys** and create a key. Copy it once.
3. Anthropic charges for API use, so you may need to add a payment method first.

### Step 4: YouTube (subscriber counts)

1. Go to the Google Cloud Console (console.cloud.google.com). Create a **new project**
   and give it a name.
2. Open **APIs & Services**, then **Library**. Search for **YouTube Data API v3** and
   click **Enable**.
3. Open **APIs & Services**, then **Credentials**. Click **Create credentials**, then
   **API key**. Copy the key.
4. Open the key's settings and **restrict** it to **YouTube Data API v3** only. Save.

### Step 5: Vercel (puts the app online)

Vercel is a hosting service. It runs the app for you.

1. Go to vercel.com and sign in with your GitHub account.
2. Click **Add New, then Project**, and import this GitHub repository.
3. Set **Root Directory** to `admin`. This tells Vercel that the app is in that folder.
4. Open **Environment Variables**. Add every name listed in `admin/.env.example`, with its
   value from the steps above. Leave out the lines under "Testing on your computer only."
5. Click **Deploy**. When it finishes, copy the address Vercel gives you. It ends in
   `.vercel.app`.
6. Set `NEXT_PUBLIC_SITE_URL` to that address, then **redeploy**. The `NEXT_PUBLIC_` settings
   are built into the app, so a change needs a new deploy to take effect.
7. Go back to Supabase, Step 1, part 7, and set the Site URL and Redirect URLs.

### Step 6: First login (make yourself the owner)

1. In Supabase, open **Authentication**, then **Users**, then **Invite user**. Type your own
   email address and send the invite.
2. Open the invite email and follow the link. It opens a page where you choose a password of at least 12 characters.
3. In Supabase, open the **SQL Editor**. Paste the line below. Replace the placeholder with
   the same email address you invited, then click **Run**:
   ```sql
   select public.bootstrap_owner('you@example.com');
   ```
   It shows `true` when it works. It works only while there is no owner yet, so run it once.
   If it shows `false`, check the spelling of the email address.
4. Log in at your Vercel address. You are now the owner.

Do this before you invite anyone else.

### Step 7: Settings, Sending (test first)

1. Open **Settings**, then **Sending**.
2. **Test address:** type the address where test emails should arrive. Use your own.
3. **Sender postal address:** type the full postal address that appears at the bottom of
   every email. US law asks for a valid postal address on commercial email. A PO box is accepted.
4. Keep **Test mode** ticked, then save.
5. Send one test email. Open **Emails**, then **Compose**. Pick one or more creators. Choose a
   saved template, or type your goal in one sentence. Click **Draft emails**. Under **Review**, edit
   a draft if you want, then click **Approve**. Click **Send**, and confirm in the dialog. With test
   mode on, the email goes to your test address with `[TEST]` in the subject. No creator gets it.
6. When you are happy with the test, untick **Test mode** and save. Until a postal address is
   set, the app refuses to send to real creators.

Keep test mode on until the test email looks right.

### Step 8: Optional, two-step login for the owner

1. Open **Settings**, then **Security**.
2. Click **Set up two-step login**, then add the key to an authenticator app on your phone
   (the app shows a code each time you log in).
3. From then on, the app asks for a code at every login.

## Safety built in

- **No automatic sending.** Every email needs a person to approve it and click Send.
- **Daily limit.** The app sends at most 30 emails a day by default. You can change this in Settings.
- **Delay.** At least 5 seconds pass between two emails.
- **Test mode.** Every email goes to your test address, with `[TEST]` in the subject.
- **Opt-out.** Every email has an unsubscribe link. Pressing it adds the address to a suppression list.
- **Suppression list.** No email is ever sent to an address on the list.
- **Do not contact.** A creator marked "do not contact" cannot be emailed.
- **Audit log.** A record of who did what and when. Nobody can edit or delete it, not even the owner.
- **Row-level security.** The database itself checks each person's role on every read and write.
- **Two-step login in the database.** Once turned on, the database itself requires the code for the owner.
- **Only the server sends.** Only the server can call the functions that send email.
- **Login limit.** After 5 failed logins in 15 minutes, the app waits 15 minutes before it tries again.

## Tests

Run every check with one command. Before you start, the test stack (`bash admin/dev/start.sh`)
must be running, and the app must be running too. Start the app with `npm run dev`, or with
`npm run build` and then `npm run start`. Then, from inside `admin/`, run:

```
bash tests/run-all.sh
```

The script runs these suites in order. It prints one summary line for each, and it reports
an error if any suite fails:

1. **Database tests:** the row-level security rules, the guard functions, and two-step login enforcement.
2. **Unit tests** (vitest).
3. **QA browser checks:** failed login; a worker blocked from owner actions; search and the
   creator pop-up; Overview numbers equal to the fake data; test-mode sending; opted-out and
   "do not contact" creators blocked; the public key reads nothing.
4. **Browser tests** for creators, deals and emails.
5. **Browser test for login.** It runs last, because it trips the login limit.

The script starts and resets nothing. If the test data looks wrong, run `bash admin/dev/reset.sh` first.

## Not built yet

These are planned, but the app does not have them yet:

- A Kanban board for deals.
- Gmail reply tracking (replies found automatically, not marked by hand).
- Follow-up reminders.
- A scheduled subscriber refresh.
- The brand section.
- The creator section.
