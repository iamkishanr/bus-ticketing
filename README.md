# Bus Ticketing

A working prototype: a passenger reserves a numbered seat on a bus service, pays
through a simulated gateway, and receives a QR ticket. A conductor opens a
scanner in a phone browser and validates it once at the door.

Stops are named after well-known Bangalore localities. These are bus services
along those corridors, not metro trains.

## Documentation

| Document | Read it for |
|---|---|
| [`docs/user-journeys/`](docs/user-journeys/) | Who uses this, what each role owns, and the features that belong to them |
| [`TECHSTACK.md`](TECHSTACK.md) | Versions, why each choice was made, project layout, known limitations |
| [`docs/plans/`](docs/plans/) | The requirements and implementation plan this was built from |

## Running it

```bash
docker compose up -d                 # Postgres on :5433
cp .env.example .env                 # then fill TICKET_TOKEN_SECRET
openssl rand -hex 32                 # generate that secret
npx prisma db push                   # create tables
docker compose exec -T db psql -U bus -d bus_ticketing < prisma/sql/immutable_events.sql
npm run db:seed                      # 6 routes, 12 services, 32 stops, 2 weeks of trips
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

## What a fresh install contains

`npm run db:seed` creates a browsable network so the app is useful immediately:

| | |
|---|---|
| Stops | 32 Bangalore localities |
| Buses | 5, from 20 to 40 seats |
| Routes | 6 corridors (Whitefield, Tumkur Road, Hosur Road, Airport, Outer Ring, South) |
| Services | 12, from 05:30 to 21:30 |
| Trips | ~148, starting **today** through 14 days ahead |
| Bookings / boarding history | none — every seat is free |

The landing page lists today's departures without searching, so a demo needs no
setup. Crowd forecasts and the operator monitor stay empty until passengers
start boarding — they are computed from real scans, never seeded.

Re-running the seed is safe: it extends the trip window rather than duplicating
routes.

## Screens, by who uses them

**Passenger** — no sign-in

| Path | What it does |
|---|---|
| `/` | Today's departures listed by default; search by stop and date |
| `/trips/[tripId]` | Seat map, pick one seat |
| `/book/[holdId]` | Passenger details and simulated payment |
| `/booking/[ref]` | The QR ticket, and cancellation |
| `/find` | Retrieve a booking by its reference |

**Conductor** — `CONDUCTOR_PASSCODE`

| Path | What it does |
|---|---|
| `/scan` | Pick today's service, then scan QR codes |

**Operator** — `ADMIN_PASSCODE`

| Path | What it does |
|---|---|
| `/admin` | Services, trip generation, demo reset |
| `/admin/network` | Add or remove routes, services, stops, buses |
| `/admin/overview` | Occupancy monitor: load per service, day-of-week heatmap, busiest segments |
| `/admin/trips/[tripId]` | Per-trip manifest |

Each role's responsibilities and features are written up in
[`docs/user-journeys/`](docs/user-journeys/).

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

## Removing a route safely

Every foreign key is `ON DELETE CASCADE`, so a naive delete would destroy
schedules, trips, bookings, tickets **and the append-only event log**. The
operator is therefore shown the exact impact first and offered two paths:

- **Retire** — removes future trips that carry neither bookings nor events and
  stops the service generating new ones. Past trips, tickets and occupancy
  history survive, so the monitor keeps reporting them.
- **Delete permanently** — allowed only when the route carries no ticket or
  boarding history at all, and gated behind typing `DELETE`.

Removing one service behaves the same way: unbooked future trips go, anything
with history stays and the service simply stops running.

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
timestamp — enough to compute occupancy with no extra instrumentation. Two
surfaces already read it:

- **Passengers** see a crowd forecast per service in search results, averaged
  over past trips of the same service on the same weekday.
- **Operators** see `/admin/overview`: average and peak load per service, a
  day-of-week heatmap, and the busiest stop-to-stop segments.

The forecast was scored by holding out the last 7 days of history and predicting
each from the 21 before it: mean absolute error 5.3 percentage points, with the
three crowd bands correct on all 24 trips scored. An earlier four-band split
scored only 71% — every miss sat on a band boundary, so the bands were widened
rather than the model changed.
