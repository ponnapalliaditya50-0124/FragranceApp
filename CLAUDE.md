# CLAUDE.md — Maison d'Aura Frontend

## Commands
- Install: `/opt/homebrew/bin/npm install` (from `Antigravity - Fragrance App/`)
- Test: `/opt/homebrew/bin/npx jest --coverage`
- Serve: open `index.html` with Live Server (VS Code) or `python3 -m http.server` from `Antigravity - Fragrance App/`

## Architecture
- Vanilla JavaScript SPA (no framework, no build step)
- `app.js` (5K lines) — monolith: wizard UI, results rendering, state management, auth flows
- `logic.js` — OlfactoryEngine: local fallback recommendation scoring
- `data.js` — API client: all backend calls via `requestApiJson()`
- `config.js` — backend URL (`http://localhost:3001/api`)
- `logger.js` — structured logging utility with configurable levels
- Backend runs on port 3001 (Spring Boot)

## Unit Test Requirements
- **Minimum coverage: 95% line, 90% branch on logic.js** (currently 100%/96.5%)
- All scoring logic in `OlfactoryEngine` must have tests covering:
  - Each scoring dimension (families, notes, accords, occasions, climate, performance, budget)
  - Null/missing field safety (null notes, null occasionTags, null seasonTags)
  - Scent description keyword matching
  - Usage description keyword matching
  - Favorites profile bonuses
  - Async paths (fallback catalog, API failure recovery)
- Data integrity tests must verify the fragrance data contract (required fields, array types, null guards)
- New pure-logic functions extracted from `app.js` must have corresponding test files
- Run `/opt/homebrew/bin/npx jest --coverage` before committing — all tests must pass
- Test files go in `tests/` directory, named `*.test.js`

## Logging Requirements
- Use `Logger` from `js/logger.js` (not raw `console.log`)
- Default level is `warn` — only warn and error show in production
- Set `Logger.setLevel('debug')` during development for full output
- Format: `Logger.info('component', 'message', optionalData)`
- Required instrumentation points:
  - Catalog load: count loaded, source (backend vs fallback)
  - API errors: endpoint, status, elapsed time
  - Render pipeline: pool size, visible count, active refine option
  - Recommendation workflow: payload summary
  - State persistence: success/failure

## Key Conventions
- All tag arrays (`occasionTags`, `seasonTags`, `noteFamilies`, `accordTags`) may be null — always guard with `|| []`
- Notes object may be null — always use optional chaining: `fragrance.notes?.top || []`
- Catalog limit is 25000 (not 5000) to load all backend records
- Module exports use `if (typeof module !== 'undefined')` guard for Node.js/Jest compatibility
- System npm is broken — always use `/opt/homebrew/bin/npm` or `/opt/homebrew/bin/npx`
