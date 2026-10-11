# Repository instructions

Read [README.md](README.md) before changing the stack, architecture, commands or CI. Keep setup and architecture documentation there; record changes under «Не выпущено» in [CHANGELOG.md](CHANGELOG.md). Preserve unrelated work and inspect the final diff. Do not commit, push, publish or rewrite shared history without an explicit request.

## Architecture and ownership

- Keep dependencies within the five layers and their allowed directions documented in README. Run `npm run arch`; do not add suppressions to bypass a boundary.
- Production source under `src` must use `.ts` or `.tsx`. Keep type-only imports and `@/` aliases within the same layer rules. Inline ESLint disables are prohibited.
- Keep `domain` framework-independent. Put external mechanisms behind small ports owned by application consumers and assemble adapters in `app`.
- Inject time, IDs, network and storage mechanisms into domain/application. Presentation must not call `fetch` (including `window.fetch`) or browser storage directly.
- Backend owns availability, FEFO, expiration and order decisions. Frontend presents gateway outcomes and does not reproduce business rules.
- Keep test fixtures outside production source. Do not import test support into production code.
- Use Europe/Moscow for displayed and entered times unless a contract specifies otherwise. Preserve established responsive breakpoints, relative sizing, design tokens and accessibility.

## Checks and API behavior

- Use `npm ci` for dependencies and the pinned Bun version from `.bun-version` for tests. Run `npm run check` before handoff; CI also builds the existing container.
- Do not claim checks passed unless they were run. `npm run quality:test` checks `tests/quality`; `npm run test` runs the complete `tests` suite. Both use Bun, and test preload verifies its exact version.
- If API types are generated, tie them to the exact approved OpenAPI commit and `info.version`, and check generated files in CI.
- Validate network JSON at runtime and exhaustively handle known `kind/type` variants. Preserve integer strings or use `BigInt`; never assume TypeScript string types make numeric conversion safe.
- Unknown or malformed command results and `ConfirmationPending` are not success or proof of non-commit. Preserve the original attempt and `commandID`; do not retry with a new ID.
- Future browser acceptance first uses frontend → gateway → HTTP mocks. Real-service acceptance is a separate check. Build success does not prove UI behavior.
- Import React and libraries through documented public exports. Avoid redundant derived state and effects; run independent requests in parallel. Split feature modules when real screens establish useful boundaries.

Public HTTP fields and outcomes belong in the factory OpenAPI; business rules belong in the factory business-core specification. Follow [README.md](README.md) for the current stack and developer commands.
