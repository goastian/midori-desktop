# Contributing to Midori Browser

Welcome to the Midori Browser community! 🎉 We're thrilled you're interested in contributing. Whether it's code, documentation, translations, or bug reports, your contribution matters.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Good First Issues](#good-first-issues)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Code Style & Guidelines](#code-style--guidelines)
- [Recognition & Rewards](#recognition--rewards)

---

## Code of Conduct

Our community is built on respect and inclusivity. Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md) in all interactions.

**Core values:**
- 🤝 Respect all community members
- 💚 No harassment, discrimination, or hateful conduct
- 🎯 Keep discussions focused and constructive
- ♿ Ensure accessibility is a priority
- 🌍 Welcome diversity of perspectives

---

## How Can I Contribute?

### 1. **Report Bugs** 🐛

Found a crash or unexpected behavior? Help us fix it!

**Before opening an issue:**
- ✅ Check [existing issues](https://github.com/goastian/midori-desktop/issues) to avoid duplicates
- ✅ Test with the latest build
- ✅ Note your OS, browser version, and steps to reproduce

**When opening an issue, include:**
- Clear title (e.g., "Settings panel crashes when clicking Save")
- Detailed reproduction steps
- Expected vs actual behavior
- Screenshots/videos if applicable
- System info (OS, Midori version, CPU architecture)

Use the [bug report template](https://github.com/goastian/midori-desktop/issues/new?labels=bug).

### 2. **Suggest Features** 💡

Have an idea to make Midori better?

- 📝 Start a [discussion](https://github.com/goastian/midori-desktop/discussions/categories/ideas)
- 🎯 Describe the use case and benefits
- 🔍 Check existing feature requests first
- 💬 Engage with the community for feedback

Feature discussions often lead to formal feature requests → tasks for contributors.

### 3. **Improve Documentation** 📚

Documentation is never "done"! Improvements always welcome:

- 📖 Typo fixes
- ✨ Clearer explanations
- 🆕 New guides or tutorials
- 🔗 Broken link fixes
- 🌐 Translations

**Docs-only contributions:**
- Fork → Edit → PR (no build needed for `.md` files)
- Keep language simple and inclusive
- Add code examples where helpful

### 4. **Translate Midori** 🌍

Help Midori reach people worldwide!

- 🗣️ Currently supported in 60+ languages
- 📍 [Crowdin Project](https://crowdin.com/project/midori-browser) — Community translation platform
- 🤝 New language requests welcome!

### 5. **Write Tests** ✅

Robust tests = fewer bugs:

- 🧪 Unit tests (C++, JavaScript)
- 🎬 E2E tests (Playwright)
- 🔍 Integration tests
- 📊 Performance tests

See [tests/](tests/) for examples.

### 6. **Fix Code** 💻

Ready to code? We have issues for all skill levels!

- ⭐ Start with [Good First Issues](#good-first-issues)
- 🎯 Browse [all issues](https://github.com/goastian/midori-desktop/issues)
- 🚀 Or suggest your own improvements

---

## Good First Issues

**Perfect for first-time contributors!**

### What Are Good First Issues?

Issues labeled `good-first-issue` are:
- ✅ Scoped to **1-2 files**
- ✅ **Under 200 lines** of changes
- ✅ **Well-documented** with clear acceptance criteria
- ✅ **Step-by-step guide** in the issue
- ✅ **Mentor assigned** to review your work
- ✅ **Estimated 1-4 hours** for someone new to the codebase

### How to Get Started

1. **Find an issue:** [Search `label:good-first-issue`](https://github.com/goastian/midori-desktop/issues?q=label%3Agood-first-issue)

2. **Comment:** "I'd like to work on this" (mentor will assign it)

3. **Ask questions:** In the issue or [GitHub Discussions](https://github.com/goastian/midori-desktop/discussions)

4. **Submit your PR:** [See Submitting a Pull Request](#submitting-a-pull-request)

5. **Get feedback:** Mentor reviews and guides your work

6. **Merge & celebrate:** Your code is now in Midori! 🎉

### From Contributor to Promoter

After your first contribution:

- 📝 **Write a blog post** — Share your experience (we'll help promote!)
- 🐦 **Tweet about it** — Tag us [@grupoastian](https://twitter.com/grupoastian)
- 🎤 **Join a stream** — Discuss your PR on our community calls
- 👥 **Mentor others** — Help newcomers get started
- 🚀 **Take on harder issues** — Level up your skills
- 🌟 **Become a maintainer** — For consistent contributors

---

## Development Setup

### Prerequisites

- **Git** — Version control
- **Python 3** — Build system
- **Rust** — Some components require Rust
- **Node.js 18+** — For TypeScript services
- **Platform-specific:**
  - **macOS:** Xcode Command Line Tools
  - **Windows:** Visual Studio Build Tools
  - **Linux:** Build essentials (`build-essential` on Ubuntu)

### Initial Setup

```bash
# 1. Clone the repository
git clone https://github.com/YOUR-USERNAME/midori-desktop.git
cd midori-desktop

# 2. Bootstrap (one-time, installs dependencies)
./mach bootstrap

# 3. Configure build (optional, for advanced users)
./configure

# 4. Build Midori
./mach build

# 5. Run locally
./mach run
```

### Troubleshooting Build Issues

- **Bootstrap hangs?** → Increase timeout or run `./mach bootstrap --help`
- **Disk space?** → Build needs ~50GB. Clean builds: `./mach clean`
- **Memory issues?** → Reduce parallel jobs: `./mach build -j2`
- **Dependency errors?** → Run `./mach bootstrap` again

See [BUILD.md](BUILD.md) for platform-specific instructions.

---

## Making Changes

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
# or for bug fixes:
git checkout -b fix/issue-description
```

**Branch naming convention:**
- `feature/short-description` — New feature
- `fix/issue-description` — Bug fix
- `refactor/area-name` — Code refactoring
- `docs/page-name` — Documentation
- `test/feature-description` — Test improvements

### 2. Make Your Changes

- Keep commits **small and focused**
- Write clear commit messages:
  ```
  [Component] Brief description
  
  Longer explanation if needed. Reference issues: Closes #123
  ```

- Write/update tests for new features
- Update documentation as needed

### 3. Test Your Changes

```bash
# Run the app
./mach run

# Run tests
./mach test

# Run specific test file
./mach test tests/unit/MyTest.cpp

# E2E tests (if changed browser behavior)
cd tests && npm install && npm run test:e2e
```

### 4. Code Quality Checks

```bash
# Lint JavaScript
npm run lint

# Format code
npm run format

# Check types (TypeScript)
npm run type-check
```

---

## Submitting a Pull Request

### Before You Submit

- ✅ Push to your fork
- ✅ Ensure tests pass: `./mach test`
- ✅ Check code style: `npm run lint`
- ✅ Pull latest from main: `git pull origin main`

### Create the Pull Request

1. **Go to** [Pull Requests](https://github.com/goastian/midori-desktop/pulls)

2. **Click** "New Pull Request"

3. **Select** your fork and branch

4. **Fill in the template:**

```markdown
## Description
Brief summary of changes.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring

## Related Issue
Closes #123 (if applicable)

## Testing
- [ ] Added/updated tests
- [ ] Tests pass locally
- [ ] No new warnings

## Checklist
- [ ] Followed code style guidelines
- [ ] Updated documentation
- [ ] No new dependencies added
```

### Review Process

- 👀 **Maintainers review** — Usually within 48 hours
- 💬 **Respond to feedback** — Be constructive and patient
- ✅ **Make requested changes** — In new commits (don't rebase)
- 🎉 **Merge!** — Congratulations!

### Addressing Feedback

```bash
# Make changes locally
git add .
git commit -m "[fix] Address review feedback"
git push origin your-branch
# Changes appear automatically in the PR!
```

---

## Code Style & Guidelines

### JavaScript/TypeScript

```javascript
// ✅ Good: Clear naming, comments for complex logic
function calculateSyncChecksum(collection) {
  // Hash based on sorted keys for deterministic output
  const sorted = Object.entries(collection)
    .sort(([a], [b]) => a.localeCompare(b));
  return crypto.subtle.digest('SHA-256', JSON.stringify(sorted));
}

// ❌ Avoid: Unclear naming, no comments
function calc(obj) {
  return crypto.subtle.digest('SHA-256', obj);
}
```

**Style rules:**
- Use **const** by default, **let** for reassignments, **never** var
- **Semicolons** — Required
- **Line length** — 100 characters max
- **Indentation** — 2 spaces
- **Comments** — For "why", not "what"
- **Error handling** — Always catch and log errors

### C++

```cpp
// ✅ Good: Follows Mozilla style
nsresult MyClass::DoSomething() {
  MOZ_LOG(GetLogger(), LogLevel::Debug, ("Starting operation"));
  
  nsresult rv = PerformTask();
  if (NS_FAILED(rv)) {
    return rv;
  }
  
  return NS_OK;
}

// ❌ Avoid: Non-standard style
int MyClass::do_something() {
  return perform_task();
}
```

**Style rules:**
- Follow **Mozilla C++ style guide**
- Use **MOZ_LOG** for logging
- Always check **nsresult** returns
- Use **RefPtr** for reference counting
- Document with **doxygen-style** comments

### Commit Message Format

```
[Component] Short description (50 chars max)

Longer explanation (72 char line wrap):
- Why is this change needed?
- What was the problem?
- How does this fix it?

Related issues: Closes #123, Fixes #456
```

**Good examples:**
- `[New Tab] Add weather widget integration`
- `[Privacy] Fix tracker leak in referrer header`
- `[Docs] Update installation guide for ARM64`

---

## Testing Guidelines

### Writing Tests

1. **Unit Tests** — Test individual functions

```javascript
describe('AdsService', () => {
  it('should fetch ads within timeout', async () => {
    const ads = await fetchAds({ timeout: 6000 });
    expect(ads.length).toBeGreaterThan(0);
  });
});
```

2. **E2E Tests** — Test user workflows

```typescript
test('user can enable ad blocker', async ({ page }) => {
  await page.goto('chrome://settings');
  await page.click('[data-testid="adblock-toggle"]');
  await expect(page.locator('.ad')).toHaveCount(0);
});
```

3. **Integration Tests** — Test component interactions

### Running Tests

```bash
# All tests
./mach test

# Specific suite
./mach test tests/unit/sync/*

# E2E with specific browser
npm run test:e2e -- --project=chromium

# With coverage
npm run test -- --coverage
```

---

## Recognition & Rewards

We believe contributors should be recognized for their work!

### Monthly Spotlight 🌟

Top contributors are featured in:
- 📰 Monthly newsletter
- 🐦 Twitter/social media
- 💬 Community forums
- 🎙️ Podcast (if applicable)

### Reward Program

- 🎁 **Contributors** — Access to early builds, exclusive swag
- 🏆 **Maintainers** — $$ stipend (for significant ongoing work)
- 👑 **Core Team** — Voting rights on major decisions

See [REWARDS.md](REWARDS.md) for details.

### Your Impact

Every contribution:
- ✅ Improves Midori for millions of users
- ✅ Strengthens our community
- ✅ Builds your portfolio
- ✅ Helps shape the future of privacy-first browsing

---

## Questions?

- 💬 **[GitHub Discussions](https://github.com/goastian/midori-desktop/discussions)** — Ask the community
- 🎯 **[@grupoastian](https://twitter.com/grupoastian)** — Twitter/X
- 💭 **[Telegram](https://t.me/midoriweb)** — Live chat
- 📧 **[Support](https://astian.org/community/)** — Official channels

---

## Additional Resources

- 📖 [Architecture Overview](engine/CLAUDE.md)
- 🗺️ [Project Roadmap](ROADMAP.md)
- 🔒 [Security Policy](SECURITY.md)
- ⚖️ [Code of Conduct](CODE_OF_CONDUCT.md)
- 📊 [Performance Guidelines](docs/performance.md)
- 🔗 [Extension Development](docs/extension-dev.md)

---

<div align="center">

## Thank You! ❤️

Your contributions make Midori better every day. Let's build a faster, more private web together!

[⭐ Star us](https://github.com/goastian/midori-desktop) · [📣 Spread the word](https://twitter.com/grupoastian) · [💝 Support](https://www.patreon.com/midori_browser)

</div>
