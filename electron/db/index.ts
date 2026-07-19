// Opens the local SQLite database in the OS app-data folder and runs the
// migration on first launch. Lives in the Electron MAIN process only, the
// renderer reaches it through IPC and never touches the file or the driver.

import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { app } from "electron";
import { SCHEMA_SQL, SEED_SETTINGS } from "./schema";

let db: Database.Database | null = null;

// The database file path: <userData>/henry.db. userData is the per-user app-data
// folder (~/Library/Application Support/Henry on macOS, %APPDATA%/Henry on Windows).
export function dbPath(): string {
  return path.join(app.getPath("userData"), "henry.db");
}

// Open (creating if needed), enforce foreign keys, migrate, and seed. Idempotent:
// safe to call once at startup. Returns the live connection.
export function openDatabase(): Database.Database {
  if (db) return db;

  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // CREATE TABLE IF NOT EXISTS throughout, so this is a no-op on later launches.
  db.exec(SCHEMA_SQL);

  // Additive migration for databases created before the column existed:
  // publishes.on_call_employee_id (who was on call for that published week).
  const publishCols = db.pragma("table_info(publishes)") as { name: string }[];
  if (!publishCols.some((c) => c.name === "on_call_employee_id")) {
    db.exec(
      "alter table publishes add column on_call_employee_id text references employees(id) on delete set null"
    );
  }
  // emails.html: the HTML version of a sent email, kept so resends match.
  const emailCols = db.pragma("table_info(emails)") as { name: string }[];
  if (!emailCols.some((c) => c.name === "html")) {
    db.exec("alter table emails add column html text");
  }
  // customers.is_pinned: keep up to 3 customers pinned to the top of the board.
  const customerCols = db.pragma("table_info(customers)") as { name: string }[];
  if (!customerCols.some((c) => c.name === "is_pinned")) {
    db.exec("alter table customers add column is_pinned integer default 0");
  }

  // Seed defaults only when settings is empty (true first launch).
  const count = db.prepare("select count(*) as n from settings").get() as {
    n: number;
  };
  if (count.n === 0) {
    const insert = db.prepare(
      "insert into settings (key, value) values (?, ?)"
    );
    const seed = db.transaction((entries: [string, string][]) => {
      for (const [k, v] of entries) insert.run(k, v);
    });
    seed(Object.entries(SEED_SETTINGS));
  }

  return db;
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error("Database not opened yet. Call openDatabase() first.");
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
