# Contributing

Thanks for wanting to improve these rules. This pack is **judgment, not reference** — that distinction drives most of what follows.

## What belongs here

A good rule tells an agent **which option to pick** when the official docs present several, and **why**. The official documentation already covers what the APIs are; duplicating it here only creates a second copy to keep in sync.

Add a rule when:

- The docs show multiple valid approaches and one is a better default.
- A pattern is a common source of bugs (N+1 queries, unthreaded transactions, missing authorization).
- Training data skews toward an outdated API that no longer runs on v7 — these go in `rules/version-traps.md`.

Skip a rule when it is a bare API listing, a matter of taste with no defect behind it, or something the framework already enforces at compile time.

## Scope

**This pack targets AdonisJS v7 only** — `@adonisjs/core` 7.x · `@adonisjs/lucid` 22.x · `@vinejs/vine` 4.x · `@adonisjs/bouncer` 4.x · `@adonisjs/auth` 10.x.

v5 and v6 appear solely as recognition tables in `rules/version-traps.md`, so an agent can spot the outdated API it is about to write. Do not add "if you're on v6, do X instead" branching to the other rule files.

## Verifying a change

Every code sample must be checked against the official v7 documentation before it lands. Cite what you checked in the pull request.

```bash
# Search the vendored snapshot
grep -n "withAuthFinder" skills/adonisjs-best-practices/references/llms-full.txt

# Or fetch a live page as Markdown — authoritative, and never stale
curl -sSL https://docs.adonisjs.com/guides/basics/validation.md
```

Prefer the live URLs for anything version-sensitive; the snapshot is a point-in-time copy. Note that a few official pages still show pre-Lucid-22 model syntax (hand-declared `@column()` fields on `BaseModel`) — `rules/lucid-models.md` explains why that is not the pattern to copy.

## Writing style

The reader is an agent under context pressure, not a human browsing a tutorial.

- Lead with the rule. Then the reason. Then the example.
- Show the correct code. Show the wrong code only when an agent is likely to write it by reflex, and label it clearly.
- Give the **why** — an agent that understands the reason generalizes to cases you did not enumerate.
- Be concrete and brief. Cut anything that does not change what the agent writes.
- Say "consistency beats correctness-in-the-abstract" where it applies: these are defaults for when no pattern exists yet, not license to refactor someone's project mid-task.

## Adding a rule file

1. Create `skills/adonisjs-best-practices/rules/<topic>.md`.
2. Add a row to the **Rule Index** table in `SKILL.md` — an unindexed rule file is never read.
3. Add a row to the rule table in `README.md`.
4. Add an entry to `llms.txt` under the right section.

Steps 2–4 are what make the file reachable. The linter checks links, not completeness, so it will not catch a rule you forgot to index.

## Before opening a pull request

```bash
node scripts/lint.mjs
```

This validates the plugin manifests, the `SKILL.md` frontmatter, and every relative Markdown link. CI runs the same command.

If you bump the version, change it in **both** `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` — the linter fails when they disagree — and add a `CHANGELOG.md` entry.

## Refreshing the vendored docs

```bash
cd skills/adonisjs-best-practices/references
curl -sSL https://docs.adonisjs.com/llms.txt      -o llms.txt
curl -sSL https://docs.adonisjs.com/llms-full.txt -o llms-full.txt
```

Update the snapshot date and package versions in that directory's `README.md`, and re-check the rules against anything that changed upstream.

## License

Contributions are made under the MIT license. The files in `skills/adonisjs-best-practices/references/` are verbatim upstream AdonisJS documentation — do not edit them by hand.
