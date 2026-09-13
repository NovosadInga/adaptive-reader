# How to find your way around

Two different things live in this project, and they answer different questions.
**These documents answer "why". The GitHub issues answer "what now".**
Looking for a justification, open a document. Looking for work, open an issue.

## The documents

| File | The question it answers | How often it changes |
|---|---|---|
| [PROJECT.md](PROJECT.md) | What we are building and why | Almost never |
| [REQUIREMENTS.md](REQUIREMENTS.md) | What the MVP has to do | Rarely |
| [DECISIONS.md](DECISIONS.md) | Why it was built this way, and what it cost | Appended to |
| [CURRENT_STATE.md](CURRENT_STATE.md) | Where we are right now | Every session |
| [../CLAUDE.md](../CLAUDE.md) | How to work in this repository | Occasionally |

You rarely need more than one of them:

- **starting a session** → `CURRENT_STATE.md`, and nothing else
- **"why is it done this way?"** → `DECISIONS.md`
- **"is this even in the MVP?"** → `REQUIREMENTS.md`
- **"have we lost sight of the point?"** → `PROJECT.md`

`DECISIONS.md` is the longest file, but it is **not meant to be read top to
bottom**. It is a reference: you see `D17` mentioned somewhere and go read that
one section.

### Every decision states its price

```
Decision.  What was decided.
Why.       The problem it solves.
Price.     What we give up for it.
```

The price is always there on purpose. A decision without a stated price is
self-deception — something is being paid either way, and it is better to know
in advance than to be surprised in a month.

## The reference codes

Short codes are scattered through the documents and the issues. They are what
ties everything together.

| Code | Meaning | Where it lives |
|---|---|---|
| `R1`…`R8` | A requirement — what the product must do | `REQUIREMENTS.md` |
| `D1`, `D2`, … | A decision — why it is built this way | `DECISIONS.md` (index at the top) |
| `O2`…`O9` | An open question — not decided yet | `CURRENT_STATE.md` |
| `#14` | A GitHub issue | GitHub |

**How this reads in practice.** Issue #16 says `Covers R2, R3` and refers to
`D4`. That means: it satisfies requirements R2 and R3 in `REQUIREMENTS.md`, and
it is constrained by decision D4 in `DECISIONS.md` — "the phone must not hold
the whole book in memory".

So an issue **deliberately does not explain itself** — it points. Otherwise the
reasoning would have to be copied into every task, and the copies would drift
apart.

## The issues

Three levels. Counts drift every session, so `gh issue list` is the only
source for them — this file does not repeat numbers.

**Milestones — when.** Four of them, in working order: Phase 1 — Vertical
slice → Phase 2 — MVP → Phase 3 — Public demo → Phase 4 — Post-MVP.

**Epics — the map.** Seven issues labelled `epic`, one per major line of work:
book formats, API and storage, reader UI, the main interaction, reader state,
public demo, automatic highlighting. An epic is never worked on directly — it
groups.

**Tasks — the actual work.** Each one is sized to a single short session:
one task = one branch = one pull request.

### Labels

Where the work happens (D24) — the same split as the branch and commit prefixes:

- `backend` — parsers, API, storage, the server side of the AI hints
- `frontend` — reader UI, selection, the hint popup
- `docs` — documentation
- `infra` — deployment, environment

What kind of work it is:

- `design` — how it looks and feels, decided before it is built (D27)
- `research` — find something out before writing code; every open question
  (`O`) is one of these
- `blocked` — an unresolved dependency, do not start
- `post-MVP` — deliberately after the MVP success criterion
- `epic` — a grouping issue, never worked on directly
- `accessibility` — a barrier for people with disabilities

`design` cuts across `frontend` rather than replacing it: a task can be both
designed and built, and most reader tasks are.

## Commands

`gh issue list` shows **only 30 rows by default**, and there are more issues
than that, so always pass `--limit 50` or work will silently disappear from
the list.

```bash
# What should I work on?
gh issue list --milestone "Phase 1 — Vertical slice" --limit 50

# The map of the project
gh issue list --label epic --limit 50

# What can I start right now
gh issue list --milestone "Phase 1 — Vertical slice" --limit 50 | grep -v blocked

# Read one task
gh issue view 14
```

Or read them in the browser, which is easier:
<https://github.com/NovosadInga/adaptive-reader/issues>

## Working rules

No commits go straight to `main`. Each task gets its own short branch
(`backend/…`, `frontend/…`, `docs/…`) and lands through a pull request (D21).

Pull request and commit titles start with the area they touch, and that prefix
describes **the change, not the branch** — a commit sitting on a `backend/…`
branch that only edits documentation is prefixed `docs/` (D24).

One pull request covers one topic; a side fix noticed on the way gets its own
branch (D29). Every pull request is reviewed twice — by the local
`code-reviewer` agent via `/review-pr` before push, and by Claude Code Review
on GitHub after it is opened — and its description explains the change in
full, per `.github/pull_request_template.md` (D28). Neither reviewer blocks a
merge; the author decides.

The repository is public (D8). Code, code comments, commits, pull requests,
issues and the root `README.md` are in English; `docs/` and `.claude/` stay
in Ukrainian until a separate translation PR (D23). Conversation with the
author is in Ukrainian.

The product is for someone reading in English, whatever their first language.
The language of the hints is a request parameter with Ukrainian as its default,
not a property of the product (D25).

## Agents and skills

Every file in `.claude/` states its `model` and `effort` in the frontmatter,
with a comment saying why (D26). Nothing inherits the session model by default,
because running everything on the most expensive model is a real cost with no
matching benefit. The files themselves are the source for which model each one
uses; D26 records the reasoning.

The rule when adding a new one: name the reason out loud. A cheaper model
unless the work is genuinely hard, and effort matched to how open-ended the
task is, not raised by reflex.
