"use client";

import * as XLSX from "xlsx";
import { Button } from "@/components/ui";
import { formatTime } from "@/lib/format";

type CustomerRow = {
  name: string;
  address: string | null;
  contact_name: string | null;
  phone: string | null;
  open_start: string | null;
  open_end: string | null;
};

type EmployeeRow = {
  name: string;
  role: string | null;
  rating: number | null;
  phone: string | null;
  email: string | null;
};

export type ExportData = {
  customers: CustomerRow[];
  employees: EmployeeRow[];
};

// Build a one-sheet workbook with readable headers and trigger a download.
function downloadSheet(
  rows: Record<string, unknown>[],
  sheetName: string,
  fileName: string
) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default function ExportClient({
  data,
  companyName,
}: {
  data: ExportData;
  companyName: string;
}) {
  const prefix = slug(companyName) || "company";

  function exportCustomers() {
    const rows = data.customers.map((c) => ({
      Name: c.name,
      Address: c.address ?? "",
      "Contact name": c.contact_name ?? "",
      Phone: c.phone ?? "",
      Opens: formatTime(c.open_start),
      Closes: formatTime(c.open_end),
    }));
    downloadSheet(rows, "Customers", `${prefix}-customers.xlsx`);
  }

  function exportEmployees() {
    const rows = data.employees.map((e) => ({
      Name: e.name,
      Role: e.role ?? "",
      Rating: e.rating ?? "",
      Phone: e.phone ?? "",
      Email: e.email ?? "",
    }));
    downloadSheet(rows, "Employees", `${prefix}-employees.xlsx`);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button
        variant="secondary"
        onClick={exportCustomers}
        disabled={data.customers.length === 0}
      >
        Export customers ({data.customers.length})
      </Button>
      <Button
        variant="secondary"
        onClick={exportEmployees}
        disabled={data.employees.length === 0}
      >
        Export employees ({data.employees.length})
      </Button>
    </div>
  );
}
