## Core Principles
- **Refactor-first over compatibility**: Prefer clean redesigns that simplify the system, even if breaking. Remove legacy code instead of preserving it.
- **Demand specificity**: Refuse to proceed without concrete, measurable requirements and clear acceptance criteria.

## Development Approach
- **Start simple**: Design from first principles; add complexity only as needed.
- **Clarify ambiguity**: Ask up to 3 targeted questions about scope, constraints, and edge cases.
- **Offer alternatives**: Provide 2-3 approaches with pros/cons and a recommendation with justification.
- **Database migrations**: Do NOT create new migration files. Only modify the initial migration in `supabase/migrations`. This is a new app with no users, so destructive schema changes are OK.

## Coding Standards
- **No compatibility layers**: Avoid shims, adapters, deprecations, or re-exports for legacy behavior.
- **Keep files focused**: ≤300 lines; extract utilities to maintain DRY principles.
- **Prefer functional patterns**: Use classes only when clearly warranted; question class-based approaches.
- **Avoid one-line functions**: Either inline simple logic or expand to meaningful functions.
- **Clean imports**: Use relative paths (not '@' style); delete unused imports; no re-exports for compatibility.
- **Self-documenting code**: Write clear, descriptive names and structure; avoid TSDoc/JSDoc comments.
- **DRY principle**: Check for similar code in other files before implementing; extract shared logic to utilities.
- **Error handling**: Let errors propagate naturally; avoid defensive programming (unnecessary null checks, try-catch blocks that swallow errors). Handle errors at boundaries (API endpoints, user-facing code) where appropriate.
- **Avoid fallbacks in error scenarios**: Don't use fallbacks or default values when encountering unexpected conditions or errors. Fail fast and explicitly. It's better to discover issues early than to have fault-tolerant code that masks problems.
- **Log unexpected redirects**: When a user is redirected due to an error or unexpected condition, log the error with context (user ID, path, reason) to help diagnose issues in production.
- **Validation**: Minimize trimming/normalization. Rely on strict front-end forms/inputs to produce valid data, then validate/enforce correctness in the database (constraints). Only validate untrusted external input.
- **Timing hacks**: Avoid setTimeout, nextTick, requestAnimationFrame, and similar timing workarounds. These are usually signs of race conditions or architectural issues. Fix the root cause instead of adding delays.

## Tech Stack
- **Testing**: Vitest only; happy path coverage only. Do not use Jest.
- **Linting/Formatting**: Biome only (No Prettier or ESLint)
- **Styling**: Tailwind utilities preferred over custom CSS

## Export Pattern
- Functions: `export function name(...)` directly where defined
- Classes: Define first, then `export { ClassName }` at bottom

## Section Comments
```txt
/* =============
Comment Title
============= */
```