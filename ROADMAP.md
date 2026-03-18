# 🌿 Midori Browser — Development Roadmap

## From v11.6.1 to v12.0

> **Migration to latest Firefox via [Amelia](https://github.com/goastian/amelia)**  
> This roadmap covers the full development cycle starting from v11.6.1, where Midori Browser migrates from Firefox ESR 128 to the **latest stable Firefox release**, using the Amelia packaging system as the upstream foundation.

---

## 📋 Overview

| Version                                                  | Focus                                    | Difficulty                | Status  |
| -------------------------------------------------------- | ---------------------------------------- | ------------------------- | ------- |
| [v11.6.1](#v1161--clean-fork--latest-firefox-via-amelia) | Clean fork — Latest Firefox via Amelia   | 🟢 Low                    | Planned |
| [v11.6.2](#v1162--branding--welcome-screen)              | Branding & Welcome Screen                | 🟢 Low                    | Planned |
| [v11.6.3](#v1163--astian-go-as-default-search-engine)    | AstianGO as default search engine        | 🟢 Low                    | Planned |
| [v11.6.4](#v1164--disable-mozilla-ai-telemetry--pocket)  | Disable Mozilla AI, Telemetry & Pocket   | 🟡 Low–Medium             | Planned |
| [v11.6.5](#v1165--midorivpn-basic-integration)           | MidoriVPN basic integration              | 🟡 Medium                 | Planned |
| [v11.7.0](#v1170--custom-new-tab)                        | Custom New Tab                           | 🟡 Medium                 | Planned |
| [v11.7.1](#v1171--native-ad--tracker-blocker)            | Native Ad & Tracker Blocker              | 🟡 Medium                 | Planned |
| [v11.7.2](#v1172--themes-for-midori)                     | Themes for Midori                        | 🟡 Medium                 | Planned |
| [v11.8.0](#v1180--vertical-sidebar)                      | Vertical Sidebar                         | 🟠 Medium–High            | Planned |
| [v11.8.1](#v1181--performance-profiles)                  | Performance Profiles                     | 🟠 Medium–High            | Planned |
| [v11.9.0](#v1190--workspaces)                            | Workspaces                               | 🔴 High                   | Planned |
| [v11.9.1](#v1191--ui-redesign--advanced-ux)              | UI Redesign & Advanced UX                | 🔴 High                   | Planned |
| [v11.9.2](#v1192--native-extension-support)              | Native Extension Support                 | 🔴 High                   | Planned |
| [v12.0](#v120--final-optimizations-qa--stable-release)   | Final Optimizations, QA & Stable Release | 🔴 High — Major Milestone | Planned |

---

## Foundational Principles

- **Privacy by design** — every feature is evaluated through the lens of user privacy.
- **Modularity** — every integration (VPN, search, blocker) must be independently toggleable.
- **Amelia-based upstream** — all Firefox updates flow through the Amelia packaging layer.
- **Forward compatibility** — code must be easy to update as new Firefox releases land.
- **Open source spirit** — all decisions are documented in the public changelog.
- **Tests before merge** — no change reaches `main` without passing smoke tests on all 3 platforms.

---

## Detailed Versions

---

### v11.6.1 — Clean Fork — Latest Firefox via Amelia

> 🟢 **Difficulty: Low** | Foundation

**Goal:** Establish a clean, compilable fork of the latest Firefox using [Amelia](https://github.com/goastian/amelia) as the upstream packaging system. This replaces the previous ESR 128 base. The result should be a functional browser with minimal Midori identity but a fully stable foundation.

**Tasks:**

- [x] Fork latest Firefox via the Amelia packaging pipeline into `midori-desktop`
- [x] Configure `mozconfig` build environment for Windows, macOS, and Linux
- [x] Verify successful compilation on all 3 platforms
- [x] Rename product from Firefox to Midori in configuration files
- [x] Replace icons and splash screen with Midori assets
- [x] Set up CI/CD pipeline for automated builds
- [x] Document build process and environment setup
- [x] First installable internal test build
- [x] Design and implement the Welcome Screen (first-run experience)
- [x] Welcome Screen step: default search engine selection
- [x] Welcome Screen step: import data from another browser
- [x] Welcome Screen step: basic privacy configuration
- [x] Replace all Firefox branding assets with Midori/Astian equivalents
- [x] Configure Midori-specific `about:config` defaults
- [ ] Update `about:credits` and `about:rights` with Astian information
- [ ] Create `about:midori` page with browser details
- [x] Profile Performance.

**Acceptance criteria:** Browser compiles and runs on all 3 platforms with the Midori name and branding.

---

### v11.6.2 — Branding & Welcome Screen

> 🟢 **Difficulty: Low**

**Goal:** Establish the complete visual identity of Midori Browser and implement the Welcome Screen shown to new users on first launch.

**Tasks:**

- [x] Register AstianGO as a search engine in the browser codebase
- [x] Set AstianGO as the default engine in `about:config`
- [x] Integrate AstianGO search suggestions in the address bar (Awesome Bar)
- [x] Remove or demote unwanted default search engines (Google, Bing as default)

---

### v11.6.3 — AstianGO as Default Search Engine

> 🟢 **Difficulty: Low**

**Goal:** Integrate AstianGO as Midori's default search engine — in the address bar, new tab, and search suggestions — while removing or deprioritizing third-party search engines that conflict with Midori's privacy stance.

**Tasks:**

- [x] Add option to switch search engines in Settings
- [] Configure New Tab search bar to point to AstianGO
- [x] Integration tests against the AstianGO API

---

### v11.6.4 — Disable Mozilla AI, Telemetry & Pocket

> 🟡 **Difficulty: Low–Medium**

**Goal:** Remove or disable features built into Firefox that conflict with Midori's philosophy: Pocket, Mozilla telemetry, Firefox Suggest, Mozilla AI features, Firefox Relay, and Mozilla account sync. Midori must not send data to third parties by default.

**Tasks:**

- [x] Disable and remove Pocket integration
- [x] Disable telemetry and data reporting (Telemetry, Health Report, Crash Reporter to Mozilla)
- [x] Disable Firefox Suggest and Mozilla-native AI features
- [x] Disable Mozilla VPN integration (to be replaced by MidoriVPN)
- [x] Disable Firefox Relay and Firefox Accounts (or redirect to Astian services)
- [x] Disable automatic updates pointing to Mozilla servers
- [x] Disable studies and remote experiments (SHIELD / Normandy)
- [x] Full audit of outbound network connections
- [x] Verify all disablements persist across upgrades

> ⚠️ **Security note:** This step requires careful auditing to avoid breaking essential browser functions such as certificate list updates or Safe Browsing.

---

### v11.6.5 — MidoriVPN Basic Integration

> 🟡 **Difficulty: Medium**

**Goal:** Integrate MidoriVPN directly into the browser with a quick-access toolbar button, a connection status indicator, and basic on/off controls.

**Tasks:**

- [ ] Design MidoriVPN icon and toolbar button
- [ ] Implement native MidoriVPN browser component / extension
- [ ] Integrate MidoriVPN API for connection state (connected / disconnected)
- [ ] Popup panel with basic options (on/off, current server)
- [ ] Astian account authentication for MidoriVPN
- [ ] Visual indicator in the URL bar when VPN is active
- [ ] Integration tests on all 3 platforms

---

### v11.7.0 — Custom New Tab

> 🟡 **Difficulty: Medium**

**Goal:** Replace Firefox's default new tab with a fully custom Midori experience: AstianGO search, shortcuts, optional news feed, and customizable backgrounds.

**Tasks:**

- [ ] UI/UX design for the Midori New Tab
- [ ] Implement `about:newtab` override
- [ ] Central search bar integrated with AstianGO
- [ ] Quick access shortcuts (frequent / custom sites)
- [ ] Optional news / feed section (toggleable)
- [ ] Customizable background (solid colors, gradients, or image)
- [ ] Date and time widget
- [ ] New Tab settings (show/hide sections)
- [ ] Optional sync of shortcuts with Astian account

---

### v11.7.1 — Native Ad & Tracker Blocker

> 🟡 **Difficulty: Medium**

**Goal:** Integrate a content blocker natively into Midori's network engine. Unlike an extension, the native blocker delivers better performance and privacy. Compatible with EasyList / EasyPrivacy / uBlock Origin filter lists.

**Tasks:**

- [x] Evaluate and select blocking engine (e.g. adblock-rust, uBlock Origin core)
- [x] Integrate the blocking engine natively into the browser
- [x] Configure default block lists (EasyList, EasyPrivacy, regional lists)
- [x] Implement automatic block list updates
- [x] Design blocker control panel (stats, per-site toggle)
- [x] Toolbar indicator with blocked elements counter
- [x] Per-domain whitelist (allow list) option
- [x] Strict privacy mode (fingerprinting protection, third-party cookie blocking)
- [x] Performance and site compatibility tests

---

### v11.7.2 — Themes for Midori

> 🟡 **Difficulty: Medium**

**Goal:** Build a native theming system for Midori with official Light, Dark, and High Contrast themes, plus support for community-created themes.

**Tasks:**

- [x] Design and implement official Midori Light theme
- [x] Design and implement official Midori Dark theme
- [x] Design and implement High Contrast theme (accessibility)
- [x] Implement CSS variable system for dynamic theming
- [x] Theme selection UI in Settings
- [x] Support for user themes (`.xpi` compatible or Midori-native format)
- [x] Fully decouple Midori theme from the Firefox base theme
- [x] Developer documentation for community theme creation

---

### v11.8.0 — Vertical Sidebar

> 🟠 **Difficulty: Medium–High**

**Goal:** One of Midori's most distinctive features — a vertical tab bar replacing the horizontal one. Greatly improves productivity on widescreen monitors. Requires deep changes to the browser chrome UI (XUL/HTML layer).

**Tasks:**

- [ ] Research Firefox sidebar / vertical tabs implementation (Firefox 132+ vertical tabs)
- [ ] UX design for Midori's vertical sidebar
- [ ] Implement XUL/HTML vertical tab bar component
- [ ] Move tab strip from horizontal to vertical natively
- [ ] Compact and expanded view (icons only vs. title + icon)
- [ ] Drag & drop tabs in the vertical bar
- [ ] Visual tab grouping in the vertical bar
- [ ] Toggle between horizontal and vertical bar in Settings
- [ ] Collapsible sidebar (mini mode — icons only)
- [ ] Performance and extension compatibility tests

---

### v11.8.1 — Performance Profiles

> 🟠 **Difficulty: Medium–High**

**Goal:** A performance profile system that lets users tune the browser to their needs: maximum performance, balanced, or maximum resource savings. Each profile automatically adjusts memory, processes, rendering, and cache settings.

**Tasks:**

- [x] Define configuration parameters for each profile (Performance, Balanced, Eco)
- [x] `High Performance` profile: maximize processes, cache, and pre-rendering
- [x] `Balanced` profile: optimal configuration for general use
- [x] `Eco / Battery Saver` profile: tab suspension, process limits
- [x] Dynamic profile application system (no browser restart required)
- [x] Profile selector UI in toolbar or Settings
- [x] Optional real-time resource monitor (CPU, RAM)
- [x] Hardware detection to suggest the appropriate profile
- [x] Performance benchmarks per profile on all platforms

---

### v11.9.0 — Workspaces

> 🔴 **Difficulty: High**

**Goal:** Workspaces let users organize tabs into independent named groups with custom icons and colors. Lighter than full browser profiles, workspaces are ideal for separating contexts (work, personal, projects) without opening separate windows.

**Tasks:**

- [x] Design Workspaces architecture (storage, tab management, persistence)
- [x] Implement the Workspaces engine in the browser core
- [x] Workspace management UI (create, rename, delete, set icon/color)
- [ ] Integrate Workspaces with the vertical sidebar
- [ ] Quick workspace switcher (keyboard shortcut + button)
- [x] Persist Workspaces across sessions
- [ ] Open workspace in new window or same window option
- [ ] Optional sync of Workspaces with Astian account
- [ ] Export / import workspace configuration
- [x] Stability tests with multiple workspaces and many tabs

---

### v11.9.1 — UI Redesign & Advanced UX

> 🔴 **Difficulty: High**

**Goal:** A full redesign of Midori's user interface to establish a coherent, modern visual identity clearly distinct from Firefox. Covers the toolbar, URL bar, context menus, Settings, and all chrome components.

**Tasks:**

- [ ] Define Midori Design System (colors, typography, spacing, icon set)
- [ ] Redesign the main toolbar
- [ ] Redesign the address bar (URL bar / Awesome Bar)
- [ ] Redesign context menus (right-click) with Midori style
- [ ] Redesign the full Settings page (`about:preferences`)
- [ ] Redesign the Bookmarks manager and UI
- [ ] Redesign the History panel
- [ ] Redesign the Downloads panel
- [ ] Smooth and consistent animations / transitions throughout the UI
- [ ] Accessibility (a11y) review of the entire redesigned interface
- [ ] Usability testing with real users

---

### v11.9.2 — Native Extension Support

> 🔴 **Difficulty: High**

**Goal:** Build a native extension system for Midori Browser. This is the most technically complex feature of the cycle. The system will be compatible with the WebExtensions standard (Firefox/Chrome base) while providing additional Midori-native APIs that expose unique capabilities: MidoriVPN, Workspaces, and Performance Profiles.

**Tasks:**

- [ ] Audit and configure Firefox's WebExtensions system for Midori
- [ ] Implement Midori add-ons store / directory (`midori-addons`)
- [ ] Define and document the Midori Extension API
- [ ] Midori Extension API: Workspaces access
- [ ] Midori Extension API: MidoriVPN access
- [ ] Midori Extension API: Performance Profiles access
- [ ] Redesigned extensions manager (`about:addons` for Midori)
- [ ] Extension permissions and security system
- [ ] Official MidoriVPN extension as the first native Midori extension
- [ ] Developer documentation for Midori extension authors
- [ ] Security and sandboxing tests for extensions

---

### v12.0 — Final Optimizations, QA & Stable Release

> 🔴 **Difficulty: High — Major Milestone**

**Goal:** v12.0 is the cycle's major milestone. No new major features — only consolidation, stabilization, deep optimization, and polish across everything built in previous versions. Includes an intensive QA campaign, bug fixes, and full release preparation.

**Tasks:**

- [ ] Feature freeze — bug fixes and optimizations only
- [ ] Full security audit of all Midori-specific code
- [ ] Browser startup time optimization
- [ ] RAM consumption optimization under normal use
- [ ] Content blocker optimization (minimal page load impact)
- [ ] Full automated regression test suite
- [ ] Public beta: community feedback & critical bug fixes
- [ ] Full accessibility review (WCAG 2.1 AA)
- [ ] End-user documentation: usage guides and v12 changelog
- [ ] Signed installers for Windows, macOS, and Linux
- [ ] Publish to official site, package repos (AUR, Snap, Flatpak, Homebrew)
- [ ] Post-launch: crash monitoring and rapid patch releases (12.0.x)

---

## ⏱ Timeline Estimate

| Version | Estimated Duration | Quarter    |
| ------- | ------------------ | ---------- |
| v11.6.1 | 2–3 weeks          | Q1 2025    |
| v11.6.2 | 3–4 weeks          | Q1 2025    |
| v11.6.3 | 2 weeks            | Q1 2025    |
| v11.6.4 | 3 weeks            | Q2 2025    |
| v11.6.5 | 3–4 weeks          | Q2 2025    |
| v11.7.0 | 3–4 weeks          | Q2 2025    |
| v11.7.1 | 4–5 weeks          | Q3 2025    |
| v11.7.2 | 3 weeks            | Q3 2025    |
| v11.8.0 | 5–6 weeks          | Q3–Q4 2025 |
| v11.8.1 | 4 weeks            | Q4 2025    |
| v11.9.0 | 5–6 weeks          | Q4 2025    |
| v11.9.1 | 7–8 weeks          | Q1 2026    |
| v11.9.2 | 8–10 weeks         | Q1–Q2 2026 |
| v12.0   | 6–8 weeks          | Q2–Q3 2026 |

---

## 🔗 Related Repositories

- **midori-desktop** — [github.com/goastian/midori-desktop](https://github.com/goastian/midori-desktop)
- **Amelia** (upstream Firefox packaging) — [github.com/goastian/amelia](https://github.com/goastian/amelia)

---

## 🤝 Contributing

We welcome contributions from the community! Please check the individual version milestones on GitHub Issues to find tasks you can help with. Before submitting a PR, make sure to read our `CONTRIBUTING.md`.

---

> _Midori Browser is developed by [Astian Inc.](https://astian.org) — Building a more private and open web._
