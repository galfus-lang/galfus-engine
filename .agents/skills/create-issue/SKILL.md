---
name: create-issue
description: Draft a Bug Report, Feature Request, or Support issue using the Galfus issue templates and triage conventions.
---

# Create Issue

Use this skill to prepare a ready-to-submit GitHub issue for a Galfus repository. Draft the issue unless the user explicitly asks to create it remotely and the required GitHub access is available.

## Workflow

1. Classify the request as a bug, feature, or support question. Infer the type when it is clear; otherwise ask the user to choose.
2. Read the matching local template: [Bug Report](references/bug_report.yml), [Feature Request](references/feature_request.yml), or [Support / Question](references/support.yml). Use [the template overview](references/issue-templates.md) for routing and shared conventions.
3. Produce a concise English title with the template's required prefix, a complete body, and the template's default labels.
4. Keep observed behavior, expected behavior, and proposed solutions distinct. Do not invent reproduction steps, environment details, issue links, scope, priority, or user confirmations.
5. Gather only the missing required information before producing a ready-to-submit issue. Group related questions and do not ask for optional fields unless they would materially improve the report.

## Information to Gather

First determine the issue type only if it cannot be inferred: “Is this a bug, a feature request, or a support question?”

For a **Bug Report**, ask for:

- A one-sentence summary.
- What happened, what was expected, and the impact.
- The proposed solution or the desired outcome.
- One or more impact scopes and a priority.

For a **Feature Request**, ask for:

- A one-sentence summary.
- The problem or limitation it addresses.
- The proposed behavior or solution.
- One or more impact scopes and a priority.

Ask about alternatives, expected benefits, and risks only when the proposal is broad, contentious, or likely to have material trade-offs.

For a **Support / Question** issue, ask for:

- A concise question summary.
- The goal and relevant context.

Ask what has already been tried and for environment details only when they are needed to answer or diagnose the question.

For every type, ask whether the author has searched existing issues and Discussions and agrees to follow the Code of Conduct. Do not mark those confirmations as complete without an explicit answer. Ask for contact details only if a follow-up channel would be useful.

If the user explicitly asks to open the issue remotely, ask for the target repository only when it is not already clear. Do not perform the external action until all required fields and confirmations are complete.

## Output

Return, in order:

1. Suggested issue type and labels.
2. Title.
3. Markdown body organized by the selected template's fields.
4. Any required missing information or unchecked confirmations.

Do not search for duplicates or create an issue on GitHub unless the user requests that external action.
