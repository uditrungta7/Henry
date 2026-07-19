export type Shift = "AM" | "PM";

export type BoardCustomer = {
  id: string;
  name: string;
  address: string | null;
  color: string;
  open_start: string | null;
  open_end: string | null;
  is_pinned: boolean;
};

export type BoardEmployee = {
  id: string;
  name: string;
  color: string;
  email: string | null;
  phone: string | null;
};

export type BoardAssignment = {
  id: string;
  customer_id: string;
  employee_id: string;
  work_date: string;
  shift: Shift;
  notes: string | null;
  status: "draft" | "published";
};

export type TimeOff = {
  employee_id: string;
  start_date: string;
  end_date: string;
};
