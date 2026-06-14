// Builds the plain-text schedule email exactly per the brief. No HTML.
//
// Subject: Your work schedule - Mon Jun 16
//
// Body:
//   [preface message, if any]
//
//   [Company name] schedule for Mon Jun 16:
//
//   AM: [Customer], [address] ([notes])
//   PM: [Customer], [address] ([notes])
//
//   On call: [name] ([phone])
//
// Omission rules: drop the preface if empty; drop a shift line if unassigned;
// drop the On call line if no one is on call.

export type Shift = "AM" | "PM";

export type ShiftLine = {
  shift: Shift;
  customerName: string;
  address: string | null;
  notes: string | null;
};

export type OnCall = {
  name: string;
  phone: string | null;
} | null;

// "2026-06-16" -> "Mon Jun 16" (no comma, per the spec).
export function emailDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const month = date.toLocaleDateString("en-US", { month: "short" });
  return `${weekday} ${month} ${d}`;
}

export function buildSubject(dateIso: string): string {
  return `Your work schedule - ${emailDateLabel(dateIso)}`;
}

function shiftLine(line: ShiftLine): string {
  const parts = [line.customerName];
  if (line.address) parts.push(line.address);
  let text = `${line.shift}: ${parts.join(", ")}`;
  if (line.notes) text += ` (${line.notes})`;
  return text;
}

export function buildBody(opts: {
  companyName: string;
  dateIso: string;
  preface: string | null;
  shifts: ShiftLine[]; // already filtered to this employee, AM before PM
  onCall: OnCall;
}): string {
  const blocks: string[] = [];

  const preface = opts.preface?.trim();
  if (preface) blocks.push(preface);

  blocks.push(`${opts.companyName} schedule for ${emailDateLabel(opts.dateIso)}:`);

  const shiftText = opts.shifts
    .slice()
    .sort((a, b) => (a.shift === "AM" ? 0 : 1) - (b.shift === "AM" ? 0 : 1))
    .map(shiftLine)
    .join("\n");
  if (shiftText) blocks.push(shiftText);

  if (opts.onCall) {
    const phone = opts.onCall.phone ? ` (${opts.onCall.phone})` : "";
    blocks.push(`On call: ${opts.onCall.name}${phone}`);
  }

  // Blank line between blocks; trailing newline for a clean plain-text email.
  return blocks.join("\n\n") + "\n";
}

// ---- Customer-facing email (optional "also email this customer" feature) ----
// A plain-text note to a customer telling them who is coming to THEIR site and
// when, for the day. Only the customer's own site is referenced.

export type CustomerShiftLine = {
  shift: Shift;
  employeeName: string;
  notes: string | null;
};

export function buildCustomerSubject(
  companyName: string,
  dateIso: string
): string {
  return `${companyName} crew for ${emailDateLabel(dateIso)}`;
}

export function buildCustomerBody(opts: {
  companyName: string;
  customerName: string;
  dateIso: string;
  preface: string | null;
  shifts: CustomerShiftLine[]; // for this customer's site, AM before PM
}): string {
  const blocks: string[] = [];

  const preface = opts.preface?.trim();
  if (preface) blocks.push(preface);

  blocks.push(
    `${opts.companyName} crew scheduled for ${opts.customerName} on ${emailDateLabel(opts.dateIso)}:`
  );

  const shiftText = opts.shifts
    .slice()
    .sort((a, b) => (a.shift === "AM" ? 0 : 1) - (b.shift === "AM" ? 0 : 1))
    .map((s) => {
      let text = `${s.shift}: ${s.employeeName}`;
      if (s.notes) text += ` (${s.notes})`;
      return text;
    })
    .join("\n");
  if (shiftText) blocks.push(shiftText);

  return blocks.join("\n\n") + "\n";
}
