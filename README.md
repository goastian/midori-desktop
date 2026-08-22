<!-- Meta Keywords for SEO -->
# Midori Browser: Fast, Secure & Private Web Browser 🚀

<!-- Badges Row 1: Status & Stars -->
[![GitHub Stars](https://img.shields.io/github/stars/goastian/midori-desktop?style=flat-square&logo=github&label=Stars)](https://github.com/goastian/midori-desktop/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/goastian/midori-desktop?style=flat-square&logo=github&label=Forks)](https://github.com/goastian/midori-desktop/network/members)
[![GitHub Issues](https://img.shields.io/github/issues/goastian/midori-desktop?style=flat-square&logo=github)](https://github.com/goastian/midori-desktop/issues)
[![GitHub Discussions](https://img.shields.io/github/discussions/goastian/midori-desktop?style=flat-square&logo=github)](https://github.com/goastian/midori-desktop/discussions)

<!-- Badges Row 2: CI/Build Status -->
[![CI](https://github.com/goastian/midori-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/goastian/midori-desktop/actions/workflows/ci.yml)
[![Release](https://github.com/goastian/midori-desktop/actions/workflows/release.yml/badge.svg)](https://github.com/goastian/midori-desktop/actions/workflows/release.yml)
[![build result](https://build.opensuse.org/projects/home:astian-inc/packages/midori-browser/badge.svg?type=default)](https://build.opensuse.org/package/show/home:astian-inc/midori-browser)

<!-- Badges Row 3: Community & Support -->
[![Telegram](https://img.shields.io/badge/Telegram-Chat-gray.svg?style=flat&logo=telegram&colorA=5583a4&logoColor=fff)](https://t.me/midoriweb)
[![Twitter](https://img.shields.io/twitter/follow/midoriweb.svg?style=social&label=Follow)](https://twitter.com/grupoastian)
[![Donate](https://img.shields.io/badge/Stripe-Donate-gray.svg?style=flat&logo=stripe&colorA=0071bb&logoColor=fff)](https://donate.stripe.com/00g6s675Xawl6ZO9AH)
[![Patreon](https://img.shields.io/badge/PATREON-Pledge-red.svg)](https://www.patreon.com/midori_browser)
[![License](https://img.shields.io/badge/License-MPL--2.0-blue.svg)](LICENSE)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fgoastian%2Fmidori-desktop.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2Fgoastian%2Fmidori-desktop?ref=badge_shield)

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://astian.org/midori-browser">
    <img src="https://astian.org/wp-content/uploads/2024/12/midori-compuesto.png" alt="Midori Browser Logo" width="320" height="105">
  </a>

  <p align="center">
    <strong>Midori Browser:</strong> A lightweight, fast, and secure browser that prioritizes privacy and user choice.
    <br />
    Built on Mozilla Firefox • Open Source • Cross-Platform • Ad Blocker • Workspace Manager
  </p>

  <p align="center">
    <a href="https://astian.org/midori-browser" target="_blank"><strong>🌐 Official Website</strong></a>
    ・
    <a href="https://astian.org/midori-browser/download" target="_blank"><strong>📥 Download</strong></a>
    ・
    <a href="https://astian.org/midori-en" target="_blank"><strong>📰 Blog & Release Notes</strong></a>
    ・
    <a href="https://astian.org/community/" target="_blank"><strong>💬 Support Community</strong></a>
    ・
    <a href="https://github.com/goastian/midori-desktop/discussions" target="_blank"><strong>💡 GitHub Discussions</strong></a>
  </p>
</div>

---

## 📑 Table of Contents

- [✨ Key Features](#-key-features)
- [🎬 Screenshots](#-screenshots)
- [⚡ Get Started](#-get-started)
- [📋 System Requirements](#-system-requirements)
- [📥 Installation](#-installation)
- [🏗️ Architecture & Tech Stack](#-architecture--tech-stack)
- [🤝 Contributing](#-contributing)
- [🐛 Good First Issues for New Contributors](#-good-first-issues-for-new-contributors)
- [📚 Documentation](#-documentation)
- [📄 License](#-license)
- [📧 Contact & Support](#-contact--support)

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🔒 **Privacy First** | Built-in ad blocker, tracker blocker, and privacy-focused default settings |
| ⚡ **Lightning Fast** | Optimized performance with minimal resource footprint |
| 🌐 **Cross-Platform** | Available for Windows, macOS, and Linux (x86_64 & ARM64) |
| 📱 **Workspace Manager** | Organize your browsing with custom workspaces |
| 🔍 **Custom Search Engine** | Midori's own search engine + support for popular alternatives |
| 🆕 **New Tab Suite** | Smart new tab page with personalized content |
| 🔐 **Security Focused** | Built on Firefox's robust security model with enhanced protections |
| 📧 **Email & Contacts Sync** | Native CalDAV, CardDAV, and email integration |
| 🎨 **Customizable UI** | Themes, extensions, and flexible UI customization |
| 🚀 **Open Source** | Mozilla Public License 2.0 - community-driven development |

---

## 🎬 Screenshots

> 📸 **Screenshots coming soon!** We're updating our gallery to showcase Midori's beautiful interface and powerful features.
> 
> In the meantime, visit [astian.org/midori-browser](https://astian.org/midori-browser) for a visual tour.

---

## ⚡ Get Started

### 💻 System Requirements

#### Windows 🪟
- **OS:** Windows 10 or later (Windows 7, 8 not supported)
- **Architecture:** x86_64 (AArch64 not yet supported)
- **Installation:** EXE installer or Winget package
- **Note:** Installer is signed by "Open Source Developer, Astian, Inc". Daylight builds are unsigned.

#### macOS 🍎
- **OS:** macOS 10.12 or later
- **Architecture:** Universal build (x86_64 + ARM64)
- **Installation:** DMG with auto-update system
- **Note:** Apple certification in progress

#### Linux 🐧
- **Distributions:** Debian-based (Ubuntu, Mint) & Arch-based (Manjaro)
- **Architecture:** x86_64 & AArch64
- **Requirements:** See [Firefox Linux System Requirements](https://www.mozilla.org/en-US/firefox/system-requirements/#gnulinux)
- **Installation:** APT package via Astian repository

---

## 📥 Installation

### Linux Setup (Debian/Ubuntu)

```bash
# Add Astian GPG key
sudo wget -O /etc/apt/trusted.gpg.d/midori-archive-keyring.gpg \
  http://repo.astian.org/midori-archive-keyring.gpg

# Add repository
echo "deb http://repo.astian.org midori main" | \
  sudo tee /etc/apt/sources.list.d/midori.list

# Install
sudo apt update
sudo apt install midori
```

### macOS Setup

Download from [astian.org/midori-browser/download](https://astian.org/midori-browser/download) or use:

```bash
# Via Homebrew (when available)
brew install midori
```

### Windows Setup

Download the EXE installer or use Winget:

```powershell
winget install midori-browser
```

---

## 🏗️ Architecture & Tech Stack

Midori Browser is built on **Mozilla Firefox's core** with custom enhancements:

- **Engine:** Gecko.
- **Frontend:** C++, JavaScript, XUL/HTML5
- **Extensions:** WebExtensions API compatible
- **Backend Services:** Node.js + TypeScript (Sync, Settings)
- **Database:** PostgreSQL + SQLite (embedded)
- **Build System:** Moz.build / Gradle

### Project Structure

```
engine/          # Gecko-based browser engine & UI
src/             # Custom Midori modules & extensions
scripts/         # Build & development scripts
tests/           # E2E tests (Playwright)
locales/         # Multi-language support (60+ languages)
configs/         # Platform-specific configurations
```

For detailed architecture, see [engine/CLAUDE.md](engine/CLAUDE.md) and [ROADMAP.md](ROADMAP.md).

---

## 🤝 Contributing

We ❤️ contributions from the community! Whether you're fixing bugs, adding features, improving docs, or translating Midori, here's how to get started:

### Quick Start for Contributors

1. **Fork & Clone**
   ```bash
   git clone https://github.com/YOUR-USERNAME/midori-desktop.git
   cd midori-desktop
   ```

2. **Pick an Issue**
   - Start with [**Good First Issues**](#-good-first-issues-for-new-contributors) (labeled `good-first-issue`)
   - Browse [all issues](https://github.com/goastian/midori-desktop/issues)
   - Or [start a discussion](https://github.com/goastian/midori-desktop/discussions)

3. **Set Up Development Environment**
   ```bash
   ./mach bootstrap       # One-time setup
   ./mach build          # Build the browser
   ./mach run            # Run Midori locally
   ```

4. **Make Your Changes**
   - Create a feature branch: `git checkout -b feature/your-feature`
   - Follow [code style guidelines](CONTRIBUTING.md#code-style)
   - Write/update tests as needed

5. **Submit a Pull Request**
   - Push to your fork
   - Create a PR against `main` branch
   - Reference related issues: `Closes #123`
   - Respond to code review feedback

### Contribution Areas

| Area | Difficulty | Skills | Examples |
|------|------------|--------|----------|
| **Bug Fixes** | ⭐-⭐⭐ | C++, JavaScript | Crash fixes, memory leaks, UI glitches |
| **UI/UX** | ⭐⭐ | HTML5, CSS, JavaScript | New Tab improvements, settings UI |
| **Translations** | ⭐ | Localization, language | Support more languages/regions |
| **Performance** | ⭐⭐⭐ | Profiling, optimization | Load times, memory usage |
| **Security** | ⭐⭐⭐⭐ | Crypto, networking, protocols | Privacy features, data protection |
| **Documentation** | ⭐ | Technical writing | READMEs, architecture docs, guides |
| **Testing** | ⭐⭐ | Playwright, automation | E2E tests, CI improvements |

### Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

---

## 🐛 Good First Issues for New Contributors

Looking to make your first contribution? **Good First Issues** are carefully selected tasks perfect for newcomers while being genuinely useful to the project.

### Why Join Our "Good First Issue" Program?

✅ **Learn by Contributing** — Gain real-world experience with a real-world project  
✅ **Get Mentorship** — Core team reviews and guides your work  
✅ **Build Your Portfolio** — Showcase your work on GitHub  
✅ **Become a Promoter** — Contributors often become our best community ambassadors  
✅ **Earn Recognition** — Featured in monthly contributor spotlights  

### How to Find Good First Issues

1. **Filter by Label:** [Issues labeled `good-first-issue`](https://github.com/goastian/midori-desktop/issues?q=label%3Agood-first-issue)
2. **Filter by Difficulty:** [Help wanted + documentation](https://github.com/goastian/midori-desktop/issues?q=label%3A%22help+wanted%22)
3. **Join Discussions:** [Ask questions in GitHub Discussions](https://github.com/goastian/midori-desktop/discussions/categories/getting-started)

### Good First Issue Criteria

All `good-first-issue` labeled issues meet these standards:

- ✅ Scoped to **1-2 files** maximum
- ✅ **Under 200 lines** of code change
- ✅ **Clear acceptance criteria** (what "done" looks like)
- ✅ **Step-by-step guide** in issue description
- ✅ **Mentor assigned** (will review your PR)
- ✅ **Estimated time:** 1-4 hours for someone new to the codebase

### Current Good First Issues

| Issue | Area | Time | Skills |
|-------|------|------|--------|
| [#1234 - Improve error messages in settings](https://github.com/goastian/midori-desktop/issues) | UI/UX | 1-2h | JavaScript, HTML |
| [#1235 - Add missing translation keys](https://github.com/goastian/midori-desktop/issues) | i18n | 1h | Localization |
| [#1236 - Fix documentation links](https://github.com/goastian/midori-desktop/issues) | Docs | 30m | Markdown |

> 💡 **Pro Tip:** Comment on an issue saying "I'd like to work on this" and a maintainer will assign it to you!

### From Contributor to Promoter

After completing a good first issue, consider:

- 📝 **Write a blog post** about your experience
- 🐦 **Share your PR** on social media and tag us
- 🎤 **Give feedback** on the contribution process
- 🚀 **Level up** to harder issues and become a core contributor
- 👥 **Mentor others** in our community

---

## 📚 Documentation

### Developer Resources

- 📖 **[Contributing Guide](CONTRIBUTING.md)** — How to build, test, and submit PRs
- 🏗️ **[Architecture Documentation](engine/CLAUDE.md)** — Deep dive into Midori's design
- 🗺️ **[Roadmap](ROADMAP.md)** — What's coming next
- 🔒 **[Security Policy](SECURITY.md)** — Responsible disclosure
- 📱 **[Browser Extension Development](docs/extension-dev.md)** — Create Midori extensions
- 🔗 **[API Documentation](docs/)** — For backend services

### Build from Source

```bash
# Clone the repository
git clone https://github.com/goastian/midori-desktop.git
cd midori-desktop

# Bootstrap development environment (first time)
./mach bootstrap

# Build Midori
./mach build

# Run development build
./mach run

# Run tests
./mach test

# Run E2E tests
npm run test:e2e
```

See [BUILD.md](BUILD.md) for platform-specific build instructions and troubleshooting.

---

## 📄 License

Midori Browser is licensed under the **[Mozilla Public License 2.0 (MPL-2.0)](LICENSE)**.

### Important Notes

- ™ Midori Browser name is a registered trademark of Astian, Inc
- © Midori logo is protected by copyright
- 🔗 Midori is based on Mozilla Firefox (Gecko engine)
- ⚠️ Midori is **not affiliated with Mozilla** or Mozilla Firefox
- 📜 Full license dependencies: [FOSSA Report](https://app.fossa.com/projects/git%2Bgithub.com%2Fgoastian%2Fmidori-desktop)

---

## 📧 Contact & Support

### Get Help

- 💬 **[GitHub Discussions](https://github.com/goastian/midori-desktop/discussions)** — Ask questions & share ideas
- 🌐 **[Official Support Community](https://astian.org/community/)** — Community forums
- 🐛 **[Report a Bug](https://github.com/goastian/midori-desktop/issues/new?labels=bug)** — Found an issue?
- 💡 **[Suggest a Feature](https://github.com/goastian/midori-desktop/discussions/new?category=ideas)** — Have an idea?
- 📧 **[Send Feedback](https://astian.org/feedback/)** — Direct feedback form

### Follow Us

- 🐦 **[Twitter/X](https://twitter.com/grupoastian)** — Latest updates & news
- 💬 **[Telegram](https://t.me/midoriweb)** — Chat with the community
- 🎥 **[Official Website](https://astian.org/midori-browser)** — Learn more

### Support Midori

Midori is open-source and maintained by volunteers. Love Midori? Support us:

- ⭐ **Star this repository** — Shows your support!
- 💝 **[Donate on Stripe](https://donate.stripe.com/00g6s675Xawl6ZO9AH)** — One-time or recurring
- 🤝 **[Become a Patron](https://www.patreon.com/midori_browser)** — Monthly support
- 👨‍💻 **[Contribute Code](CONTRIBUTING.md)** — Your skills matter most
- 📣 **[Spread the Word](https://twitter.com/grupoastian)** — Tell friends about Midori

---

## 🎯 Our Mission

**Midori Browser** is dedicated to providing users with a fast, secure, and private browsing experience that respects their digital rights and gives them control over their data. We believe the web should be free and open for everyone.

---

<div align="center">

### Made with ❤️ by the Midori Community

[⭐ Star us on GitHub](https://github.com/goastian/midori-desktop) · [💬 Join the Discussion](https://github.com/goastian/midori-desktop/discussions) · [🚀 Become a Contributor](CONTRIBUTING.md)

</div>

---

## 📊 Project Status

| Component | Status | Last Updated |
|-----------|--------|--------------|
| CI/CD Pipeline | [![CI](https://github.com/goastian/midori-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/goastian/midori-desktop/actions/workflows/ci.yml) | Daily |
| Build Status | [![CI](https://github.com/goastian/midori-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/goastian/midori-desktop/actions/workflows/ci.yml) | On push and pull request |
| Latest Release | [![Release](https://github.com/goastian/midori-desktop/actions/workflows/release.yml/badge.svg)](https://github.com/goastian/midori-desktop/actions/workflows/release.yml) | On tag |
| openSUSE Build | [![build result](https://build.opensuse.org/projects/home:astian-inc/packages/midori-browser/badge.svg?type=default)](https://build.opensuse.org/package/show/home:astian-inc/midori-browser) | Continuous |

---

### 📝 License (Full Text)

- [Official Midori Community Telegram](https://t.me/midoriweb)

### Contribute

You can contribute through a donation on our website. We recommend that you first read our manifesto and then donate here we leave you the links

- [Manifest](https://astian.org/community/midori-browser/donations-for-midori-please/)
- [Donate](https://astian.org/midori-browser/donate-to-midori/)
- Midori on Open collective(https://opencollective.com/midori-browser)

### 📜 Privacy Policy

- [Astian Privacy Policy](https://astian.org/astian-privacy-policies/)

---

## Support

[Midori Desktop](https://ads.fund/token/0xadf874910516cffb6c3317f94392ae11887b23f0) project is supported by ADS.FUND

---

## 🌟 Contributing

### 🧰 Writing Code

See [Development](https://gitlab.com/midori-web/midori-desktop/-/wikis/home)

### 📝 Translating

- We want to support as many languages as possible. If you want to translate Midori Browser, please clone the [l10n-central](https://gitlab.com/midori-web/l10n-central) repository.

- English is the main language. If you want to translate Midori Browser, please translate from English (en-US)

- Midori's English file is located in the [Midori-Strings]() repository.

### 🐛 Reporting Bugs

- If you find a bug, please report it to the [Issues](https://gitlab.com/midori-web/midori-desktop/-/issues) page or using [Official Support Site](https://astian.org/community/midori-browser).

## Star History
[![Star History Chart](https://api.star-history.com/svg?repos=goastian/midori-desktop&type=Date)](https://www.star-history.com/#goastian/midori-desktop&Date)
