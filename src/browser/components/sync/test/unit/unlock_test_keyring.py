# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import re
import sys

from gi.repository import Gio, GLib

root = os.environ.get("MIDORI_SYNC_TEST_KEYRING_ROOT", "")
if not re.fullmatch(r"/tmp/midori-sync-native-[A-Za-z0-9]+", root):
    raise RuntimeError("Use the isolated native test launcher")
if os.environ.get("XDG_DATA_HOME") != root + "/data":
    raise RuntimeError("The keyring must use the private test data directory")
if len(sys.argv) != 2 or not re.fullmatch(
    r"/org/freedesktop/secrets/collection/[A-Za-z0-9_/]+", sys.argv[1]
):
    raise RuntimeError("Invalid private collection")
password = sys.stdin.buffer.read(256)
if password != b"public synthetic keyring test password\n":
    raise RuntimeError("Only the public fixture password is accepted")

bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
service = "/org/freedesktop/secrets"


def call(path, interface, method, parameters):
    return bus.call_sync(
        "org.freedesktop.secrets",
        path,
        interface,
        method,
        parameters,
        None,
        Gio.DBusCallFlags.NONE,
        5000,
        None,
    )


session = call(
    service,
    "org.freedesktop.Secret.Service",
    "OpenSession",
    GLib.Variant("(sv)", ("plain", GLib.Variant("s", ""))),
).unpack()[1]
try:
    call(
        service,
        "org.gnome.keyring.InternalUnsupportedGuiltRiddenInterface",
        "UnlockWithMasterPassword",
        GLib.Variant(
            "(o(oayays))",
            (sys.argv[1], (session, [], list(password), "text/plain")),
        ),
    )
finally:
    call(session, "org.freedesktop.Secret.Session", "Close", None)
