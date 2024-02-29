## Welcome to Midori Browser Github Repository 👋

[![CircleCI](https://circleci.com/gh/midori-browser/core.svg?style=svg)](https://circleci.com/gh/midori-browser/core)
[![Telegram](https://img.shields.io/badge/Telegram-Chat-gray.svg?style=flat&logo=telegram&colorA=5583a4&logoColor=fff)](https://t.me/midoriweb)
[![Twitter](https://img.shields.io/twitter/follow/midoriweb.svg?style=social&label=Follow)](https://twitter.com/grupoastian)
[![Donate](https://img.shields.io/badge/Stripe-Donate-gray.svg?style=flat&logo=stripe&colorA=0071bb&logoColor=fff)](https://donate.stripe.com/00g6s675Xawl6ZO9AH)
[![Patreon](https://img.shields.io/badge/PATREON-Pledge-red.svg)](https://www.patreon.com/midori_browser)
[![build result](https://build.opensuse.org/projects/home:ponchale1/packages/midori-browser/badge.svg?type=default)](https://build.opensuse.org/package/show/home:ponchale1/midori-browser)

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/goastian/midori-desktop">
    <img src="https://astian.org/wp-content/uploads/2023/09/Midori-Claro-ImagoTipo-300x84.png" alt="Logo" width="300" height="84">
  </a>

  <h3 align="center">Midori Browser </h3>

  <p align="center">
       Midori initially uses the Gecko/Firefox code under the Floorp Browser project. Both Midori and Floorp projects are collaborating to improve and offer an exceptional user experience, with significant differences. Later, as updates are released, the original code will be differentiated. , but both projects will continue to collaborate
    <br />
    <br />
    <a href="https://astian.org/midori-browser">Official Site</a>
    ・
    <a href="#📥-download--📦-install">Download</a>
    ・
    <a href="https://astian.org/midori-en">Blog & Release Notes</a>
    ・
    <a href="https://astian.org/community">Official Support Site & Send feedback</a>
  </p>
</div>


## ⚡ Get Started


### 💻 Supported Operating Systems & Requirements

Midori Browser is available for Windows, macOS, and Linux. You can install it by running the installer or by extracting the archive.

#### Windows

- Windows 10 or later. (Windows 7 and 8 are not supported)

- x86_64 CPU architecture. AArch64 is supported for Linux & Windows.

- Midori provides "exe" installer & "Winget" install.

**Midori is in the process of obtaining a license to sign  Certum Open Source Code Signing Certificate. The official Midori installer is signed by "Open Source Developer, Astian, Inc". However, the installer for the Daylight build is not signed.**


#### macOS

- macOS 10.12 or later.

- x86_64 CPU & ARM64 CPU architecture. Midori provides a Universal build for both architectures.

**Midori is in the process of obtaining Apple certification. This means that you can install Midori without any warning messages. Additionally, Midori now includes an auto-update system.**

#### Linux

- Debian-based distributions (such as Ubuntu and Linux Mint) and Arch-based distributions (such as Manjaro) are supported.

- x86_64 & AAarch64 CPU architecture.

- Midori Browser Requirements: ["Firefox Linux Requirements"](https://www.mozilla.org/en-US/firefox/115.0beta/system-requirements/#gnulinux)


### 📥 Download & 📦 Install

You can download the latest version of Midori Browser from the official website: [Astian.org](https://astian.org/midori-browser/download) or from the [Github Releases](https://github.com/goastian/midori-desktop/releases) page.

Linux (Debian, xUbuntu, Mint)
sudo wget -O /etc/apt/trusted.gpg.d/midori-archive-keyring.gpg http://repo.astian.org/midori-archive-keyring.gpg && echo "deb http://repo.astian.org midori main" | sudo tee /etc/apt/sources.list.d/midori.list
  - sudo apt update
  - Run: sudo apt install ./midori_<version>_amd64.deb

---

## 📖 Documentation

### 📝 License

[Mozilla Public License 2.0](https://www.mozilla.org/en-US/MPL/2.0/)

- Midori Browser's name is a registered trademark of Astian, Inc developer, and Midori logo is protected by copyright

- Midori Browser is based on Mozilla Firefox. Midori Browser is not affiliated with Mozilla, Mozilla Firefox.

### 📧 Contact

- [Official Support Site](https://astian.org/community)

- [Official Astian Twitter](https://twitter.com/grupoastian)

- [Official Midori Community Telegram](https://t.me/midoriweb)

### Contribute

You can contribute through a donation on our website. We recommend that you first read our manifesto and then donate here we leave you the links
- [Manifest](https://astian.org/community/midori-browser/donations-for-midori-please/)
- [Donate](https://astian.org/midori-browser/donate-to-midori/)
- Midori on Open collective(https://opencollective.com/midori-browser)

### 📜 Privacy Policy

- [Astian Privacy Policy](https://astian.org/astian-privacy-policies/)

---

## 🌟 Contributing

### 🧰 Writing Code

See [Development](https://github.com/goastian/midori-desktop/wiki)

### 📝 Translating

- We want to support as many languages as possible. If you want to translate Midori Browser, please clone the [l10n-central](https://github.com/goastian/l10n-central/) repository.

- English is the main language. If you want to translate Midori Browser, please translate from English (en-US)

- Midori's English file is located in the [Midori-Strings]() repository.

### 🐛 Reporting Bugs

- If you find a bug, please report it to the [Issues](https://github.com/goastian/l10n-central/issues) page or using [Official Support Site](https://astian.org/community/midori-browser).
