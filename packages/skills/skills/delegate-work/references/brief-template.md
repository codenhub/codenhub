# Brief template

A worker knows only what the brief says. Write it for a capable engineer who has
never seen this codebase and cannot ask questions. Omit sections that don't
apply to the role; never leave a placeholder in.

`--allow` and `--read` are passed as flags, not written in the brief. The worker
preamble is prepended automatically; don't repeat its rules here.

```
GOAL
One or two sentences: what must be true when the worker is done.

CONTEXT
What you already found: where the problem or feature lives, the cause if known,
relevant functions or types by name. Facts, not guesses. Mark any guess as one.

DECISIONS                                         (builder: required)
Everything already decided that the worker must follow: signatures, types,
file layout, names, error handling, dependencies allowed (normally none new).

ACCEPTANCE                                        (fixer: 1–2 sentences;
                                                   builder: list of cases)
- Concrete, checkable cases. For builder, each becomes a test.

QUESTION                                          (scout: required)
What to find out, and what form the answer should take
(list of files, short explanation, yes/no with evidence).

REVIEW CRITERIA                                   (reviewer: required)
What to judge the change against: the original acceptance list, conventions
to check, specific risks to look for. With --review <id>, the original brief
and the diff are appended for you; don't paste them.

OUT OF SCOPE
Nearby things the worker might be tempted to touch but must not.
```

## Example: fixer

```
GOAL
parseDate in src/validation.ts must return null for empty or whitespace-only
input instead of throwing.

CONTEXT
parseDate calls new Date(input).toISOString() without checking input; an empty
string produces an Invalid Date and toISOString throws. Callers already handle
null.

ACCEPTANCE
Empty and whitespace-only strings return null; existing tests still pass; one
test added for each case in src/validation.test.ts.

OUT OF SCOPE
parseTime has a similar issue; leave it.
```

## Example: builder

```
GOAL
Add a rate limiter module used by the API worker.

CONTEXT
Requests are handled in src/api/handler.ts. Limits come from env via
src/config.ts (read-only). KV binding RATE_KV already exists.

DECISIONS
- New file src/rates/limiter.ts exporting
  checkLimit(key: string, now: number): Promise<{ allowed: boolean; retryAfter: number }>
- Fixed window of 60 s; limit from config.rateLimitPerMinute.
- KV key format: `rl:${key}:${windowStart}`, TTL 120 s.
- No new dependencies. Do not wire it into handler.ts.

ACCEPTANCE
- First request in a window is allowed.
- Request number limit+1 in the same window is rejected with retryAfter > 0.
- A request in the next window is allowed again.
- Keys are isolated from each other.

OUT OF SCOPE
handler.ts wiring, config changes.
```
