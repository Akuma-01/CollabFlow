# CollabFlow frontend

Next.js and React provide the project dashboard, task board, member list and
additions, and paginated Activity view. The shared API client coordinates session
refresh; the project synchronization coordinator uses authenticated WebSockets
and HTTP refetches to keep open projects current.

## Local development

From this directory:

```sh
cp .env.example .env.local
npm ci
npm run dev -- --port 3001
```

Set `NEXT_PUBLIC_API_URL=http://localhost:3000` in `.env.local`. Start the API using
the [repository setup](../README.md#setup), with
`FRONTEND_URL=http://localhost:3001`, then open `http://localhost:3001`. Use the
same hostname consistently so browser origins and cookie behavior match.

`NEXT_PUBLIC_API_URL` selects both HTTP and WebSocket endpoints. It is embedded
in a production build, so set the intended value before `npm run build`. Hosting
on Vercel and the corresponding Render settings are in the
[deployment guide](../backend/DEPLOYMENT.md#hosting-configuration).

## Verification and code map

Run `npm test` for API-client and synchronization unit tests and `npm run lint`
for lint checks. [TESTING.md](TESTING.md) describes the controlled Chromium suite,
the real two-browser collaboration suite, and their build requirements.

- [API client](lib/api.ts): authenticated requests, refresh coordination, and logout.
- [Synchronization coordinator](lib/project-sync.ts): subscriptions, refetching,
  pending-write reconciliation, and reconnects.
- [Project view](app/projects/[projectId]/ProjectClient.tsx): board, task forms,
  permissions, member list, and member additions.
- [Activity view](app/projects/[projectId]/ActivityPanel.tsx): event rendering,
  filters, pagination, and remote-change notices.

See the [engineering walkthrough](../ENGINEERING.md) for implementation evidence
and a demo sequence.
