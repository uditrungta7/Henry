# Henry, final manual verification (the 3 steps)

These are the checks that can't be automated. Do them on your Mac with the
packaged app. Your Supabase project is `xwgoocwgvacmovnbbccl`.

---

## First: open the packaged app (one-time Gatekeeper bypass)

The app is unsigned, so macOS blocks it on first open. Either:

**Option A, right-click open (easiest):**
1. In Finder, go to `release/mac-arm64/` in this project.
2. **Right-click `Henry.app` → Open.**
3. In the warning dialog, click **Open** again. (Only needed the first time.)

**Option B, terminal (if A is fussy):**
```bash
xattr -dr com.apple.quarantine "release/mac-arm64/Henry.app"
open "release/mac-arm64/Henry.app"
```

On first launch you'll see **"Protect this computer?"**, that's the optional
password offer. Click **Skip** for now (you'll test it in Step 3).

The app stores its data at `~/Library/Application Support/Henry/henry.db`.

---

## Step 1, Send a real email through your own Gmail

**1a. Make a Gmail App Password** (Gmail blocks your normal password over SMTP):
1. Your Google account must have **2-Step Verification ON**
   (https://myaccount.google.com/security).
2. Go to **https://myaccount.google.com/apppasswords**.
3. Name it "Henry" and click **Create**. Copy the **16-character** password
   (looks like `abcd efgh ijkl mnop`, you can type it with or without spaces).

**1b. Configure it in Henry:**
1. In Henry, click **Settings** (left nav) → the **Email** section.
2. **Email provider:** choose **Gmail / Google Workspace**.
3. **From name:** your company name (e.g. `Rapier Industries`).
4. **From address:** your Gmail address (e.g. `you@gmail.com`).
5. **Username:** the same Gmail address.
6. **Password / app password:** paste the 16-char App Password.
7. Click **Save email settings** (you should see "Saved.").

**1c. Send the test:**
1. Click **Send test email**.
2. ✅ **Pass:** you see "Test email sent to <you@gmail.com>", check that inbox
   for a plain-text "Henry test email".
3. ❌ If it fails, the panel shows the **exact SMTP error**. Common ones:
   - `Invalid login` / `Username and Password not accepted` → wrong App Password,
     or you used your normal password. Redo 1a.
   - `Missing credentials` → you didn't enter a password.

**1d. Verify a real publish (the actual feature):**
1. Go to **Customers** → add one customer (any name/address).
2. Go to **Employees** → add one employee **with an email you can check**
   (use your own address again, or a second inbox).
3. Go to **Schedule** → on today's board, in that customer's **Morning** cell,
   pick the employee from **+ Assign...**.
4. Click **Publish day** → optionally type a note → **Send schedule**.
5. ✅ **Pass:** the result shows **Sent** for that employee, and the inbox gets a
   plain-text schedule email. Open **Publish history**, it lists the send.
6. (Bonus) Add an employee with a **bad** email, assign + publish → that row shows
   **Failed** with the SMTP error and a working **Resend** button.

---

## Step 2, Point at your real license endpoint

The customer never types a license URL, so there's no field for it, you set it
once, from this project folder, with the command below.

**2a. Deploy the function + table** (the parts the brief says *you* own; if already
deployed, skip):
1. Create the `licenses` table in your Supabase project (SQL editor):
   ```sql
   create table if not exists licenses (
     id            text primary key,        -- the app's license_id
     company_name  text,
     is_licensed   boolean not null default false,
     trial_ends_at timestamptz,
     revoked       boolean not null default false,
     last_seen_at  timestamptz
   );
   ```
2. Deploy the provided function (it's at `supabase/functions/check-license/`):
   ```bash
   supabase functions deploy check-license --no-verify-jwt --project-ref xwgoocwgvacmovnbbccl
   ```
   Your endpoint URL will be:
   `https://xwgoocwgvacmovnbbccl.functions.supabase.co/check-license`

**2b. Tell the installed app to use it** (run from this project folder):
```bash
env -u ELECTRON_RUN_AS_NODE \
  ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
  scripts/set-license-endpoint.js \
  "https://xwgoocwgvacmovnbbccl.functions.supabase.co/check-license"
```
Quit Henry fully (Cmd-Q) and reopen it.

**2c. Verify the gate (this is the real test):**
1. **Fresh install just works:** on reopen, the app is usable. In Supabase, open
   the `licenses` table, a new row appeared with your machine's `license_id`,
   `revoked=false`, and a `trial_ends_at` ~60 days out. ✅
2. **Revoke → blocked:** in that row set **`revoked` = true**, save. Quit Henry,
   reopen. ✅ **Pass:** you get the **"Your license has ended"** screen and can't
   use the app.
3. **Restore → works again:** set `revoked` back to **false**, **quit + reopen**.
   ✅ App is usable again.
4. **Expired trial → blocked:** set `is_licensed=false` and `trial_ends_at` to a
   **past** date. Quit + reopen → "license ended" screen.
5. **Mark paid → always works:** set `is_licensed=true` (any trial date). Quit +
   reopen → usable.

> Note: the app only re-checks **once per day** on its own. Quitting and reopening
> after a DB edit forces the check because the helper cleared the cache; if you
> edit the row again later, the change shows at the next launch after the daily
> window, or just re-run the 2b command (it clears the cache) then reopen.

**To return the app to unlocked** (e.g. for everyday dev), clear the endpoint:
```bash
env -u ELECTRON_RUN_AS_NODE \
  ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
  scripts/set-license-endpoint.js ""
```

---

## Step 3, The optional local password

1. In Henry: **Settings** → **App password** section.
2. Enter a password + confirm → **Set password** (you'll see "Password set.").
3. **Quit Henry (Cmd-Q) and reopen.**
   ✅ **Pass:** the **"Enter your password"** lock screen appears before the app;
   the wrong password is rejected, the right one unlocks it.
4. **Sign out re-locks:** click **Sign out** (bottom-left) → you're back at the
   lock screen.
5. **Change / remove:** Settings → App password → enter current + new to change,
   or **Remove password** (needs the current password). After removing, quit +
   reopen → no lock screen.

---

## Cleanup / housekeeping

- **`.env.local` is now dead**, the desktop app uses none of it. It still holds
  live secrets (Supabase service-role key, Resend key). It's gitignored so it
  won't be committed, but consider rotating those keys since they were in a file,
  and you can delete `.env.local` and `.env.local.example`, the desktop app
  ignores them.
- The packaged artifacts are in `release/` (gitignored). To rebuild after changes:
  `npm run dist` (DMG) or `npm run pack` (just the .app, faster).
