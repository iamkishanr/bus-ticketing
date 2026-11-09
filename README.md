# Bus Ticketing

A working prototype: a passenger reserves a numbered seat on a bus service, pays
through a simulated gateway, and receives a QR ticket. A conductor opens a
scanner in a phone browser and validates it once at the door.

Stops are named after well-known Bangalore localities. These are bus services
along those corridors, not metro trains.

## Running it

```bash
docker compose up -d                 # Postgres on :5433
cp .env.example .env                 # then fill TICKET_TOKEN_SECRET
openssl rand -hex 32                 # generate that secret
npx prisma db push                   # create tables
docker compose exec -T db psql -U bus -d bus_ticketing < prisma/sql/immutable_events.sql
npm run db:seed                      # 3 routes, 24 stops, 2 weeks of trips
npm run dev                          # http://localhost:3000
```

### Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection |
| `TICKET_TOKEN_SECRET` | HMAC key signing QR tokens. **Min 32 chars — the app refuses to start otherwise.** |
| `ADMIN_PASSCODE` | Operator area (`/admin`). Demo default: `admin-demo` |
| `CONDUCTOR_PASSCODE` | Scanner (`/scan`). Demo default: `conductor-demo` |
| `HOLD_DURATION_MINUTES` | Seat hold length, default 10. **Set to 1 to demo hold expiry.** |

## The four surfaces

- `/` — search services, pick a seat, pay, get a QR
- `/find` — retrieve a booking by its reference
- `/scan` — conductor scanner (passcode required, pick a service, then scan)
- `/admin` — routes, schedules, trip generation, manifests, demo reset

## Demoing the edge cases

| To show | Do this |
|---|---|
| Payment failure releases the seat | Tick **Force this payment to fail** on the booking page |
| Hold expiry | Set `HOLD_DURATION_MINUTES=1`, hold a seat, wait |
| Ticket cannot be reused | Scan the same QR twice — second scan says `ALREADY USED` with the time |
| Wrong-service refusal | Scan a ticket while the scanner is set to a different service |
| Cancellation frees the seat | Cancel from the booking page, then reload the seat map |
| Start over | Operator → Reset demo data (type `RESET`) |

## Tests

There is no unit-test suite. The two correctness properties that cannot be seen
by clicking are automated, and they are release gates:

```bash
npm run test:concurrency
```

Each fires 8 parallel requests over **distinct database connections** and asserts
exactly one wins:

- **No seat sells twice** — concurrent holds on one seat yield one success
- **No ticket is used twice** — concurrent scans of one QR yield one pass

Distinct connections matter: a single pooled client serializes requests, and the
gate would pass without proving anything.

Everything else is verified by using the app, per `docs/plans/`.

## How it works

- **Seat integrity** — one conditional `UPDATE` per hold. Postgres re-evaluates
  the predicate after the row lock releases under READ COMMITTED, so a loser
  affects zero rows. No `SELECT … FOR UPDATE`.
- **Hold ownership** — the acquire returns a `hold_token`. `confirmBooking`
  requires it, so knowing a trip and seat is not enough to pay for someone
  else's held seat.
- **QR tokens** — `<ticket_id>.<HMAC-SHA256>`, compared with `timingSafeEqual`.
  The ticket row is the authority for paid/used state; the signature only proves
  this server issued the token.
- **Replay** — validation is one conditional `UPDATE`; zero rows means already
  used, wrong trip, or cancelled.
- **Hold expiry** — by timestamp, reclaimed lazily. No scheduler. Reclaiming a
  lapsed hold writes the `expired` event, which is the only moment that
  transition is observed.
- **Event log** — `ticket_events` is append-only, enforced by a trigger that
  rejects row-level `UPDATE`/`DELETE` while permitting `TRUNCATE` for the demo
  reset. Every write happens inside the same transaction as its state change,
  so the log cannot disagree with booking state.

Each validated scan records trip, seat, boarding stop, alighting stop, and
timestamp — enough to compute per-segment occupancy later without adding
instrumentation.
