# OpenSearch Contributing & Engineering Standards

## 1. Core Principles

1. **Modular Boundaries**: Workspaces (`apps/`, `packages/`) have strictly defined responsibilities.
   - `packages/shared` should not depend on other packages.
   - `packages/crawler`, `packages/indexer`, and `packages/storage` interact through defined interfaces.
   - `apps/api` coordinates retrieval, ranking, and search endpoints.
   - `apps/web` is a client interface with zero direct crawler/storage access.
2. **Phase Adherence**: Never implement functionality belonging to future phases prematurely. Always respect the sequence in `PHASE.txt`.
3. **Zero-Cost Design**: Do not introduce dependencies on paid third-party APIs or infrastructure.
4. **Privacy-First**: No tracking cookies, user profiling, or unnecessary personal data retention.

## 2. Code Style & Tooling

- **TypeScript**: Strict mode enabled (`strict: true`, `noUncheckedIndexedAccess: true`). Explicit types for public APIs.
- **Formatting**: Format code using `npm run format` (Prettier).
- **Linting**: All code must pass `npm run lint` (ESLint flat config).
- **Imports**: Use ECMAScript Modules (`import ... from '...'`) with `.js` extensions for local TypeScript imports adhering to `NodeNext` resolution.

## 3. Testing Requirements

- Every package and service must have corresponding tests under a `tests/` directory or co-located `.test.ts` files.
- Run tests via `npm run test` (Vitest).
- All tests must pass before submitting or completing a phase.

## 4. Git & Commit Guidelines

- **No Secrets**: Never commit `.env` or sensitive credentials.
- Keep commits focused on single phase deliverables or self-contained logical changes.
- Ensure every phase leaves the repository in a clean, passing state (`npm run verify:phase1`).
