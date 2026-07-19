"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  CUSTOMER_SHEET,
  EMPLOYEE_SHEET,
  COLOR_SHEET,
  CUSTOMER_FIELDS,
  EMPLOYEE_FIELDS,
  autoMap,
  toCustomer,
  toEmployee,
  colorsByName,
  type Mapping,
  type CustomerField,
  type EmployeeField,
} from "@/lib/import/schema";
import { importRecords } from "./actions";

type Parsed = {
  customerHeaders: string[];
  customerRows: Record<string, unknown>[];
  employeeHeaders: string[];
  employeeRows: Record<string, unknown>[];
  colors: [string, string][]; // [lower(name), hex], serializable for state
};

type Result = {
  customersAdded: number;
  customersUpdated: number;
  employeesAdded: number;
  employeesUpdated: number;
};

function readSheet(wb: XLSX.WorkBook, name: string) {
  const ws = wb.Sheets[name];
  if (!ws) return { headers: [] as string[], rows: [] as Record<string, unknown>[] };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
  });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

export default function ImportClient() {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [custMap, setCustMap] = useState<Mapping<CustomerField> | null>(null);
  const [empMap, setEmpMap] = useState<Mapping<EmployeeField> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError("");
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      // cellStyles so we can read the customer fill colors below.
      const wb = XLSX.read(buf, { type: "array", cellStyles: true });
      const cust = readSheet(wb, CUSTOMER_SHEET);
      const emp = readSheet(wb, EMPLOYEE_SHEET);

      // Customer colors from the FORMATTING COLOR sheet's cell fills.
      const colorSheet = wb.Sheets[COLOR_SHEET];
      const colors = colorSheet
        ? [...colorsByName(colorSheet as never).entries()]
        : [];

      if (cust.headers.length === 0 && emp.headers.length === 0) {
        setError(
          `Couldn't find a "${CUSTOMER_SHEET}" or "${EMPLOYEE_SHEET}" sheet in that file.`
        );
        return;
      }

      setFileName(file.name);
      setParsed({
        customerHeaders: cust.headers,
        customerRows: cust.rows,
        employeeHeaders: emp.headers,
        employeeRows: emp.rows,
        colors,
      });
      setCustMap(autoMap(CUSTOMER_FIELDS, cust.headers));
      setEmpMap(autoMap(EMPLOYEE_FIELDS, emp.headers));
    } catch {
      setError("That file couldn't be read. Make sure it's an .xlsx file.");
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function confirmImport() {
    if (!parsed || !custMap || !empMap) return;
    setSubmitting(true);
    setError("");
    try {
      const colorMap = new Map(parsed.colors);
      const customers = parsed.customerRows
        .map((r) => toCustomer(r, custMap, colorMap))
        .filter((c) => c.name.trim());
      const employees = parsed.employeeRows
        .map((r) => toEmployee(r, empMap))
        .filter((e) => e.name.trim());

      const data = await importRecords({ customers, employees });
      if ("error" in data && data.error) {
        setError(data.error);
        return;
      }
      setResult(data as Result);
      setParsed(null);
    } finally {
      setSubmitting(false);
    }
  }

  // ---- Results screen ----
  if (result) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-3xl font-bold">Import complete</h1>
        <ul className="space-y-1 text-lg text-slate-700">
          <li>Customers added: {result.customersAdded}</li>
          <li>Customers updated: {result.customersUpdated}</li>
          <li>Employees added: {result.employeesAdded}</li>
          <li>Employees updated: {result.employeesUpdated}</li>
        </ul>
        <button
          onClick={() => {
            setResult(null);
            setFileName("");
          }}
          className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
        >
          Import another file
        </button>
      </div>
    );
  }

  // ---- Mapping + preview screen ----
  if (parsed && custMap && empMap) {
    const colorMap = new Map(parsed.colors);
    const customerPreview = parsed.customerRows
      .map((r) => toCustomer(r, custMap, colorMap))
      .filter((c) => c.name.trim());
    const employeePreview = parsed.employeeRows
      .map((r) => toEmployee(r, empMap))
      .filter((e) => e.name.trim());
    const missingEmailCount = employeePreview.filter((e) => e.missingEmail).length;
    const coloredCount = customerPreview.filter((c) => c.color).length;

    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold">Review import</h1>
          <p className="text-slate-600">
            From <span className="font-medium">{fileName}</span>. Check the
            columns matched correctly, then confirm.
          </p>
        </header>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>
        )}

        <MappingTable
          title="Customers"
          fields={CUSTOMER_FIELDS}
          headers={parsed.customerHeaders}
          mapping={custMap}
          onChange={(field, header) =>
            setCustMap({ ...custMap, [field]: header })
          }
        />

        {coloredCount > 0 && (
          <p className="text-sm text-slate-500">
            Matched a color from the spreadsheet for {coloredCount} of{" "}
            {customerPreview.length} customers.
          </p>
        )}

        <PreviewTable
          columns={["", "Name", "Address", "Contact", "Opens", "Closes"]}
          rows={customerPreview.slice(0, 8).map((c) => [
            c.color ? (
              <span
                className="inline-block h-4 w-4 rounded-full border border-slate-200"
                style={{ backgroundColor: c.color }}
                title={c.color}
              />
            ) : (
              "-"
            ),
            c.name,
            c.address ?? "-",
            c.contact_name ?? "-",
            c.open_start ?? "-",
            c.open_end ?? "-",
          ])}
          total={customerPreview.length}
        />

        <MappingTable
          title="Employees"
          fields={EMPLOYEE_FIELDS}
          headers={parsed.employeeHeaders}
          mapping={empMap}
          onChange={(field, header) =>
            setEmpMap({ ...empMap, [field]: header })
          }
        />

        {missingEmailCount > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
            {missingEmailCount} employee
            {missingEmailCount === 1 ? "" : "s"} have no email. They&apos;ll be
            imported, but can&apos;t receive a schedule until you add one.
          </p>
        )}

        <PreviewTable
          columns={["Name", "EID", "Role", "E-Rating", "City", "State", "Email"]}
          rows={employeePreview.slice(0, 8).map((e) => [
            e.name,
            e.eid ?? "-",
            e.role ?? "-",
            e.rating != null ? String(e.rating) : "-",
            e.city ?? "-",
            e.state ?? "-",
            e.missingEmail ? "⚠ missing" : e.email!,
          ])}
          total={employeePreview.length}
        />

        <div className="flex gap-3">
          <button
            onClick={confirmImport}
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-5 py-3 text-lg font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting
              ? "Importing..."
              : `Import ${customerPreview.length} customers and ${employeePreview.length} employees`}
          </button>
          <button
            onClick={() => setParsed(null)}
            className="rounded-lg px-5 py-3 text-lg text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ---- Drop zone ----
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Import from a spreadsheet</h1>
        <p className="mt-1 text-slate-600">
          Bring your customers and employees in from an Excel file. Nothing is
          saved until you review the matched columns on the next step.
        </p>
      </header>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>
      )}

      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
        {/* Drop zone: smaller, so the page doesn't read as empty. */}
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/40"
        >
          <svg
            className="mb-3 h-10 w-10 text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
          <p className="text-lg font-semibold">Drop your .xlsx file here</p>
          <p className="mt-1 text-slate-500">or click to choose a file</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>

        {/* Format guidance, so a non-technical owner knows exactly what to upload. */}
        <aside className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-700">
            What your file should look like
          </h2>
          <ul className="mt-3 space-y-3 text-sm text-slate-600">
            <li className="flex gap-2">
              <span className="text-slate-400">1.</span>
              <span>
                An Excel workbook (<span className="font-medium">.xlsx</span>) — the
                kind Excel, Google Sheets, or Numbers export.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-slate-400">2.</span>
              <span>
                A sheet named{" "}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                  {CUSTOMER_SHEET}
                </span>{" "}
                for your sites, and one named{" "}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                  {EMPLOYEE_SHEET}
                </span>{" "}
                for your team.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-slate-400">3.</span>
              <span>
                A header row on top (Name, Address, Email, and so on). You&apos;ll
                match those columns on the next step, so exact names aren&apos;t
                required.
              </span>
            </li>
          </ul>
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            Only these two sheets are read. Importing again updates existing
            records by name instead of creating duplicates.
          </p>
        </aside>
      </div>
    </div>
  );
}

function MappingTable<F extends string>({
  title,
  fields,
  headers,
  mapping,
  onChange,
}: {
  title: string;
  fields: { field: F; label: string; required?: boolean }[];
  headers: string[];
  mapping: Mapping<F>;
  onChange: (field: F, header: string | null) => void;
}) {
  if (headers.length === 0) {
    return (
      <section>
        <h2 className="mb-2 text-xl font-semibold">{title}</h2>
        <p className="text-slate-500">No sheet found for {title.toLowerCase()}.</p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="mb-2 text-xl font-semibold">{title}: column matching</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.field} className="flex items-center gap-2">
            <span className="w-40 shrink-0 text-slate-700">
              {f.label}
              {f.required && <span className="text-red-500"> *</span>}
            </span>
            <select
              value={mapping[f.field] ?? ""}
              onChange={(e) => onChange(f.field, e.target.value || null)}
              className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5"
            >
              <option value="">(not imported)</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </section>
  );
}

function PreviewTable({
  columns,
  rows,
  total,
}: {
  columns: string[];
  rows: React.ReactNode[][];
  total: number;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-100">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100">
              {r.map((cell, j) => (
                <td key={j} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {total > rows.length && (
        <p className="px-3 py-2 text-slate-500">
          ...and {total - rows.length} more.
        </p>
      )}
    </div>
  );
}
