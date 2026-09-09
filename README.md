# AI Adaptive English Reader

A reading app for English books that helps exactly where the reader gets stuck —
without breaking the flow of reading.

**Status:** product definition complete, implementation starting.

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

## Documentation

Written in Ukrainian, in `docs/`:

- `PROJECT.md` — product vision
- `REQUIREMENTS.md` — MVP scope and requirements
- `DECISIONS.md` — every significant decision, with its rationale and its cost
- `CURRENT_STATE.md` — where the project stands right now

## Roadmap

- [ ] EPUB parsing and reader UI
- [ ] Sentence translation with aligned highlighting
- [ ] Remaining formats: FB2, HTML, TXT, PDF
- [ ] Difficulty analysis and automatic highlighting
- [ ] Reading progress and user settings
