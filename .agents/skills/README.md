# Workspace Skills

This directory contains workspace-specific skills for AI agents.

## Directory Structure

Each skill must reside in its own subdirectory inside `skills/`:

```text
.agents/skills/<skill-name>/
├── SKILL.md          # Required: Main instruction file with YAML frontmatter
├── scripts/          # Optional: Helper scripts and utilities
├── examples/         # Optional: Reference implementations
├── resources/        # Optional: Templates and assets
└── references/       # Optional: In-depth technical documentation
```

## `SKILL.md` Specification

Every skill must have a `SKILL.md` starting with YAML frontmatter:

```markdown
---
name: skill-name
description: >-
  Third-person explanation of what this skill does and when the agent should use it.
---

# Skill Title

Step-by-step instructions and runbooks for the agent.
```
