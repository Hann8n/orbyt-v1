---
description: Create branch, commit staged changes, open PR, merge, and clean up
---

# PR Merge Workflow

## Preconditions

Before starting, run:

```bash
git branch --show-current
git status
```

- If on `main`: proceed to Step 1 to create a new branch
- If on any other branch: skip Step 1 and Step 2 — use the current branch as-is, proceed directly to Step 3
- `git status` must show modified or untracked files; if the working tree is clean, stop and tell the user there is nothing to commit

---

## Step 1 — Derive the branch name

Run:

```bash
git diff --name-only
git status --short
```

**Determine the type** using this precedence order (pick the first that applies):

1. `feat` — any new file added, or a new user-facing capability
2. `fix` — corrects a bug or broken behaviour in an existing file
3. `refactor` — restructures existing code without changing behaviour
4. `perf` — measurable performance improvement
5. `test` — adds or updates tests only
6. `style` — formatting, whitespace, or visual-only changes
7. `docs` — documentation files only
8. `build` — dependency or build config changes
9. `ci` — CI/CD config changes only
10. `chore` — everything else (cleanup, tooling, config)

**Derive the description** from the changed filenames:

- Strip directory paths and file extensions
- Keep the 2–3 most meaningful words
- Join with `-`, all lowercase
- Max 30 characters

Construct the branch name: `<type>/<description>`

Examples:

- Changes to `src/components/FeedPager.tsx` adding a feature → `feat/feed-pager`
- Changes to `src/services/ProfileService.ts` fixing a bug → `fix/profile-service`

---

## Step 2 — Create the branch

```bash
git checkout -b <type>/<description>
```

Verify:

```bash
git branch --show-current   # must output the new branch name
```

---

## Step 3 — Stage and commit

Stage the relevant files by name (never use `git add .` or `git add -A`):

```bash
git add <file1> <file2> ...
```

Commit using the same type as the branch:

```bash
git commit -m "<type>: <short description of what changed>"
```

The commit message type must match the branch type prefix. The pre-commit hook runs lint-staged automatically.

**If the pre-commit hook fails:**

- Display the full error output to the user exactly as printed
- Stop the workflow immediately — do not attempt to fix the code
- Tell the user: "The pre-commit hook failed. Here is the output: [paste error]. Please fix the issue and re-run the workflow."

Do not proceed to Step 4 until the commit succeeds.

Verify:

```bash
git log --oneline -1   # should show the new commit
```

---

## Step 4 — Push the branch

```bash
git push -u origin HEAD
```

Verify:

```bash
git status   # should show "Your branch is up to date with 'origin/<branch>'"
```

---

## Step 5 — Open a PR (or find the existing one)

First check if a PR already exists:

```bash
gh pr list --head $(git branch --show-current)
```

If a PR is returned, note the number and skip to Step 6.

If no PR exists, create one:

```bash
gh pr create --base main --title "<type>: <description>" --fill
```

`--fill` populates the body from the commit message. Note the PR number from the output.

---

## Step 6 — Merge the PR

```bash
gh pr merge --merge --delete-branch
```

This merges using a merge commit (preserves history) and deletes the remote branch.

Verify:

```bash
gh pr view --json state --jq '.state'   # should output "MERGED"
```

---

## Step 7 — Clean up locally

```bash
git checkout main
git pull --prune
git branch -d <branch-name>
```

`--prune` removes the stale remote-tracking ref for the deleted branch.

Verify:

```bash
git branch --show-current   # must output "main"
git log --oneline -1        # should show the merge commit
```
