// One-time helper: write the license_endpoint into the packaged app's SQLite
// settings, so the app starts checking your license server. There is intentionally
// no in-app field for this (the customer never types a license key/URL).
//
// Run with Electron (correct native ABI), passing the endpoint URL:
//   env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
//     scripts/set-license-endpoint.js "https://YOUR-PROJECT.functions.supabase.co/check-license"
//
// Pass "" (empty) to REMOVE the endpoint and return the app to unlocked.

const { app } = require("electron");

const endpoint = process.argv[2];
if (endpoint === undefined) {
  console.log('Usage: ... set-license-endpoint.js "<url>"   (or "" to clear)');
  process.exit(1);
}

// The packaged app's userData is appData/<package.json "name"> = appData/henry
// (lowercase). Match it exactly so we always edit the real database. (Running a
// loose script, Electron would otherwise default to appData/Electron.)
const path = require("node:path");
app.setPath("userData", path.join(app.getPath("appData"), "henry"));

const { openDatabase } = require("../dist-electron/db");

app.whenReady().then(() => {
  const db = openDatabase();
  db.prepare(
    "insert into settings (key, value) values ('license_endpoint', ?) " +
      "on conflict(key) do update set value = excluded.value"
  ).run(endpoint);
  // Clear any cached verdict so the next launch re-checks immediately.
  for (const k of ["license_valid", "license_last_checked"]) {
    db.prepare("delete from settings where key = ?").run(k);
  }
  const row = db.prepare("select value from settings where key='license_endpoint'").get();
  console.log("license_endpoint is now:", JSON.stringify(row?.value ?? null));
  console.log("cached verdict cleared, the app will re-check on next launch.");
  app.exit(0);
});
app.on("window-all-closed", () => {});
