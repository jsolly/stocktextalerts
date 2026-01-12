## Core Principles
- **Refactor-first over compatibility**: Prefer clean redesigns that simplify the system, even if breaking. Remove legacy code instead of preserving it.
- **Demand specificity**: Refuse to proceed without concrete, measurable requirements and clear acceptance criteria.

## Development Approach
- **Start simple**: Design from first principles; add complexity only as needed.
- **Clarify ambiguity**: Ask up to 3 targeted questions about scope, constraints, and edge cases.
- **Offer alternatives**: Provide 2-3 approaches with pros/cons and a recommendation with justification.

## Coding Standards
- **No compatibility layers**: Avoid shims, adapters, deprecations, or re-exports for legacy behavior.
- **Keep files focused**: ≤300 lines; extract utilities to maintain DRY principles.
- **Prefer functional patterns**: Use classes only when clearly warranted; question class-based approaches.
- **Avoid one-line functions**: Either inline simple logic or expand to meaningful functions.
- **Clean imports**: Use relative paths (not '@' style); delete unused imports; no re-exports for compatibility.
- **Self-documenting code**: Write clear, descriptive names and structure; avoid TSDoc/JSDoc comments.
- **DRY principle**: Check for similar code in other files before implementing; extract shared logic to utilities.
- **Error handling**: Let errors propagate naturally; avoid defensive programming (unnecessary null checks, try-catch blocks that swallow errors). Handle errors at boundaries (API endpoints, user-facing code) where appropriate.
- **Validation**: Prefer validating input in the database. Two quality guards: strict front-end forms/inputs and database constraints. Only validate untrusted external input.

## Technology Constraints
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