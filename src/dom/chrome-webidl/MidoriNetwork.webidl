/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

[GenerateConversionToJS]
dictionary MidoriManagedSocketUsage {
  required unsigned long long processId;
  required unsigned long long sent;
  required unsigned long long received;
  DOMString scope = "socket-transport-service";
};
