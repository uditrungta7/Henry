-- Remote password reset. When a customer forgets their local app password,
-- flip reset_password to true on their row in the dashboard. On the machine's
-- next license check the app clears its local password (the lock screen goes
-- away), and the server flips the flag back to false in the same request.
alter table licenses add column if not exists reset_password boolean not null default false;
