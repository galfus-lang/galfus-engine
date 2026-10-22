---
name: create-pull-request
description: Draft a pull request title and body by comparing the current git branch against a user-specified base branch following the repository PR template.
---

# Create Pull Request Skill

Use this skill to draft a Pull Request (PR) title and description for changes on the current git branch compared against a target base branch.

## Workflow

1. **Identify Target Base Branch**:
   - Ask the user which base branch to compare against (e.g., `main`, `master`, `dev`) if it has not been specified.
2. **Gather Git Information**:
   - Determine current branch: `git branch --show-current`.
   - Inspect commits: `git log <target_branch>..HEAD --oneline`.
   - Inspect detailed diff summary: `git diff <target_branch>...HEAD --stat`.
3. **Generate PR Title**:
   - Formulate a clear, concise title following conventional commit standards (e.g., `feat(parser): ...`, `fix(cli): ...`, `docs: ...`).
4. **Generate PR Body**:
   - Fill out the PR template structure completely based on analyzed changes.

---

## PR Template Structure

```markdown
## Summary

- What changed?
- Why was it needed?

## Linked Issues

- Closes #

## Change Type

- [ ] `changelog:breaking`
- [ ] `changelog:feature`
- [ ] `changelog:fix`
- [ ] `changelog:refactor`
- [ ] `changelog:performance`
- [ ] `changelog:docs`
- [ ] `changelog:internal` (exclude from public changelog)

## User-facing Changelog Note

- 1-2 lines in release-note style

## Risks / Rollback

- Main risks:
- Rollback plan:
```

## Section Details

- **Summary**: Summarize changes and reason for implementation in concise bullet points.
- **Linked Issues**: Include linked issues (e.g. `Closes #123`). If no issue is provided or linked, set this field to `Closes None`.
- **Change Type**: Check (`[x]`) the appropriate label (`changelog:feature`, `changelog:fix`, `changelog:refactor`, etc.).
- **User-facing Changelog Note**: Write 1-2 sentences summarizing the change for release notes.
- **Risks / Rollback**: Note potential risks and standard rollback strategy.
