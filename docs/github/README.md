# GitHub workflow

> **Status.** Published to
> [zain-ul-abideen-5036/RoleFit](https://github.com/zain-ul-abideen-5036/RoleFit).
> The full local history is on `main` — feature branches, conventional commits
> and PR-shaped `--no-ff` merge commits — along with all branches, 11 labels and
> 18 issues.
>
> **On pull requests.** The five branches that built the platform were merged
> locally before the repository had credentials, so GitHub refuses a retroactive
> PR for them: `No commits between main and feature/core-platform`. Rather than
> manufacture changes to force a diff, the merge commits on `main` are left as
> the record of that work, and each delivered issue was closed with a comment
> citing the merge commit that delivered it. Work from here uses the full
> branch → PR → review → merge flow.

## Cloning

```bash
gh repo clone zain-ul-abideen-5036/RoleFit
```

## Re-seeding labels and issues

Already applied to the repository. The script is idempotent, so re-running it
updates the labels and skips any issue whose exact title already exists — useful
when forking the project or restoring a label someone deleted.

```bash
cd docs/github
./seed.sh
```

## Branching model

`main` is protected and always deployable. Work happens on a branch named for
what it does, and merges through a pull request with `--no-ff` so the branch
point stays visible in history.

```
feature/<what-it-does>     new capability
fix/<what-broke>           defect
refactor/<what-moved>      no behaviour change
docs/<what-is-documented>  documentation only
chore/<what-maintenance>   tooling, dependencies
```

## Commits

Conventional commits. The subject says what changed; the body says **why**, and
names any decision a reader would otherwise have to reverse-engineer.

```
feat: add resume parsing pipeline
fix: prevent unauthorized resume access
test: add optimization workflow coverage
refactor: isolate AI provider layer
docs: add deployment documentation
chore: normalize line endings
```

Not: `update`, `changes`, `final`, `wip`, `test`.

## Pull requests

Every PR carries the sections in [`pull-request-template.md`](pull-request-template.md):
summary, changes, testing, screenshots for UI, security considerations, and
deployment notes.

CI must be green. The `ci` job aggregates every other job, so branch protection
needs one required check rather than an entry per job.

## Labels

| Label           | Colour    | Use                                    |
| --------------- | --------- | -------------------------------------- |
| `feature`       | `#0E8A16` | New capability                         |
| `bug`           | `#D73A4A` | Something is broken                    |
| `enhancement`   | `#A2EEEF` | Improves something that works          |
| `security`      | `#B60205` | Security-relevant                      |
| `frontend`      | `#5319E7` | UI and design system                   |
| `backend`       | `#1D76DB` | Services, API, data                    |
| `ai`            | `#FBCA04` | Model layer, prompts, anti-fabrication |
| `database`      | `#006B75` | Schema and migrations                  |
| `devops`        | `#C2E0C6` | CI, deployment, infrastructure         |
| `testing`       | `#BFD4F2` | Test coverage                          |
| `documentation` | `#0075CA` | Docs only                              |
