# Flatpak packaging source of truth

`midori-desktop` owns the Flatpak build metadata that Flathub expects to come
from upstream:

- `org.astian.midori_browser.desktop`
- `org.astian.midori_browser.metainfo.xml`
- exported icons from `configs/branding/release/`
- install logic in `scripts/flatpak-build-package.sh`

The companion repository `goastian/org.astian.midori_browser` is only a staging
and backup repository for the Flathub manifest. Keep it minimal:

- `org.astian.midori_browser.yml`
- `generated-sources.json` when npm offline sources are required
- optional `flathub.json` only when Flathub-specific configuration is needed

Do not duplicate the desktop file, metainfo, icons, or other upstream assets in
the packaging repository. The manifest should consume the source tarball
published by `midori-desktop` releases and let the upstream build install those
files into the Flatpak.
