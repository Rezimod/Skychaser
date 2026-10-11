# Request to Darkview: an unattended capture operation

Draft for Rezi to send to Beka. Not filed anywhere yet.

## What Stellar needs

Once per clear night, Stellar/Stellar asks Node 01 to photograph **one** object
inside a time window, without a customer in a live session, and later fetches
the resulting frame and its capture metadata. One frame serves every holder of
that object's card — there is no per-customer queue on the Stellar side.

## Why the current contract can't do it

`contracts/openapi.yaml` exposes bookings (`/slots`, `/bookings`) and missions
(`/missions/{id}/start`, `/command`, `/events`) as customer flows behind a user
session, and `/captures/{id}` / `/download` for that customer's own captures.
There is no machine-to-machine operation for "take this photograph unattended on
a client's behalf", and the contract rightly says a missing operation is raised
here rather than invented on the client side. Stellar's `DarkviewAdapter.capture()`
therefore returns `retry` today.

## Proposed shape (for discussion — Darkview owns the design)

- **Client identity:** a service credential for a partner client (e.g. `stellar`),
  distinct from customer sessions and scoped to unattended capture only. No
  command capability, no live view.
- **`POST /partner/capture-orders`** — `{ observatoryId, targetSlug, windowStart,
  windowEnd, exposure?: { seconds, subs }, clientRef }` → `202 { orderId, state }`.
  Darkview schedules it into its own mission state machine (`REQUESTED →
  SCHEDULED → … → COMPLETE`), applies its own safety envelope, horizon mask,
  weather hold and operator rules, and may refuse (`NOT_VISIBLE`,
  `SAFETY_ENVELOPE_UNMEASURED`, `WEATHER_HOLD`, …) with a machine-readable reason.
- **`GET /partner/capture-orders/{orderId}`** — state, terminal reason, and on
  success the `captureId`.
- **Capture metadata** Stellar shows beneath the image: node, UTC capture time,
  target, exposure × subs, optical train, seeing/conditions if known, and
  `mode` (`SIMULATED` | `REAL`) so Stellar can label provenance honestly.
- **Download:** the existing `/captures/{captureId}/download`, authorised for the
  partner credential on captures it ordered.
- **Idempotency:** `clientRef` unique per client, so a retried order is the same order.
- Optional later: a webhook on terminal state instead of polling.

## What stays Darkview's

Scheduling, safety, weather decisions, operator overrides and pricing between the
two projects. Stellar only asks, waits, and shows what came back — labelled
`simulated` unless Darkview reports `REAL` mode with an online link.
