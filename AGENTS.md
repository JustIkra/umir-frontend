# Repository instructions

## Shared development rules

- Read the project memory map before broad exploration. Keep developer commands and architecture in README.md.
- Direct source dependencies toward business rules. Define small ports at their consumer and assemble implementations explicitly.
- Inject time, IDs and external mechanisms. Use Europe/Moscow unless the contract specifies another zone.
- Keep contracts typed, validate business values, handle errors and preserve wrapped causes.
- Protect shared mutable data and give goroutines an owner, cancellation and completion.
- Keep fixtures and fault injection in tests/examples. Remove replaced code. Comment only non-obvious behavior.
- Preserve unrelated edits. Inspect status and both diffs; stage reviewed paths. Do not hide failures with exclusions or skipped tests.
- Use Conventional Commits. Mark incompatible behavior with ! or BREAKING CHANGE and document migration. No Co-Authored-By or generated-by footers.
- Use SemVer for public contracts. Before 1.0, compatible fixes increment patch; additions/breaking changes increment minor. Published versions/tags are immutable.
- Use annotated vX.Y.Z release tags. Nested published Go modules prefix the module directory; Go v2+ uses matching major module/import paths.
- Release repositories/modules independently. Umir images remain sha-<full-SHA>; factory pins exact component identities.
- Do not rewrite shared history or create/push releases without specific authorization.
- Record actual checks and limitations. Run git diff --check before handoff.

## Repository boundary

Frontend remains React/Vite. Go linters/modules do not apply. Business decisions belong to backend; UI presents contract states. Preserve frontend design rules; do not introduce an unrelated TypeScript migration or frontend test stack.

## Frontend verification

Use npm ci and npm run build, plus the existing container build. New UI behavior needs relevant rendered/browser checks. Instructions alone do not prove UI/API behavior.
