# Public Production Archive contract

Phase 2A prepares the database/API boundary only. The production archive remains disabled until the separate activation SQL is deliberately run.

## Canonical production mapping

| Current `state.performance` field | Canonical source | Classification | Public API field |
| --- | --- | --- | --- |
| `id` | `productions.id` | B. internal | Not returned |
| `title` | `productions.title` | A. public canonical | `title` |
| `date` | `productions.performance_date` | A. public canonical | `performance_date` |
| `venue` | `productions.venue` | A. public canonical | `venue` |
| `venueInfo` | `productions.public_venue_info` | A. curated public | `public_venue_info` |
| `projectStartDate` | `productions.project_start_date` | A. public canonical | `project_start_date` |
| `status` | `productions.status` | A. public canonical | `status` |
| `parts` | `productions.parts` | A. public canonical | `parts` |
| `participants` | localStorage only | C. local-only legacy/private names | Not returned |
| `rehearsalAvailability` | `productions.public_rehearsal_summary` | A. curated public | `public_rehearsal_summary` |

`productions.venue_info` and `productions.rehearsal_availability` remain B (authenticated/internal) because they are unrestricted free text. The frontend must not copy them into public fields automatically. The JSON/localStorage production model remains C (legacy fallback) through Phase 2A and becomes deprecated only after the authenticated production editor uses Supabase canonically.

## Public identifiers

`tasks`, `events`, `rehearsal_logs`, and `rehearsal_log_images` receive independent `public_id` values. They are unique, immutable, generated for existing and new rows, and are never used for RLS or ownership decisions. Internal primary keys remain the only relational/authorization keys.

## Public RPC response shapes

- Production: slug, title, performance date, venue, curated venue information, project start date, status, parts, curated rehearsal summary.
- Task: public identifiers, part, title, deadline, status, priority, required/pre-show flags. Assignee is private.
- Event: public identifier, title, dates/times, category, part, curated location and description. Internal location/memo stay private.
- Rehearsal: public identifier, title, rehearsal date, editable author display name, category, content, tags, display-safe created/updated dates.
- Image metadata: public image/rehearsal identifiers and sort order only.

## Public rehearsal image delivery

Anonymous binary delivery uses the `public-rehearsal-image` Edge Function while
the `rehearsal-images` bucket remains private. The browser supplies only the
public production slug, rehearsal public ID, and image public ID. The function
checks the production opt-in flag and the complete production/rehearsal/image
relationship before resolving the private `storage_path` in its trusted server
context. It returns only an allowlisted image binary with a five-minute cache;
all invalid, private, or mismatched requests receive the same 404 response.

The RPCs return no production/member/profile/author/uploader UUIDs, raw Storage paths, filenames, account data, roles, or email addresses. Anonymous callers receive no direct base-table privileges.
