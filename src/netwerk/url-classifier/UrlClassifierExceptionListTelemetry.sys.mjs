/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export function recordExceptionListTelemetry() {
  const baseline = Services.prefs.getBoolPref(
    "privacy.trackingprotection.allow_list.baseline.enabled"
  );
  const convenience = Services.prefs.getBoolPref(
    "privacy.trackingprotection.allow_list.convenience.enabled"
  );
  Glean.contentblocking.tpAllowlistBaselineEnabled.set(baseline);
  // If baseline is false, having convenience as true has no effect, so we treat it as false.
  Glean.contentblocking.tpAllowlistConvenienceEnabled.set(
    baseline ? convenience : false
  );
}

export function UrlClassifierExceptionListTelemetry() {}

UrlClassifierExceptionListTelemetry.prototype = {
  classID: Components.ID("{90251c04-1d0e-49f0-bded-f129d92850b2}"),
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),

  observe(subject, topic) {
    if (topic === "idle-daily") {
      recordExceptionListTelemetry();
    }
  },
};
