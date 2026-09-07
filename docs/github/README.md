# GitHub workflow

> **Status.** This repository has a complete local history — feature branches,
> conventional commits, and PR-shaped `--no-ff` merge commits into `main`. It has
> **not** been pushed, and no issues or pull requests exist on GitHub, because
> the environment this was built in had no GitHub credentials (`gh` was not
> installed and no `GITHUB_TOKEN` was present).
>
> Everything needed to create them is here. [`seed.sh`](seed.sh) creates the
> labels and issues in one command once you have authenticated.

## Pushing

```bash
gh auth login                     # or: export GITHUB_TOKEN=...
git remote add origin https://github.com/zain-ul-abideen-5036/RoleFit.git
git push -u origin main
git push origin --all             # feature branches, for the history
```

## Creating the labels and issues

```bash
cd docs/github
./seed.sh
```

The script is idempotent — re-running it will not duplicate labels or issues.

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
