# Project activity API

This checkpoint records `PROJECT_CREATED` and `PROJECT_UPDATED` (project rename).
Task and membership events and the frontend feed will follow in separate
checkpoints. Existing history is not backfilled.

## Reading history

```http
GET /projects/:projectId/activity?limit=20&before=42&action=PROJECT_UPDATED
```

All current project roles can read history. Outsiders and removed members receive
403; missing authentication receives 401. The SQL query also checks current access
so a membership change between middleware and query execution cannot expose rows.
There are no endpoints for clients to create, edit, or delete activity records.

Query parameters are optional:

| Parameter | Meaning |
| --- | --- |
| `limit` | Page size, 1–100; defaults to 20 |
| `before` | Return events with a lower ID than this positive bigint cursor |
| `action` | Filter by `PROJECT_CREATED` or `PROJECT_UPDATED` |

Unknown parameters, duplicate parameters, invalid action values, and out-of-range
limits/cursors return 400. Responses use `Cache-Control: no-store`.

```json
{
  "success": true,
  "data": [{
    "id": "42",
    "project_id": 7,
    "actor_id": 3,
    "actor_name": "Alice",
    "action": "PROJECT_UPDATED",
    "entity_type": "project",
    "entity_id": 7,
    "metadata": {
      "from": { "title": "Prototype" },
      "to": { "title": "Release" }
    },
    "created_at": "2026-09-13T12:00:00.000Z"
  }],
  "nextCursor": null
}
```

IDs and cursors remain decimal strings to preserve BIGSERIAL precision. Results
are ordered by descending ID. When more matching rows exist, `nextCursor` is the
last returned ID; otherwise it is null. Keep the same filter on subsequent pages.
New records arriving after page one do not shift older pages. Refresh without a
cursor to see newer records. An empty history returns `data: []` and a null cursor.

## Transaction and retention rules

Project creation/renaming and the corresponding log insert use the same checked-out
PostgreSQL client and transaction. An insert failure rolls back the project write.
Renames lock the project row before checking ownership and reading its old title,
so concurrent renames form an accurate transition chain. Requests that repeat the
current title succeed without adding a duplicate event. Rejected requests add no
history. Metadata is selected by the service, not copied from the request body.

Actor names are snapshots at the time of the action. Deleting an actor sets its
reference to null while retaining the name; deleting a project cascades to its
history. This is project history, not a tamper-evident compliance archive: database
administrators can change records, and project deletion does not retain a deletion
event elsewhere.

Apply [migration 002](migrations/002_activity_logs.sql) before starting this API
version on an existing database. It adds the activity table and project/cursor and
project/action/cursor indexes without modifying existing application records.
