/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

[GenerateConversionToJS]
dictionary ManagedMediaObservation {
  unsigned long ordinal = 0;
  unsigned long kind = 0;
  UTF8String context = "";
  unsigned long rtp = 0;
  unsigned long rawRtp = 0;
  unsigned long ssrc = 0;
  unsigned long sourceCode = 0;
  unsigned long producer = 0;
  unsigned long frame = 0;
  unsigned long long paint = 0;
  double observed = 0;
  double presented = -1;
  boolean valid = true;
};

[GenerateConversionToJS]
dictionary ManagedMediaObservationResult {
  unsigned long long processId = 0;
  unsigned long long generation = 0;
  unsigned long capacity = 0;
  double started = 0;
  double finished = 0;
  double documentOrigin = 0;
  UTF8String container = "";
  boolean truncated = false;
  boolean expired = false;
  sequence<ManagedMediaObservation> entries = [];
};
