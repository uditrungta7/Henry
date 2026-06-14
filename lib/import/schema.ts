// Shared model for the Excel import: which app fields each sheet maps to, how to
// auto-detect them from headers, and how to normalize a raw row into a record.
// Used by both the client preview and the server upsert.

export const CUSTOMER_SHEET = "CUSTOMER DATA";
export const EMPLOYEE_SHEET = "EMPLOYEE DATA";

// App fields the boss maps spreadsheet columns onto.
export type CustomerField =
  | "name"
  | "contact_name"
  | "phone"
  | "address"
  | "city"
  | "zip"
  | "open_start"
  | "open_end";

export type EmployeeField =
  | "name"
  | "eid"
  | "role"
  | "rating"
  | "phone"
  | "email"
  | "city"
  | "state";

type FieldDef<F extends string> = {
  field: F;
  label: string;
  required?: boolean;
  // Header substrings (lowercased) that auto-map to this field, best match first.
  match: string[];
};

export const CUSTOMER_FIELDS: FieldDef<CustomerField>[] = [
  { field: "name", label: "Customer name", required: true, match: ["customer name", "name"] },
  { field: "contact_name", label: "Contact name", match: ["contact_name", "contact name", "contact"] },
  { field: "phone", label: "Phone", match: ["contact_phone", "phone"] },
  { field: "address", label: "Address", match: ["address", "street"] },
  { field: "city", label: "City", match: ["city"] },
  { field: "zip", label: "ZIP", match: ["zip", "postal"] },
  { field: "open_start", label: "Opens (start time)", match: ["start time", "open"] },
  { field: "open_end", label: "Closes (end time)", match: ["end time", "close"] },
];

export const EMPLOYEE_FIELDS: FieldDef<EmployeeField>[] = [
  { field: "name", label: "Full name", required: true, match: ["full name", "name"] },
  { field: "eid", label: "Employee ID (EID)", match: ["eid"] },
  { field: "role", label: "Role / position", match: ["position", "role", "title"] },
  { field: "rating", label: "E-Rating (1-10)", match: ["e-rating", "rating"] },
  { field: "phone", label: "Phone", match: ["phone"] },
  { field: "email", label: "Email (delivery address)", match: ["real email", "email"] },
  { field: "city", label: "City", match: ["city"] },
  { field: "state", label: "State", match: ["state"] },
];

// A mapping is field -> source column header (or null if unmapped).
export type Mapping<F extends string> = Record<F, string | null>;

// Auto-detect a mapping from the sheet's header row. First field whose match list
// hits a header wins that header; a header is claimed by at most one field.
export function autoMap<F extends string>(
  fields: FieldDef<F>[],
  headers: string[]
): Mapping<F> {
  const map = {} as Mapping<F>;
  const used = new Set<string>();
  const norm = headers.map((h) => ({ raw: h, low: h.trim().toLowerCase() }));

  for (const f of fields) {
    map[f.field] = null;
    for (const needle of f.match) {
      const hit = norm.find((h) => !used.has(h.raw) && h.low === needle);
      const partial =
        hit ?? norm.find((h) => !used.has(h.raw) && h.low.includes(needle));
      const found = hit ?? partial;
      if (found) {
        map[f.field] = found.raw;
        used.add(found.raw);
        break;
      }
    }
  }
  return map;
}

// "6:00 AM" / "16:30" / Excel time fraction -> "HH:MM" 24h, or null.
export function parseTime(value: unknown): string | null {
  if (value == null || value === "") return null;

  // Excel stores times as a fraction of a day.
  if (typeof value === "number" && value >= 0 && value < 1) {
    const mins = Math.round(value * 24 * 60);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const s = String(value).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function cell(row: Record<string, unknown>, header: string | null): string {
  if (!header) return "";
  const v = row[header];
  return v == null ? "" : String(v).trim();
}

export const COLOR_SHEET = "FORMATTING COLOR";

// Normalize a SheetJS fill rgb ("FFFF00" or "FFFFFF00") to a #RRGGBB hex string.
export function fillToHex(rgb: string | undefined): string | null {
  if (!rgb) return null;
  const hex = rgb.length === 8 ? rgb.slice(2) : rgb; // drop leading alpha
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return `#${hex.toLowerCase()}`;
}

// Map lower(customer name) -> color hex, read from the FORMATTING COLOR sheet's
// cell fills (column with the customer name). The worksheet must be read with
// { cellStyles: true } so cells carry a `.s` style with fgColor.
export function colorsByName(
  ws: Record<string, { v?: unknown; s?: { fgColor?: { rgb?: string } } }> & {
    "!ref"?: string;
  }
): Map<string, string> {
  const colors = new Map<string, string>();
  const ref = ws["!ref"];
  if (!ref) return colors;

  // Walk every cell; whichever holds a customer name with a solid fill wins.
  for (const addr of Object.keys(ws)) {
    if (addr.startsWith("!")) continue;
    const cellData = ws[addr];
    const name = cellData?.v;
    const hex = fillToHex(cellData?.s?.fgColor?.rgb);
    if (typeof name === "string" && name.trim() && hex) {
      const key = name.trim().toLowerCase();
      if (!colors.has(key)) colors.set(key, hex);
    }
  }
  return colors;
}

export type CustomerRecord = {
  name: string;
  contact_name: string | null;
  phone: string | null;
  address: string | null;
  open_start: string | null;
  open_end: string | null;
  color: string | null;
};

export type EmployeeRecord = {
  name: string;
  eid: string | null;
  role: string | null;
  rating: number | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  missingEmail: boolean;
};

const blank = (s: string) => (s === "" ? null : s);

// Combine Address + CITY + ZIP into one line, e.g. "123 Main St, Garland 75041".
function joinAddress(street: string, city: string, zip: string): string | null {
  const cityZip = [city, zip].filter(Boolean).join(" ");
  const parts = [street, cityZip].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function toCustomer(
  row: Record<string, unknown>,
  map: Mapping<CustomerField>,
  colors?: Map<string, string>
): CustomerRecord {
  const name = cell(row, map.name);
  return {
    name,
    contact_name: blank(cell(row, map.contact_name)),
    phone: blank(cell(row, map.phone)),
    address: joinAddress(
      cell(row, map.address),
      cell(row, map.city),
      cell(row, map.zip)
    ),
    open_start: parseTime(row[map.open_start ?? ""]),
    open_end: parseTime(row[map.open_end ?? ""]),
    color: colors?.get(name.trim().toLowerCase()) ?? null,
  };
}

export function toEmployee(
  row: Record<string, unknown>,
  map: Mapping<EmployeeField>
): EmployeeRecord {
  const ratingRaw = cell(row, map.rating);
  const ratingNum = ratingRaw ? parseInt(ratingRaw, 10) : NaN;
  const rating =
    Number.isFinite(ratingNum) && ratingNum >= 1 && ratingNum <= 10
      ? ratingNum
      : null;
  const email = blank(cell(row, map.email).toLowerCase());
  return {
    name: cell(row, map.name),
    eid: blank(cell(row, map.eid)),
    role: blank(cell(row, map.role)),
    rating,
    phone: blank(cell(row, map.phone)),
    email,
    city: blank(cell(row, map.city)),
    state: blank(cell(row, map.state)),
    missingEmail: email === null,
  };
}
