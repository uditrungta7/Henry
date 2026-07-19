// Plain-text WEEKLY schedule email builder for the MAIN process. Mirrors the
// renderer's lib/email/compose.ts so the sent email matches the in-app preview
// exactly. Kept in the electron tree so the main process doesn't depend on the
// Next renderer.

export type Shift = "AM" | "PM";

// One of MY shifts in the week (for the personal section).
export type WeekShiftLine = {
  date: string; // ISO
  shift: Shift;
  customerName: string;
  address: string | null;
  notes: string | null;
};

// One assignment anywhere in the week (for the "who is where" section).
export type TeamShiftLine = {
  date: string; // ISO
  shift: Shift;
  customerName: string;
  employeeName: string;
};

export type OnCall = { name: string; phone: string | null } | null;

// "2026-06-16" -> "Mon 06/16/2026" (USA numeric date with weekday).
export function emailDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
  });
  const [yy, mm, dd] = iso.split("-");
  return `${weekday} ${mm}/${dd}/${yy}`;
}

// "2026-06-15" -> "06/15/2026".
function usDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

export function buildWeekSubject(weekStartIso: string): string {
  return `Your work schedule - week of ${usDate(weekStartIso)}`;
}

const shiftLabel = (s: Shift) => (s === "AM" ? "MORNING" : "AFTERNOON");
const shiftOrder = (s: Shift) => (s === "AM" ? 0 : 1);

// The employee's own shifts, grouped by day.
function myWeekBlock(shifts: WeekShiftLine[]): string {
  const byDate = new Map<string, WeekShiftLine[]>();
  for (const s of shifts) {
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }
  const days = [...byDate.keys()].sort();
  return days
    .map((date) => {
      const rows: string[] = [emailDateLabel(date)];
      for (const s of byDate
        .get(date)!
        .slice()
        .sort((a, b) => shiftOrder(a.shift) - shiftOrder(b.shift))) {
        rows.push(shiftLabel(s.shift));
        rows.push(`  ${s.customerName}`);
        if (s.address) rows.push(`  ${s.address}`);
        if (s.notes) rows.push(`  Note: ${s.notes}`);
      }
      return rows.join("\n");
    })
    .join("\n\n");
}

// The whole team's week, grouped by day then site.
function teamWeekBlock(shifts: TeamShiftLine[]): string {
  const byDate = new Map<string, TeamShiftLine[]>();
  for (const s of shifts) {
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }
  const days = [...byDate.keys()].sort();
  return days
    .map((date) => {
      const rows: string[] = [emailDateLabel(date)];
      const byCustomer = new Map<string, TeamShiftLine[]>();
      for (const s of byDate.get(date)!) {
        const list = byCustomer.get(s.customerName) ?? [];
        list.push(s);
        byCustomer.set(s.customerName, list);
      }
      for (const name of [...byCustomer.keys()].sort()) {
        const parts = byCustomer
          .get(name)!
          .slice()
          .sort((a, b) => shiftOrder(a.shift) - shiftOrder(b.shift))
          .map((s) => `${s.shift} ${s.employeeName}`);
        rows.push(`  ${name}: ${parts.join(", ")}`);
      }
      return rows.join("\n");
    })
    .join("\n\n");
}

export function buildWeekBody(opts: {
  companyName: string;
  weekStartIso: string;
  preface: string | null;
  employeeName?: string | null;
  myShifts: WeekShiftLine[];
  teamShifts: TeamShiftLine[];
  onCall: OnCall;
}): string {
  const blocks: string[] = [];

  const greetName = opts.employeeName?.trim();
  if (greetName) blocks.push(`Hi ${greetName},`);

  const preface = opts.preface?.trim();
  if (preface) blocks.push(preface);

  blocks.push(`Here is your schedule for the week of ${usDate(opts.weekStartIso)}:`);

  if (opts.myShifts.length > 0) {
    blocks.push(myWeekBlock(opts.myShifts));
  } else {
    blocks.push("You are not scheduled to work this week.");
  }

  if (opts.teamShifts.length > 0) {
    blocks.push("Where everyone is this week:");
    blocks.push(teamWeekBlock(opts.teamShifts));
  }

  const footer: string[] = ["--"];
  if (opts.onCall) {
    const phone = opts.onCall.phone ? ` (${opts.onCall.phone})` : "";
    footer.push(`On call: ${opts.onCall.name}${phone}`);
  }
  footer.push(`- ${opts.companyName}`);
  blocks.push(footer.join("\n"));

  return blocks.join("\n\n") + "\n";
}

// ---- HTML version of the weekly email ---------------------------------------
// Same content as buildWeekBody, laid out as tables so mail clients render it
// cleanly. Inline styles only (clients strip <style> blocks). The plain-text
// body stays canonical for the "unchanged, skip" comparison; this is layout.

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const TD = "padding:6px 10px;border:1px solid #e2e8f0;vertical-align:top;text-align:left;";
const TH = TD + "background:#f1f5f9;font-weight:bold;";
const TABLE = "border-collapse:collapse;margin:0 0 16px;width:100%;font-size:14px;";
const P = "margin:0 0 12px;";

const shiftWord = (s: Shift) => (s === "AM" ? "Morning" : "Afternoon");

export function buildWeekHtml(opts: {
  companyName: string;
  weekStartIso: string;
  preface: string | null;
  employeeName?: string | null;
  myShifts: WeekShiftLine[];
  teamShifts: TeamShiftLine[];
  onCall: OnCall;
}): string {
  const parts: string[] = [];

  const greetName = opts.employeeName?.trim();
  if (greetName) parts.push(`<p style="${P}">Hi ${esc(greetName)},</p>`);

  const preface = opts.preface?.trim();
  if (preface) {
    parts.push(`<p style="${P}">${esc(preface).replace(/\n/g, "<br>")}</p>`);
  }

  parts.push(
    `<p style="${P}">Here is your schedule for the week of ${usDate(opts.weekStartIso)}:</p>`
  );

  if (opts.myShifts.length > 0) {
    const rows = opts.myShifts
      .slice()
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || shiftOrder(a.shift) - shiftOrder(b.shift)
      )
      .map((s) => {
        const site =
          esc(s.customerName) +
          (s.address
            ? `<br><span style="color:#64748b;font-size:12px">${esc(s.address)}</span>`
            : "");
        return (
          `<tr><td style="${TD}white-space:nowrap">${emailDateLabel(s.date)}</td>` +
          `<td style="${TD}">${shiftWord(s.shift)}</td>` +
          `<td style="${TD}">${site}</td>` +
          `<td style="${TD}">${s.notes ? esc(s.notes) : ""}</td></tr>`
        );
      })
      .join("");
    parts.push(
      `<table style="${TABLE}"><tr><th style="${TH}">Day</th><th style="${TH}">Shift</th>` +
        `<th style="${TH}">Site</th><th style="${TH}">Notes</th></tr>${rows}</table>`
    );
  } else {
    parts.push(`<p style="${P}">You are not scheduled to work this week.</p>`);
  }

  if (opts.teamShifts.length > 0) {
    parts.push(`<p style="margin:0 0 8px;font-weight:bold">Where everyone is this week</p>`);
    const byDate = new Map<string, TeamShiftLine[]>();
    for (const s of opts.teamShifts) {
      const list = byDate.get(s.date) ?? [];
      list.push(s);
      byDate.set(s.date, list);
    }
    const rows: string[] = [];
    for (const date of [...byDate.keys()].sort()) {
      rows.push(
        `<tr><td colspan="3" style="${TD}background:#f8fafc;font-weight:bold">${emailDateLabel(date)}</td></tr>`
      );
      const byCustomer = new Map<string, TeamShiftLine[]>();
      for (const s of byDate.get(date)!) {
        const list = byCustomer.get(s.customerName) ?? [];
        list.push(s);
        byCustomer.set(s.customerName, list);
      }
      for (const name of [...byCustomer.keys()].sort()) {
        const here = byCustomer.get(name)!;
        const am = here.filter((s) => s.shift === "AM").map((s) => esc(s.employeeName)).join(", ");
        const pm = here.filter((s) => s.shift === "PM").map((s) => esc(s.employeeName)).join(", ");
        rows.push(
          `<tr><td style="${TD}">${esc(name)}</td><td style="${TD}">${am}</td><td style="${TD}">${pm}</td></tr>`
        );
      }
    }
    parts.push(
      `<table style="${TABLE}"><tr><th style="${TH}">Site</th><th style="${TH}">Morning</th>` +
        `<th style="${TH}">Afternoon</th></tr>${rows.join("")}</table>`
    );
  }

  const footer: string[] = [];
  if (opts.onCall) {
    const phone = opts.onCall.phone ? ` (${esc(opts.onCall.phone)})` : "";
    footer.push(`<strong>On call:</strong> ${esc(opts.onCall.name)}${phone}`);
  }
  footer.push(`- ${esc(opts.companyName)}`);
  parts.push(
    `<p style="margin:12px 0 0;padding-top:10px;border-top:1px solid #e2e8f0;color:#334155">${footer.join("<br>")}</p>`
  );

  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.5;max-width:640px">` +
    parts.join("") +
    `</div>`
  );
}

// ---- Customer-facing email (optional "also email this customer" feature) ----
// A plain-text note to a customer telling them who is coming to THEIR site and
// when, for the week. Only the customer's own site is referenced.

export type CustomerVisitLine = {
  date: string; // ISO
  shift: Shift;
  employeeName: string;
  notes: string | null;
};

export function buildCustomerWeekSubject(
  companyName: string,
  weekStartIso: string
): string {
  return `${companyName} crew for the week of ${usDate(weekStartIso)}`;
}

export function buildCustomerWeekBody(opts: {
  companyName: string;
  customerName: string;
  weekStartIso: string;
  preface: string | null;
  visits: CustomerVisitLine[];
}): string {
  const blocks: string[] = [];

  const preface = opts.preface?.trim();
  if (preface) blocks.push(preface);

  blocks.push(
    `${opts.companyName} crew scheduled for ${opts.customerName}, week of ${usDate(opts.weekStartIso)}:`
  );

  const byDate = new Map<string, CustomerVisitLine[]>();
  for (const v of opts.visits) {
    const list = byDate.get(v.date) ?? [];
    list.push(v);
    byDate.set(v.date, list);
  }
  const dayLines = [...byDate.keys()].sort().map((date) => {
    const visits = byDate
      .get(date)!
      .slice()
      .sort((a, b) => shiftOrder(a.shift) - shiftOrder(b.shift))
      .map((v) => {
        let text = `${v.shift} ${v.employeeName}`;
        if (v.notes) text += ` (${v.notes})`;
        return text;
      });
    return `${emailDateLabel(date)}: ${visits.join(", ")}`;
  });
  if (dayLines.length > 0) blocks.push(dayLines.join("\n"));

  return blocks.join("\n\n") + "\n";
}
