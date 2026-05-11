# GitHub Labels & Automation Guide

Complete guide to labels, automation, and workflows for managing Midori issues and PRs.

## Table of Contents

- [Label System](#label-system)
- [How to Use Labels](#how-to-use-labels)
- [Workflow Automations](#workflow-automations)
- [Triage Process](#triage-process)

---

## Label System

### Priority Labels 🔴🟡🟢

| Label | Color | Usage | Priority |
|-------|-------|-------|----------|
| `critical` | 🔴 Red | Severe bugs, security issues, blocking production | P0 |
| `high` | 🟠 Orange | Important features, major bugs | P1 |
| `medium` | 🟡 Yellow | Normal improvements, minor bugs | P2 |
| `low` | 🟢 Green | Nice-to-have, cosmetic fixes | P3 |

**When to use:**
- **Critical:** Crash, data loss, security vulnerability
- **High:** Feature breaks workflow, significant performance issue
- **Medium:** Works but suboptimal, cosmetic bug
- **Low:** Polish, future enhancement

---

### Type Labels 📋

| Label | Color | Description |
|-------|-------|-------------|
| `bug` | 🔴 Red | Unexpected behavior, crash, or error |
| `enhancement` | 🟢 Green | New feature or improvement |
| `documentation` | 📚 Blue | README, guides, comments, docs |
| `refactor` | 🟣 Purple | Code cleanup, architecture improvement |
| `performance` | ⚡ Yellow | Speed, memory, or resource optimization |
| `security` | 🔒 Orange | Privacy, encryption, vulnerabilities |
| `testing` | 🧪 Cyan | Tests, test coverage, test infrastructure |
| `i18n` | 🌍 Green | Internationalization, translations, locales |
| `ui/ux` | 🎨 Pink | User interface, user experience |
| `backend` | ⚙️ Gray | Server, API, database |

---

### Status Labels ⏱️

| Label | Color | Description |
|-------|-------|-------------|
| `good-first-issue` | 💚 Green | Perfect for newcomers (1-4 hours) |
| `help-wanted` | 🟢 Bright Green | Contributors wanted! |
| `in-progress` | 🔵 Blue | Someone is actively working on it |
| `blocked` | 🟠 Orange | Waiting for decision or another PR |
| `wontfix` | ⚪ Gray | Won't be fixed (intentional) |
| `duplicate` | ⚫ Black | Already exists (link to original) |
| `needs-review` | 🟡 Yellow | Waiting for code review |
| `reviewed` | 🟢 Green | Approved, ready to merge |
| `qa-testing` | 🔷 Blue | In QA testing phase |
| `ready-to-merge` | 🟢 Green | All checks pass, ready for merge |

---

### Area Labels 🗺️

Use these to organize by component:

| Label | Color | Area |
|-------|-------|------|
| `area: browser-core` | 🔵 Blue | Gecko engine, rendering, core |
| `area: new-tab` | 🟠 Orange | New Tab page, widgets |
| `area: sync` | 🟣 Purple | Data sync, cloud storage |
| `area: privacy` | 🟢 Green | Ad blocker, tracker blocking, privacy |
| `area: settings` | 🟡 Yellow | Preferences, configuration |
| `area: extensions` | 🟢 Green | Extension API, WebExtensions |
| `area: devtools` | 🟢 Green | Developer tools |
| `area: ui` | 🎨 Pink | User interface, UI components |
| `area: performance` | ⚡ Yellow | Speed, optimization |
| `area: security` | 🔒 Orange | Encryption, authentication |
| `area: build-system` | ⚙️ Gray | Build, CI/CD, infrastructure |
| `area: documentation` | 📚 Blue | Docs, guides, comments |

---

### Effort Labels ⏳

| Label | Color | Estimate |
|-------|-------|----------|
| `effort: small` | 🟢 Green | < 4 hours |
| `effort: medium` | 🟡 Yellow | 4-16 hours |
| `effort: large` | 🟠 Orange | 16-40 hours |
| `effort: xlarge` | 🔴 Red | > 40 hours |

---

### Special Labels ⭐

| Label | Color | Purpose |
|-------|-------|---------|
| `epic` | 🟣 Purple | Large feature (link related issues) |
| `milestone` | 🟡 Yellow | Part of milestone/release |
| `upstream` | 🔵 Blue | Related to Firefox/Gecko upstream |
| `regression` | 🔴 Red | Used to work, now broken |
| `RFC` | 🟣 Purple | Request for Comments - design discussion |
| `chore` | ⚙️ Gray | Maintenance, build system, etc. |
| `dependencies` | 📦 Blue | Dependency upgrade, npm/cargo |

---

## How to Use Labels

### When Creating an Issue

**All new issues should have:**

1. **Type label** (exactly one)
   - `bug` OR `enhancement` OR `documentation` OR `refactor` etc.

2. **Priority label** (if not urgent, add `low`)
   - `critical`, `high`, `medium`, OR `low`

3. **Area label** (if applicable)
   - Which component? e.g., `area: new-tab`

**Example labels for an issue:**
- Bug in sync: `bug`, `high`, `area: sync`
- Documentation improvement: `documentation`, `low`, `help-wanted`
- New feature idea: `enhancement`, `medium`, `area: ui`

### When Reviewing PRs

**Add status labels:**
- `needs-review` — Just submitted
- `reviewed` — Approved, no changes needed
- `ready-to-merge` — All checks pass, ready for merge

**Add effort if not obvious:**
- Check diff size and complexity
- Compare to `effort: *` labels

---

## Workflow Automations

### GitHub Actions for Automated Triage

Create these workflows in `.github/workflows/`:

#### 1. Auto-label by keywords

```yaml
# .github/workflows/auto-label.yml
name: Auto-label Issues

on:
  issues:
    types: [opened, edited]

jobs:
  label:
    runs-on: ubuntu-latest
    steps:
      - name: Auto-label issues
        uses: actions/github-script@v7
        with:
          script: |
            const title = context.payload.issue.title;
            const body = context.payload.issue.body || '';
            const labels = [];

            // Check for bug keywords
            if (/crash|error|bug|broken|fails/i.test(title + body)) {
              labels.push('bug');
            }

            // Check for performance keywords
            if (/slow|performance|memory|optimize/i.test(title + body)) {
              labels.push('performance');
            }

            // Check for security keywords
            if (/security|vulnerability|encrypt|password/i.test(title + body)) {
              labels.push('security');
            }

            if (labels.length > 0) {
              github.rest.issues.addLabels({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                labels
              });
            }
```

#### 2. Stale issue automation

```yaml
# .github/workflows/stale.yml
name: Close Stale Issues

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly

jobs:
  stale:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/stale@v8
        with:
          repo-token: ${{ secrets.GITHUB_TOKEN }}
          stale-issue-message: 'This issue is stale. It will be closed in 7 days unless there is activity.'
          days-before-stale: 60
          days-before-close: 7
          exempt-issue-labels: 'pinned,security,epic'
          stale-issue-label: 'stale'
```

#### 3. PR review requests

```yaml
# .github/workflows/pr-review.yml
name: Request PR Review

on:
  pull_request:
    types: [opened, ready_for_review]

jobs:
  request-review:
    runs-on: ubuntu-latest
    steps:
      - name: Request review from codeowners
        uses: actions/github-script@v7
        with:
          script: |
            const codeowners = ['maintainer1', 'maintainer2'];
            
            github.rest.pulls.requestReviewers({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: context.issue.number,
              reviewers: codeowners
            });
```

#### 4. Auto-assign good first issues to mentors

```yaml
# .github/workflows/assign-mentor.yml
name: Auto-assign Mentor to Good First Issue

on:
  issues:
    types: [labeled]

jobs:
  assign:
    if: github.event.label.name == 'good-first-issue'
    runs-on: ubuntu-latest
    steps:
      - name: Assign mentor
        uses: actions/github-script@v7
        with:
          script: |
            // Rotate mentors
            const mentors = ['maintainer1', 'maintainer2', 'maintainer3'];
            const mentor = mentors[Math.floor(Math.random() * mentors.length)];
            
            github.rest.issues.addAssignees({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              assignees: [mentor]
            });

            // Add comment
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: `👋 Welcome! This is a **Good First Issue** perfect for new contributors.\n\n@${mentor} has been assigned as mentor.\n\nReady to contribute? Comment "I'd like to work on this!" 🚀`
            });
```

---

## Triage Process

### Daily Triage (15 minutes)

1. ✅ **Check new issues** (past 24h)
2. 🏷️ **Add type label** (bug/enhancement/docs)
3. 📊 **Add priority** (critical/high/medium/low)
4. 🗺️ **Add area** (area: *)
5. 👋 **Respond to user** if needed

### Weekly Triage (1 hour)

1. 🔍 **Review unlabeled issues**
2. 🏆 **Identify good first issues** (small, well-scoped)
3. 👥 **Assign mentors** to good first issues
4. 📌 **Pin important discussions**
5. 🤔 **Close duplicates** with link to original

### Monthly Review

1. 📊 **Metrics** — Count issues by label, trend
2. 🎯 **Prioritize** — What's blocking the roadmap?
3. 🗺️ **Milestone** — Assign issues to milestones/releases
4. 🌟 **Celebrate** — Highlight contributors

---

## Label Management Script

### Creating Labels (Bulk)

Use GitHub CLI:

```bash
#!/bin/bash

# Define labels
labels=(
  "bug:d73a4a:Unexpected behavior or error"
  "enhancement:a2eeef:New feature or request"
  "documentation:0075ca:Improvements or additions to documentation"
  "good-first-issue:7057ff:Good for newcomers"
  "help-wanted:033366:Extra attention is needed"
  "critical:b60205:Critical issue (P0)"
  "high:ff6600:High priority (P1)"
  "medium:ffaa00:Medium priority (P2)"
  "low:cccccc:Low priority (P3)"
)

for label in "${labels[@]}"; do
  IFS=':' read -r name color desc <<< "$label"
  gh label create "$name" --color "$color" --description "$desc" || true
done
```

### Updating Labels (if needed)

```bash
gh label edit "bug" --color "d73a4a" --description "Unexpected behavior"
```

---

## Quick Reference

**For Issue Reporters:**
```
Please add labels when creating issues:
- 1 type label (bug, enhancement, etc.)
- 1 priority (critical, high, medium, low)
- 1+ area (area: *)
```

**For Maintainers:**
```bash
# View unlabeled issues
gh issue list --no-label

# View good first issues
gh issue list --label good-first-issue --state open

# View by priority
gh issue list --label critical --state open
```

---

<div align="center">

## Efficient issue management = Happy contributors = Thriving community 🚀

</div>
