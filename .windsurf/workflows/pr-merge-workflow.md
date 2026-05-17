---
description: Complete PR merge workflow with branch cleanup
---

# PR Merge Workflow

This workflow handles the complete process of creating a branch, committing changes, merging via PR, and cleaning up branches.

## Steps

1. **Stage and commit changes**

   ```bash
   git add <files>
   git commit -m "<commit message>"
   ```

2. **Push the branch**

   ```bash
   git push
   ```

3. **Create or check for existing PR**

   ```bash
   gh pr create --base main --title "<title>" --body "<description>"
   # If PR already exists, note the PR number
   ```

4. **Merge the PR**

   ```bash
   gh pr merge <pr-number> --merge
   ```

5. **Switch to main and pull latest**

   ```bash
   git checkout main
   git pull
   ```

6. **Delete the feature branch (local and remote)**
   ```bash
   git branch -d <branch-name>
   git push origin --delete <branch-name>
   ```

## Notes

- Pre-commit checks run automatically on push (configured in the repo)
- Always verify the PR exists before merging
- Use `--merge` flag for merge commits (preserves history)
- Confirm changes are on main after pulling
