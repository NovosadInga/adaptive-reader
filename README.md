# AI Adaptive English Reader

A reading app for English books that helps exactly where the reader gets stuck —
without breaking the flow of reading.

**Status:** vertical slice in progress. EPUB parsing is done and verified on
real books; the HTTP layer and the reader UI are next.

## The problem

Real books are usually harder than the reader's English level. A dictionary gives an
abstract definition of a word, not its meaning in this particular sentence — and
reaching for a translator every few lines destroys the reading experience.

## The core interaction

The whole product is built around one interaction:

1. You hit a word or phrase you don't understand.
2. You select it.
3. You see the **whole sentence** translated, with the part matching your selection
   highlighted.
4. You keep reading.

The reader gets both the meaning and the context at once, and never has to choose
what kind of help to ask for.

Example: in *He was charged with murder*, `be charged with` is explained as a unit —
not as the word "charge".

## Approach

Formats are an input, not a display method. EPUB, FB2, HTML, TXT and PDF are each
parsed into one internal book representation; the reader and the AI layer only ever
see that.

Automatic highlighting of difficult passages exists, but is deliberately
**secondary**: the core interaction needs no prior analysis of the text, so the main
feature does not depend on the riskiest part of the system.

## Stack

React + Vite + TypeScript · Node + Fastify + TypeScript · PostgreSQL · Anthropic API

## How the work is done

The code is written by a coding agent (Claude Code) and directed, reviewed and
merged by the author. That shapes the process more than the stack does:

- Every task is one issue, one short branch and one pull request. `main` only
  changes through a pull request.
- Every pull request is reviewed twice, independently of the session that wrote
  it: by a local reviewer agent before the push, and by Claude Code Review on
  GitHub after the PR opens. Neither blocks the merge; the author decides.
- Every significant decision is recorded with its reasoning and its cost in
  `docs/DECISIONS.md`. The history is meant to be read, not just the code.
- Claude Code hooks (`.claude/settings.json`) run the API typecheck and tests
  after every `.ts` edit, and once more before the agent ends a turn, giving
  it one chance to fix red code before finishing. They need `jq` on the
  machine; without it they report themselves skipped rather than failing
  silently.
- Secrets never enter the repository: API keys live in environment variables on
  the server, GitHub tokens in repository secrets, and both the local tooling
  and GitHub's push protection are configured to refuse them.

## Documentation

Written in Ukrainian, in `docs/`:

- `README.md` — how the documents, issues and conventions fit together
- `PROJECT.md` — product vision
- `REQUIREMENTS.md` — MVP scope and requirements
- `DECISIONS.md` — every significant decision, with its rationale and its cost
- `CURRENT_STATE.md` — where the project stands right now

The backlog lives in GitHub Issues: epics, one-session tasks and milestones.

## Roadmap

- [x] EPUB parsing into the shared book representation
- [ ] HTTP API and reader UI
- [ ] Sentence translation with aligned highlighting
- [ ] Remaining formats: FB2, HTML, TXT, PDF
- [ ] Difficulty analysis and automatic highlighting
- [ ] Reading progress and user settings
