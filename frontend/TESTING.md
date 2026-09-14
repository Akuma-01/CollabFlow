# Frontend verification

Use Node.js 20.x. From the repository root:

```sh
npm --prefix frontend ci
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run test:e2e:install
npm --prefix frontend run test:e2e
```

`test:e2e` builds the production application, starts it on `127.0.0.1:3100`, and
runs Chromium tests. It shuts that server down afterward. The port must be free;
the runner never reuses a development server. Browser installation downloads
Chromium and may require administrator privileges for Linux system libraries.
Builds also need access to Google Fonts for the existing `next/font` setup.

Browser tests intercept the test API origin `http://127.0.0.1:4319` and return
controlled responses. No running backend, user account, or database is needed.
The production React components and shared API client run normally. These tests
verify UI behavior; they complement the [real PostgreSQL integration tests](../backend/TESTING.md).

The browser build uses a test API URL. Run a normal `npm --prefix frontend run build`
with your intended `NEXT_PUBLIC_API_URL` before deploying or starting the app for
development outside the test runner.

## Coverage

- API-client tests cover refresh coordination, retries, logout ordering, failures,
  and preservation of mutation bodies and cookies.
- Activity browser tests cover every project role, all event formats, saved names
  after deletion, expandable changes, and rendering text without interpreting HTML.
- Pagination uses the exact string cursor and current filter. Tests verify retries
  preserve loaded history and delayed responses cannot overwrite refreshed or
  filtered results. Access/session failures clear loaded history.
- Opening Activity after board changes reads fresh history. Switching views keeps
  unfinished task input. Member additions refresh an open feed and update counts.
- A narrow viewport and keyboard navigation check the new view's basic usability.

Run a focused browser test:

```sh
npm --prefix frontend run test:e2e -- --grep 'delayed'
```

Failure screenshots and traces are saved under `frontend/test-results/` (ignored
by Git). Open a trace with `npx playwright show-trace <trace.zip>` from `frontend`.
CI runs lint, API-client tests, and this production-build browser suite. Full
browser workflows against a live API and Firefox/WebKit coverage remain separate
work; the controlled responses do not test server authorization.

## Dependency maintenance

The Activity checkpoint updates Next.js and `eslint-config-next` to 16.3.5 and
refreshes compatible transitive dependencies. This includes the Next.js security
fixes described in the [maintainer advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4).
Use `npm --prefix frontend audit` to check the current lockfile against published
advisories; a clean audit is not a guarantee that all security issues are absent.
