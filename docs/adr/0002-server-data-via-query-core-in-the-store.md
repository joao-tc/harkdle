# ADR-0002 — Server data goes through `@tanstack/query-core` inside the store layer; `ui/` reads only Zustand

**Status:** Accepted
**Date:** 2026-11-10

## Context

[ADR-0001](0001-stack-and-playback.md) lists TanStack Query for server data. Its hooks (`useQuery`) are React, and the layer rules say `src/spotify/` and `src/store/` import no React and `src/ui/` never imports `src/spotify/`. A component that calls `useQuery` would need a Spotify fetcher, so either `ui/` reaches into `spotify/` or fetchers are injected into components through a provider. The playlist item is the first real server data (playlist list, paginated items, a session cache).

## Decision

Server data is fetched with `@tanstack/query-core`'s `QueryClient.fetchQuery`, called from actions inside `src/store/`.

- Query's job is **in-flight de-duplication and a session cache**: `staleTime: Infinity`, `gcTime: Infinity`, `retry: false`. Retrying (for example on a 429) belongs to the Spotify client, not Query.
- The store copies each result into Zustand state, and that state is the only thing `ui/` reads. Components never see a `QueryClient`.
- `@tanstack/react-query` is not installed, and there is no `QueryClientProvider`.
- Logout calls `queryClient.clear()` so one account's data never reaches the next.

## Alternatives considered

| Alternative | Why not |
| ----------- | ------- |
| `@tanstack/react-query` hooks in `ui/` with fetchers injected from the composition root | Needs a provider and a new rule for how components receive fetchers, and bends invariant 3. Loading state would then live in two places (Query and Zustand). |
| Hand-rolled loading, error and cache state in Zustand with no Query | Re-implements de-duplication and caching and departs from ADR-0001's stack table. Cheapest today, but every later fetch repeats it. |
| `QueryObserver` subscriptions feeding Zustand | A bigger API surface and two sources of truth for the same data. `fetchQuery` plus a store write is enough for request/response data. |

## Consequences

**Good:** the layer graph and invariant 3 stay as they are. The store owns every screen's data, which suits the screen-as-state design (ADR-0001). Request de-duplication and caching are not re-implemented.

**Bad:** none of react-query's React conveniences (automatic refetch on focus, suspense, devtools). Anything like that has to be written deliberately in the store.

**Follow-ups:** future server data (none planned in v1) follows the same shape: a client in `spotify/`, a store action that calls `fetchQuery`, and plain store state for `ui/`.
