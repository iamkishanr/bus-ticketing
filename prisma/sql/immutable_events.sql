-- U2/KTD9: ticket_events is append-only. Blocks row-level UPDATE and DELETE;
-- TRUNCATE stays permitted so U12's demo reset can clear the log.
CREATE OR REPLACE FUNCTION ticket_events_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ticket_events is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ticket_events_no_mutate ON ticket_events;
CREATE TRIGGER ticket_events_no_mutate
  BEFORE UPDATE OR DELETE ON ticket_events
  FOR EACH ROW EXECUTE FUNCTION ticket_events_immutable();
