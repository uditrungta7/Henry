-- Add employee fields carried in the Rapier spreadsheet but not in the original
-- schema: EID (their employee id), and home city/state. All optional, reference
-- only. Existing rows get NULL.
alter table employees add column if not exists eid   text;
alter table employees add column if not exists city  text;
alter table employees add column if not exists state text;
