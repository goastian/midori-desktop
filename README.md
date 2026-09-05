# Midori Browser

[![Downloads](https://img.shields.io/github/downloads/goastian/midori-desktop/total?label=downloads&logo=github&color=2e7d32)](https://github.com/goastian/midori-desktop/releases)
[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/T5V5269OIA)
[![Telegram](https://img.shields.io/badge/Telegram-Join%20the%20community-26A5E4?style=flat-square&logo=telegram&logoColor=white)]([https://t.me/TU_GRUPO](https://t.me/midoriweb))

<div align="center">
  <a href="https://astian.org/midori-browser">
    <img src="https://astian.org/wp-content/uploads/2026/08/logomidori.webp" alt="Midori Browser Logo">
  </a>
</div>

Midori Browser is a lightweight, fast, and secure browser that promotes user privacy; it has evolved and is now based on the Gecko engine instead of WebKit.

## Contents

- [Features](#features)
- [Install Midori](#install-midori)
- [Build from source](#build-from-source)
- [Project layout](#project-layout)
- [Contributing](#contributing)
- [Documentation and support](#documentation-and-support)
- [License](#license)

## Features

- Privacy-oriented defaults and a built-in protection extension.
- Workspace management and a customized new-tab page.
- Custom branding and update configuration.
- Builds for Linux, macOS, and Windows.
- Compatibility with Firefox WebExtensions.

## Install Midori

### Debian and Ubuntu

```bash
sudo wget -O /etc/apt/trusted.gpg.d/midori-archive-keyring.gpg \
  http://repo.astian.org/midori-archive-keyring.gpg
echo "deb http://repo.astian.org midori main" | \
  sudo tee /etc/apt/sources.list.d/midori.list
sudo apt update
sudo apt install midori
```

For other platforms, download the current installer from the [Midori website](https://astian.org/midori-browser/download).

## Build from source

This repository includes the Firefox-derived engine in `engine/`. Run all commands in this section from the repository root; the root does not contain a `mach` executable. The npm scripts invoke `engine/mach` through Amelia with the required Midori configuration.

The first build downloads toolchains and can take a long time. Reserve at least 50 GB of free disk space; 16 GB of RAM is recommended. Use the Node.js version in `.nvmrc` (currently 22) and Python in `.python-version` (currently 3.11). Rust, Clang, and platform libraries are also required.

### Linux x86_64

Install Node.js 22 and Python 3.11 before continuing. The following is the supported manual development build on Debian or Ubuntu:

```bash
git clone https://github.com/goastian/midori-desktop.git
cd midori-desktop

sudo apt update
sudo apt install -y \
  build-essential libgtk-3-dev libdbus-glib-1-dev libxt-dev \
  libasound2-dev libpulse-dev libpython3-dev libdrm-dev \
  libcurl4-openssl-dev libx11-xcb-dev nasm yasm clang lld llvm curl \
  xauth xvfb

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
. "$HOME/.cargo/env"
node --version
python3.11 --version
rustc --version

npm ci
npm run brand
npm run bootstrap:linux
npm run build:linux-x64
```

The compiled browser is written below `engine/obj-*/dist/bin/midori`. Confirm the output and start it with:

```bash
bash scripts/verify-build-output.sh linux x86_64
npm run browser
```

For an ARM64 Linux build, install `gcc-aarch64-linux-gnu` and `g++-aarch64-linux-gnu`, then run:

```bash
npm run setup:linux-arm64
npm run build:linux-arm64
bash scripts/verify-build-output.sh linux aarch64
```

### macOS

Install Xcode Command Line Tools, Homebrew, Node.js, Python 3.11, and Rust. Then install the additional tools and build for the host architecture:

```bash
xcode-select --install
brew install gnu-tar zstd
npm ci
npm run brand

cd engine
AMELIA_PLATFORM=darwin ./mach --no-interactive bootstrap \
  --application-choice browser --exclude macos-sdk
cd ..

npm run build:mac-arm64  # Apple silicon
# or: npm run build:mac-x64
```

The application is created under `engine/obj-*/dist/Midori.app`. Packaging is optional and requires the signing credentials used by the release process.

### Windows targets

Windows packages are cross-compiled from Linux in the CI workflow. To reproduce that process on a Linux host, install the Linux dependencies listed above plus `msitools`, `dos2unix`, `wine64`, and `xvfb`; then run:

```bash
npm ci
npm run brand
AMELIA_PLATFORM=win32 MIDORI_CROSS_COMPILING=1 npm run bootstrap
npm run setup:windows
npm run build:win-x64
# or: npm run build:win-arm64
```

The executable is placed at `engine/obj-*/dist/bin/midori.exe`. A native Windows development environment is not documented or maintained by this repository; use the cross-compilation workflow above or the release artifacts.

### Package a completed build

Building creates a runnable development binary. Packaging is a separate step and prepares distributable archives. For example, on Linux x86_64:

```bash
npm run package:linux-x64
npm run package:linux-x64-formats
```

The archives and native packages are written to `dist/`. Use the matching `package:<platform>-<architecture>` script for macOS or Windows. Release builds additionally set CI-only environment variables and may require signing keys; do not set `MIDORI_RELEASE` for an ordinary local development build.

### Tests and common recovery commands

```bash
npm test
npm run test:unit
npm run l10n:validate
```

If an engine checkout is missing or incomplete, retrieve and initialize it with `npm run init`. To remove local build output, use `cd engine && ./mach clobber`; the next build will be a clean rebuild.

## Project layout

```
engine/    Firefox-derived source tree and build output
src/       Midori source additions and overrides
configs/   Branding and platform configuration
scripts/   Build, packaging, and validation helpers
tests/     Repository-level tests
```

## Contributing

Before opening a pull request, keep changes focused and run the tests relevant to the files you modified. See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [GitHub Issues](https://github.com/goastian/midori-desktop/issues) for open work.

Do not submit generated build output. For security issues, follow the [security policy](SECURITY.md) when it is available for the branch you are using.

## Documentation and support

- [Midori website](https://astian.org/midori-browser)
- [GitHub Discussions](https://github.com/goastian/midori-desktop/discussions)
- [Report a bug](https://github.com/goastian/midori-desktop/issues/new?labels=bug)
- [Astian community](https://astian.org/community/)

## License

Midori Browser is licensed under the [Mozilla Public License 2.0](LICENSE). Midori is based on Mozilla Firefox but is not affiliated with Mozilla.

## Star History

[![Star History Chart](https://star-history.dera.page/svg?repos=goastian/midori-desktop&type=Date)](https://star-history.dera.page/#goastian/midori-desktop&Date)
