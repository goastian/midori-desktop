# Firefox Mod Blur integration notes

Midori's Blur modules are a selective adaptation of
[Firefox-Mod-Blur](https://github.com/datguypiko/Firefox-Mod-Blur), not a
verbatim import.

- Audited snapshot: `8860f7d38cf6ea1f0eea58bee521cfd5cf897c27`
- Snapshot date: 2026-08-21
- Upstream target at that snapshot: Firefox 152
- Midori target during this audit: Firefox 154

The browser chrome implementation maps upstream behavior to namespaced
`midori.modblur.*` preferences and current Midori/Firefox selectors. Security
warnings, active permissions, keyboard focus, high-contrast rendering, reduced
motion, and reduced transparency take precedence over decorative hiding or
blur.

The bundled `noise-512x512.png`, `spill.svg`, and `spill-light.svg` assets match
the audited upstream files byte-for-byte. The New Tab variants
`spill-main.svg` and `spill-main-light.svg` preserve the audited snapshot's
geometry and colors. Grain and Acrylic controls are Midori extensions; the
upstream snapshot contains the noise asset but does not enable it from its CSS.

New Tab styles are packaged as `resource:///modules/midori-newtab-modblur.css`
and registered as a privileged user sheet. `scripts/download-addons.sh` marks
only the bundled Midori New Tab document, while the stylesheet also restricts
itself to `moz-extension://` URLs. This is required because `-moz-pref()` is not
enabled in a normal extension author sheet. The rules target stable semantic
classes including `speed-dial-*`, `bookmark-grid`, and `widget-card__surface`;
tests must be updated if the add-on changes those class contracts.

Panel blur intentionally follows upstream's supported-popup allow-list and
disables popup entrance animation to avoid exposing the compositor's gray
paint phase. Wallpaper blur uses a pseudo-element backdrop rather than
filtering and scaling the image itself.

The audited upstream snapshot has no `LICENSE` or `COPYING` file. Do not label
this adaptation as an exact or relicensed copy, and confirm distribution terms
with the upstream author before importing substantial blocks verbatim.
