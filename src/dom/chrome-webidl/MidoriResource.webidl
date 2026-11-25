/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

dictionary MidoriManagedCpuBudget {
  boolean backendReady = false;
  boolean applied = false;
  unsigned long nativeError = 0;
  unsigned long requestedPercentage = 0;
  double externalCapacityCpus = 0;
  double ownQuotaCpus = 0;
  double effectiveCapacityCpus = 0;
  double quotaQuantumCpus = 0;
};

dictionary MidoriManagedMemoryBudget {
  boolean backendReady = false;
  boolean applied = false;
  boolean ownedLimit = false;
  boolean hasLimit = false;
  boolean hasExternalLimit = false;
  boolean hasEffectiveLimit = false;
  boolean swapMeasured = false;
  boolean roleAccountingMeasured = false;
  unsigned long nativeError = 0;
  unsigned long roleAccountingError = 0;
  unsigned long long requestedBytes = 0;
  unsigned long long currentBytes = 0;
  unsigned long long uiBytes = 0;
  unsigned long long contentBytes = 0;
  unsigned long long unattributedBytes = 0;
  unsigned long long limitBytes = 0;
  unsigned long long externalLimitBytes = 0;
  unsigned long long effectiveLimitBytes = 0;
  unsigned long long swapBytes = 0;
  unsigned long long recoveryHeadroomBytes = 0;
  unsigned long long minimumBytes = 0;
  unsigned long long oomEvents = 0;
  unsigned long long oomKills = 0;
  unsigned long long maxEvents = 0;
};
