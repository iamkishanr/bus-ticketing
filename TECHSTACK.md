# Tech Stack

What this project is built with, and why each choice was made. Versions are the
ones actually pinned in `package.json` — not a range.

## Summary

One TypeScript codebase serves three audiences (passenger, conductor, operator)
over one Postgres database. There is no separate API service, no component
library, and no state-management library.

| Layer | Choice | Version |
|---|---|---|
| Runtime | Node.js | 20.x (tested on 20.11.1) |
| Framework | Next.js, App Router | 14.2.35 |
| Language | TypeScript, `strict` | 5.6.3 |
| UI | React (server components by default) | 18.3.1 |
| Database | PostgreSQL | 16 (alpine, via Docker) |
| ORM / migrations | Prisma | 5.22.0 |
| QR generation | `qrcode` | 1.5.4 |
| QR scanning | `html5-qrcode` | 2.3.8 |
| Styling | Plain CSS with custom properties | — |
| Script runner | `tsx` | 4.19.2 |
| Linting | ESLint + `eslint-config-next` | 8.57.1 |

## Why these choices

**Next.js App Router, one application.** The passenger site, the conductor
scanner, and the operator area are route groups in a single codebase rather than
three deployments. Server Actions carry every booking mutation, so seat
integrity logic stays server-side and cannot be bypassed by a client.

**PostgreSQL, not SQLite or a document store.** Two correctness properties
depend on real transactional semantics: a seat cannot be sold twice, and a
ticket cannot be used twice. Both are enforced by conditional `UPDATE`
statements that rely on Postgres re-evaluating a predicate after a row lock
releases under `READ COMMITTED`. A store without that guarantee would need
application-level locking.

**Prisma for schema and migrations, raw SQL where it matters.** Prisma's
generated types keep the data model honest across 20 modules. The two
concurrency-critical statements are written as raw SQL (`$queryRaw`) because
they need `RETURNING` with a pre-image subquery, which the query builder cannot
express.

**Plain CSS, no component library.** The whole visual system is about 400 lines
of custom properties and component classes in `src/app/globals.css`. A library
would have added a build step and a bundle for a prototype whose UI is a dozen
screens. Light and dark palettes are both defined at the token level.

**`html5-qrcode` for scanning.** Chosen because it includes a camera UI and can
delegate to the browser's native `BarcodeDetector` where available. It is loaded
dynamically inside the scanner component so it never enters the passenger
bundle. The component boundary is kept thin so the decoder can be swapped.

**Simulated payments behind an interface.** `PaymentProvider` in
`src/lib/payments/provider.ts` defines `createCharge`; `simulated.ts` implements
it. A real gateway implements the same interface without the booking flow
changing. No real money, no card data, no PCI surface.

## Project layout

```
prisma/
  schema.prisma          10 models, enums, unique constraints
  seed.ts                32 stops, 6 routes, 12 services, 14 days of trips
  sql/immutable_events.sql   append-only trigger on ticket_events

src/app/
  page.tsx               today's departures, search, crowd forecast
  trips/[tripId]/        seat map and hold acquisition
  book/[holdId]/         passenger details and simulated payment
  booking/[ref]/         the ticket (QR) and cancellation
  find/                  retrieve a booking by reference
  scan/                  conductor sign-in and scanner
  admin/                 services and trips, trip generation, demo reset
  admin/network/         add and remove routes, services, stops, buses
  admin/overview/        occupancy monitor
  admin/trips/[tripId]/  per-trip manifest
  actions.ts             shared Server Actions
  globals.css            the whole design system

src/lib/
  seats/hold.ts          KTD2 conditional UPDATE — seat integrity
  tickets/token.ts       HMAC mint and timing-safe verify
  tickets/validate.ts    KTD4 conditional UPDATE — replay prevention
  bookings/confirm.ts    payment, booking, ticket, events in one transaction
  bookings/reference.ts  CSPRNG Crockford base32 reference
  events/record.ts       the single writer for ticket_events
  crowd/estimate.ts      per-service forecast from boarding history
  crowd/overview.ts      operator aggregates and segment analysis
  admin/manage.ts        create/retire/delete with impact analysis
  trips/date.ts          calendar-day handling (timezone-safe)
  trips/reachable.ts     which stops are served onward from an origin
  auth.ts                role passcodes with attempt limiting

src/components/
  Mast.tsx               masthead, doubles as the link home
  AdminNav.tsx           persistent operator navigation
  Countdown.tsx          hold timer (client)
  Scanner.tsx            camera scanner and verdict (client)

tests/
  concurrency.ts         the two release gates
```

## Data model

Ten models. The ones that carry the correctness properties:

- **`SeatInventory`** — exactly one row per `(trip_id, seat_label)` for a trip's
  life, mutated in place between `available`, `held` and `booked`. Carries
  `hold_token` (the holder's credential) and `hold_expires_at`.
- **`Ticket`** — `issued` → `used` or `cancelled`. Its id is the QR's payload.
- **`TicketEvent`** — append-only. Carries trip, seat, both stops and a
  timestamp, which is what makes occupancy computable without extra
  instrumentation.

## Testing posture

There is **no unit-test suite**. This was a deliberate decision for a prototype:
per-unit behaviour is verified by using the app, and the plan's per-unit items
are manual checks.

Two properties cannot be seen by clicking, so they are automated and are release
gates (`npm run test:concurrency`):

1. Parallel holds on one seat yield exactly one success.
2. Parallel scans of one QR yield exactly one pass.

Both fire 8 requests over **distinct database connections** against real
Postgres. Distinct connections matter: a single pooled client serializes
requests, and the gate would pass without proving anything.

## Known limitations

- **Authentication is prototype-grade** — one shared passcode per role, with
  per-IP attempt limiting. Not user accounts.
- **Passengers have no accounts.** The booking reference is the only way back to
  a ticket; lose it and the ticket is unrecoverable.
- **Scanning is online-only.** No connectivity means an explicit "could not
  verify" state, never a guessed verdict.
- **Alighting is taken from the booking, not an exit scan**, so a passenger who
  leaves early overcounts later segments.
- **No edit in network management** — only add and remove. Changing a fare means
  recreating the route.
- **The immutability trigger is a manual setup step** (`prisma/sql/`). Skipping
  it leaves the append-only guarantee silently absent.
