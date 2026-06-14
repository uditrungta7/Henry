"use client";

import { useState, useTransition, useOptimistic } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Button, Modal, Field, Input } from "@/components/ui";
import { addDays, formatDayLabel, weekdayShort, monthDayShort } from "@/lib/dates";
import { assign, unassign, move, setNotes, copyWeek } from "./actions";
import { onTimeOff, customerClosed } from "./warnings";
import PublishPanel, { type PreviewEmployee } from "./PublishPanel";
import type {
  BoardCustomer,
  BoardEmployee,
  BoardAssignment,
  TimeOff,
  Shift,
} from "./types";

// Shift lines per assigned employee for the day, for the publish email preview.
function buildPreviewEmployees(
  date: string,
  employees: BoardEmployee[],
  customers: BoardCustomer[],
  assignments: BoardAssignment[]
): PreviewEmployee[] {
  const custById = new Map(customers.map((c) => [c.id, c]));
  const dayAssignments = assignments.filter((a) => a.work_date === date);
  const byEmployee = new Map<string, PreviewEmployee>();

  for (const emp of employees) {
    const shifts = dayAssignments
      .filter((a) => a.employee_id === emp.id)
      .map((a) => {
        const c = custById.get(a.customer_id);
        return {
          shift: a.shift,
          customerName: c?.name ?? "Unknown",
          address: c?.address ?? null,
          notes: a.notes,
        };
      });
    if (shifts.length > 0) {
      byEmployee.set(emp.id, {
        id: emp.id,
        name: emp.name,
        phone: emp.phone,
        shifts,
      });
    }
  }
  return [...byEmployee.values()];
}

const SHIFTS: Shift[] = ["AM", "PM"];

type Props = {
  date: string;
  view: "day" | "week";
  days: string[];
  companyName: string;
  customers: BoardCustomer[];
  employees: BoardEmployee[];
  assignments: BoardAssignment[];
  timeOff: TimeOff[];
};

// Encodes a board cell as a droppable id: "customerId|date|shift".
const cellId = (customerId: string, date: string, shift: Shift) =>
  `${customerId}|${date}|${shift}`;
const parseCell = (id: string) => {
  const [customerId, date, shift] = id.split("|");
  return { customerId, date, shift: shift as Shift };
};

// Optimistic mutations applied to the board instantly, before the server
// responds. useOptimistic reverts to authoritative server data when the
// transition settles, so an error (e.g. double-book) snaps the board back.
type OptimisticAction =
  | { type: "add"; assignment: BoardAssignment }
  | { type: "remove"; id: string }
  | {
      type: "move";
      id: string;
      toCustomerId: string;
      toShift: Shift;
      swapWithId: string | null;
    }
  | { type: "notes"; id: string; notes: string | null };

function applyOptimistic(
  list: BoardAssignment[],
  action: OptimisticAction
): BoardAssignment[] {
  switch (action.type) {
    case "add":
      return [...list, action.assignment];
    case "remove":
      return list.filter((a) => a.id !== action.id);
    case "notes":
      return list.map((a) =>
        a.id === action.id ? { ...a, notes: action.notes } : a
      );
    case "move": {
      const moving = list.find((a) => a.id === action.id);
      if (!moving) return list;
      return list.map((a) => {
        if (a.id === action.id) {
          return { ...a, customer_id: action.toCustomerId, shift: action.toShift };
        }
        // Swap target takes the moving assignment's old cell.
        if (action.swapWithId && a.id === action.swapWithId) {
          return { ...a, customer_id: moving.customer_id, shift: moving.shift };
        }
        return a;
      });
    }
  }
}

export default function Board({
  date,
  view,
  days,
  companyName,
  customers,
  employees,
  assignments: serverAssignments,
  timeOff,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notesFor, setNotesFor] = useState<BoardAssignment | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);

  // Optimistic view of the assignments: updates instantly, reverts to server
  // data when the transition settles (so errors roll back automatically).
  const [assignments, applyOptimisticAction] = useOptimistic(
    serverAssignments,
    applyOptimistic
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const empById = new Map(employees.map((e) => [e.id, e]));

  function navigate(nextDate: string, nextView: "day" | "week") {
    router.push(`/?date=${nextDate}&view=${nextView}`);
  }

  // Run a server action, applying an optimistic board change first. The
  // optimistic update is shown immediately; router.refresh() reconciles with
  // the server, and a server error rolls the optimistic change back.
  function run(
    serverAction: () => Promise<{ error?: string }>,
    optimistic?: OptimisticAction
  ) {
    setError("");
    startTransition(async () => {
      if (optimistic) applyOptimisticAction(optimistic);
      const res = await serverAction();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function doAssign(
    customerId: string,
    employeeId: string,
    day: string,
    shift: Shift
  ) {
    run(() => assign(customerId, employeeId, day, shift), {
      type: "add",
      assignment: {
        // Temp id for the optimistic chip; server assigns the real UUID on refresh.
        id: `optimistic-${customerId}-${day}-${shift}-${employeeId}`,
        customer_id: customerId,
        employee_id: employeeId,
        work_date: day,
        shift,
        notes: null,
        status: "draft",
      },
    });
  }

  function doUnassign(id: string) {
    run(() => unassign(id), { type: "remove", id });
  }

  function assignmentAt(customerId: string, day: string, shift: Shift) {
    return assignments.find(
      (a) =>
        a.customer_id === customerId &&
        a.work_date === day &&
        a.shift === shift
    );
  }

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const assignmentId = String(e.active.id);
    const target = parseCell(String(e.over.id));
    const moving = assignments.find((a) => a.id === assignmentId);
    if (!moving) return;

    // Same cell? nothing to do.
    if (
      moving.customer_id === target.customerId &&
      moving.work_date === target.date &&
      moving.shift === target.shift
    ) {
      return;
    }

    // Swap-on-drop happens within a single day; dnd cells carry their own date.
    const existing = assignmentAt(target.customerId, target.date, target.shift);
    run(
      () =>
        move(
          assignmentId,
          target.customerId,
          target.shift,
          existing?.id ?? null
        ),
      {
        type: "move",
        id: assignmentId,
        toCustomerId: target.customerId,
        toShift: target.shift,
        swapWithId: existing?.id ?? null,
      }
    );
  }

  if (customers.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
        <h1 className="text-2xl font-bold">No customers yet</h1>
        <p className="mt-1 text-slate-500">
          Add customers or import them, then come back to schedule your team.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Toolbar
        date={date}
        view={view}
        pending={pending}
        onNavigate={navigate}
        onPublish={() => setPublishOpen(true)}
        onCopyWeek={() =>
          run(async () => {
            const res = await copyWeek(date);
            if (!res.error) {
              router.refresh();
            }
            return res;
          })
        }
      />

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left">
            <thead className="bg-slate-50 text-sm text-slate-500">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 font-medium">
                  Customer
                </th>
                {view === "day"
                  ? SHIFTS.map((s) => (
                      <th key={s} className="px-4 py-3 font-medium">
                        {s === "AM" ? "Morning" : "Afternoon"}
                      </th>
                    ))
                  : days.map((d) => (
                      <th key={d} className="px-3 py-3 text-center font-medium">
                        <div>{weekdayShort(d)}</div>
                        <div className="text-slate-400">{monthDayShort(d)}</div>
                      </th>
                    ))}
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 align-top">
                  <td className="sticky left-0 z-10 bg-white px-4 py-3">
                    <span className="flex items-center gap-2 font-medium">
                      <span
                        className="inline-block h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                    </span>
                    {c.address && (
                      <div className="text-sm text-slate-500">{c.address}</div>
                    )}
                  </td>

                  {view === "day"
                    ? SHIFTS.map((shift) => (
                        <Cell
                          key={shift}
                          customer={c}
                          day={date}
                          shift={shift}
                          assignment={assignmentAt(c.id, date, shift)}
                          employees={employees}
                          empById={empById}
                          timeOff={timeOff}
                          onAssign={(empId) =>
                            doAssign(c.id, empId, date, shift)
                          }
                          onUnassign={(id) => doUnassign(id)}
                          onNotes={(a) => setNotesFor(a)}
                        />
                      ))
                    : days.map((day) => (
                        <WeekDayCell
                          key={day}
                          customer={c}
                          day={day}
                          assignments={SHIFTS.map((shift) => ({
                            shift,
                            assignment: assignmentAt(c.id, day, shift),
                          }))}
                          employees={employees}
                          empById={empById}
                          timeOff={timeOff}
                          onAssign={(empId, shift) =>
                            doAssign(c.id, empId, day, shift)
                          }
                          onUnassign={(id) => doUnassign(id)}
                        />
                      ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DndContext>

      {notesFor && (
        <NotesModal
          assignment={notesFor}
          onClose={() => setNotesFor(null)}
          onSave={(notes) => {
            setNotesFor(null);
            run(
              () => setNotes(notesFor.id, notes),
              { type: "notes", id: notesFor.id, notes }
            );
          }}
        />
      )}

      {publishOpen && (
        <PublishPanel
          date={date}
          companyName={companyName}
          assignedEmployees={employees.filter((e) =>
            assignments.some(
              (a) => a.work_date === date && a.employee_id === e.id
            )
          )}
          allEmployees={employees}
          previewEmployees={buildPreviewEmployees(
            date,
            employees,
            customers,
            assignments
          )}
          onClose={() => setPublishOpen(false)}
        />
      )}
    </div>
  );
}

function Toolbar({
  date,
  view,
  pending,
  onNavigate,
  onPublish,
  onCopyWeek,
}: {
  date: string;
  view: "day" | "week";
  pending: boolean;
  onNavigate: (date: string, view: "day" | "week") => void;
  onPublish: () => void;
  onCopyWeek: () => void;
}) {
  const step = view === "week" ? 7 : 1;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => onNavigate(addDays(date, -step), view)}
        >
          ‹ Prev
        </Button>
        <h1 className="min-w-48 text-center text-2xl font-bold">
          {formatDayLabel(date)}
        </h1>
        <Button
          variant="secondary"
          onClick={() => onNavigate(addDays(date, step), view)}
        >
          Next ›
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-slate-300">
          <button
            onClick={() => onNavigate(date, "day")}
            className={`px-4 py-2 font-medium ${
              view === "day" ? "bg-blue-600 text-white" : "bg-white text-slate-700"
            }`}
          >
            Day
          </button>
          <button
            onClick={() => onNavigate(date, "week")}
            className={`px-4 py-2 font-medium ${
              view === "week"
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-700"
            }`}
          >
            Week
          </button>
        </div>
        {view === "week" && (
          <Button variant="secondary" disabled={pending} onClick={onCopyWeek}>
            Copy week → next
          </Button>
        )}
        {view === "day" && (
          <Button disabled={pending} onClick={onPublish}>
            Publish day
          </Button>
        )}
      </div>
    </div>
  );
}

// A single AM or PM cell in the day view: shows the assigned chip (draggable)
// or an assign dropdown, plus warnings.
function Cell({
  customer,
  day,
  shift,
  assignment,
  employees,
  empById,
  timeOff,
  onAssign,
  onUnassign,
  onNotes,
}: {
  customer: BoardCustomer;
  day: string;
  shift: Shift;
  assignment: BoardAssignment | undefined;
  employees: BoardEmployee[];
  empById: Map<string, BoardEmployee>;
  timeOff: TimeOff[];
  onAssign: (employeeId: string) => void;
  onUnassign: (id: string) => void;
  onNotes: (a: BoardAssignment) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: cellId(customer.id, day, shift),
  });
  const closed = customerClosed(customer, shift);

  return (
    <td
      ref={setNodeRef}
      className={`px-4 py-3 ${isOver ? "bg-blue-50" : ""}`}
      style={{ minWidth: 220 }}
    >
      {assignment ? (
        <AssignmentChip
          assignment={assignment}
          employee={empById.get(assignment.employee_id)}
          onTimeOff={onTimeOff(assignment.employee_id, day, timeOff)}
          closed={closed}
          onUnassign={() => onUnassign(assignment.id)}
          onNotes={() => onNotes(assignment)}
        />
      ) : (
        <AssignSelect
          employees={employees}
          onAssign={onAssign}
          hint={closed ? "Site closed this shift" : null}
        />
      )}
    </td>
  );
}

// Week view packs both shifts into one day column to stay compact.
function WeekDayCell({
  customer,
  day,
  assignments,
  employees,
  empById,
  timeOff,
  onAssign,
  onUnassign,
}: {
  customer: BoardCustomer;
  day: string;
  assignments: { shift: Shift; assignment: BoardAssignment | undefined }[];
  employees: BoardEmployee[];
  empById: Map<string, BoardEmployee>;
  timeOff: TimeOff[];
  onAssign: (employeeId: string, shift: Shift) => void;
  onUnassign: (id: string) => void;
}) {
  return (
    <td className="px-2 py-3 align-top" style={{ minWidth: 150 }}>
      <div className="space-y-2">
        {assignments.map(({ shift, assignment }) => (
          <WeekShiftSlot
            key={shift}
            customer={customer}
            day={day}
            shift={shift}
            assignment={assignment}
            employees={employees}
            empById={empById}
            timeOff={timeOff}
            onAssign={(empId) => onAssign(empId, shift)}
            onUnassign={onUnassign}
          />
        ))}
      </div>
    </td>
  );
}

function WeekShiftSlot({
  customer,
  day,
  shift,
  assignment,
  employees,
  empById,
  timeOff,
  onAssign,
  onUnassign,
}: {
  customer: BoardCustomer;
  day: string;
  shift: Shift;
  assignment: BoardAssignment | undefined;
  employees: BoardEmployee[];
  empById: Map<string, BoardEmployee>;
  timeOff: TimeOff[];
  onAssign: (employeeId: string) => void;
  onUnassign: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: cellId(customer.id, day, shift),
  });
  const closed = customerClosed(customer, shift);
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg p-1 ${isOver ? "bg-blue-50" : ""}`}
    >
      <div className="mb-0.5 text-xs font-medium text-slate-400">
        {shift === "AM" ? "Morning" : "Afternoon"}
      </div>
      {assignment ? (
        <AssignmentChip
          assignment={assignment}
          employee={empById.get(assignment.employee_id)}
          onTimeOff={onTimeOff(assignment.employee_id, day, timeOff)}
          closed={closed}
          onUnassign={() => onUnassign(assignment.id)}
          onNotes={null}
        />
      ) : (
        <AssignSelect
          employees={employees}
          onAssign={onAssign}
          hint={closed ? "Closed" : null}
        />
      )}
    </div>
  );
}

function AssignmentChip({
  assignment,
  employee,
  onTimeOff: isOff,
  closed,
  onUnassign,
  onNotes,
}: {
  assignment: BoardAssignment;
  employee: BoardEmployee | undefined;
  onTimeOff: boolean;
  closed: boolean;
  onUnassign: () => void;
  onNotes: (() => void) | null;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: assignment.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border p-2 ${isDragging ? "opacity-50" : ""} ${
        assignment.status === "published"
          ? "border-slate-200"
          : "border-dashed border-slate-300"
      }`}
      style={{
        backgroundColor: (employee?.color ?? "#64748b") + "22",
        borderLeft: `4px solid ${employee?.color ?? "#64748b"}`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          {...listeners}
          {...attributes}
          className="cursor-grab text-left font-medium active:cursor-grabbing"
        >
          {employee?.name ?? "Unknown"}
        </button>
        <button
          onClick={onUnassign}
          className="text-slate-400 hover:text-red-600"
          title="Remove"
        >
          ✕
        </button>
      </div>

      {assignment.notes && (
        <div className="mt-1 text-sm text-slate-600">{assignment.notes}</div>
      )}

      <div className="mt-1 flex flex-wrap gap-1">
        {assignment.status === "draft" && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
            not sent
          </span>
        )}
        {isOff && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
            on time off
          </span>
        )}
        {closed && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
            site closed
          </span>
        )}
      </div>

      {onNotes && (
        <button
          onClick={onNotes}
          className="mt-1 text-xs text-blue-600 hover:underline"
        >
          {assignment.notes ? "Edit note" : "Add note"}
        </button>
      )}
    </div>
  );
}

function AssignSelect({
  employees,
  onAssign,
  hint,
}: {
  employees: BoardEmployee[];
  onAssign: (employeeId: string) => void;
  hint: string | null;
}) {
  return (
    <div>
      <select
        value=""
        onChange={(e) => e.target.value && onAssign(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-slate-600"
      >
        <option value="">+ Assign…</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      {hint && <div className="mt-1 text-xs text-amber-700">{hint}</div>}
    </div>
  );
}

function NotesModal({
  assignment,
  onClose,
  onSave,
}: {
  assignment: BoardAssignment;
  onClose: () => void;
  onSave: (notes: string | null) => void;
}) {
  const [notes, setNotes] = useState(assignment.notes ?? "");
  return (
    <Modal title="Note for this assignment" onClose={onClose}>
      <Field label="Short note (shown in the schedule email)">
        <Input
          value={notes}
          autoFocus
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. bring the tall ladder"
        />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSave(notes.trim() || null)}>Save note</Button>
      </div>
    </Modal>
  );
}
