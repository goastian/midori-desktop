#!/usr/bin/env bash

set -euo pipefail

arch="${1:?usage: package-linux.sh <x86_64|aarch64> [version]}"
version="${2:-$(node -p \"require('./amelia.json').brands.release.release.displayVersion\")}"
dist_dir="${DIST_DIR:-$PWD/dist}"
app_name="midori"
app_id="org.astian.midori_browser"

case "$arch" in
  x86_64)
    deb_arch="amd64"
    rpm_arch="x86_64"
    archive_pattern='midori-*.linux-x86_64.tar.xz'
    ;;
  aarch64)
    deb_arch="arm64"
    rpm_arch="aarch64"
    archive_pattern='midori-*.linux-aarch64.tar.xz'
    ;;
  *)
    echo "Unsupported Linux architecture: $arch" >&2
    exit 2
    ;;
esac

archive="$(find "$dist_dir" -maxdepth 1 -type f -name "$archive_pattern" -print -quit)"
if [[ -z "$archive" ]]; then
  echo "Linux archive not found for $arch in $dist_dir" >&2
  exit 1
fi

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
package_root="$work_dir/package-root"
payload_dir="$work_dir/payload"

mkdir -p "$payload_dir"
tar -xJf "$archive" -C "$payload_dir"

payload_app="$(find "$payload_dir" -mindepth 1 -maxdepth 1 -type d -print -quit)"
if [[ -z "$payload_app" || ! -x "$payload_app/midori" ]]; then
  echo "The archive does not contain an executable Midori application" >&2
  exit 1
fi

install -d "$package_root/usr/lib/$app_name" \
  "$package_root/usr/bin" \
  "$package_root/usr/share/applications" \
  "$package_root/usr/share/icons/hicolor/512x512/apps" \
  "$package_root/usr/share/doc/$app_name"
cp -a "$payload_app/." "$package_root/usr/lib/$app_name/"
ln -s ../lib/$app_name/midori "$package_root/usr/bin/midori"
install -m 0644 LICENSE "$package_root/usr/share/doc/$app_name/copyright"
install -m 0644 configs/branding/release/logo512.png \
  "$package_root/usr/share/icons/hicolor/512x512/apps/$app_id.png"

cat > "$package_root/usr/share/applications/$app_id.desktop" <<EOF
[Desktop Entry]
Name=Midori Browser
Comment=A privacy-focused browser by Astian
Exec=midori %u
Icon=$app_id
Type=Application
Categories=Network;WebBrowser;
MimeType=text/html;text/xml;application/xhtml+xml;x-scheme-handler/http;x-scheme-handler/https;application/pdf;
StartupNotify=true
EOF

deb_root="$work_dir/deb"
mkdir -p "$deb_root/DEBIAN"
cp -a "$package_root/." "$deb_root/"
cat > "$deb_root/DEBIAN/control" <<EOF
Package: $app_name
Version: $version
Section: web
Priority: optional
Architecture: $deb_arch
Maintainer: Astian, Inc. <support@astian.org>
Depends: libasound2, libdbus-glib-1-2, libgtk-3-0, libnss3, libpulse0, libxt6
Description: Midori Browser
 A privacy-focused web browser by Astian.
EOF
dpkg-deb --root-owner-group --build "$deb_root" \
  "$dist_dir/${app_name}-${version}-linux-${arch}.deb"

rpm_topdir="$work_dir/rpmbuild"
mkdir -p "$rpm_topdir"/{BUILD,BUILDROOT,RPMS,SOURCES,SPECS,SRPMS}
source_dir="$work_dir/${app_name}-${version}"
cp -a "$package_root" "$source_dir"
tar -C "$work_dir" -czf "$rpm_topdir/SOURCES/${app_name}-${version}.tar.gz" \
  "${app_name}-${version}"
cat > "$rpm_topdir/SPECS/$app_name.spec" <<EOF
Name:           $app_name
Version:        $version
Release:        1%{?dist}
Summary:        Midori Browser
License:        MPL-2.0
URL:            https://astian.org/midori-en
Source0:        %{name}-%{version}.tar.gz
BuildArch:      $rpm_arch
Requires:       gtk3, nss, pulseaudio-libs

%description
Midori is a privacy-focused web browser by Astian.

%prep
%setup -q

%install
rm -rf %{buildroot}
cp -a . %{buildroot}

%files
/usr
EOF
rpmbuild --define "_topdir $rpm_topdir" --target "$rpm_arch" -bb \
  "$rpm_topdir/SPECS/$app_name.spec"
find "$rpm_topdir/RPMS" -type f -name '*.rpm' -exec cp {} "$dist_dir/${app_name}-${version}-linux-${arch}.rpm" \;

echo "Created $dist_dir/${app_name}-${version}-linux-${arch}.deb"
echo "Created $dist_dir/${app_name}-${version}-linux-${arch}.rpm"
