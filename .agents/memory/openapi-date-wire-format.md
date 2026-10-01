---
name: OpenAPI date wire format
description: Keeps API responses aligned with date-only schemas after generated Zod validation.
---

For OpenAPI `format: date` fields, generated server-side Zod schemas may coerce strings into JavaScript `Date` objects. `res.json()` then emits full ISO timestamps, even though the API contract promises a date-only string. Normalize validated response dates back to `YYYY-MM-DD` before sending them.

**Why:** A client helper that treated the contract as a date-only string appended a time suffix to the timestamp and threw `RangeError: Invalid time value`, breaking the dashboard.

**How to apply:** Check every date-bearing response after Zod parsing; serialize its date fields explicitly as calendar-date strings, and keep UI date formatters tolerant of ISO timestamps from older responses.