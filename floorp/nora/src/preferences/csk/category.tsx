/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {} from "../../solid-xul/jsx-runtime";
export function category() {
  return (
    <xul:richlistitem
      id="category-csk"
      class="category"
      value="paneCsk"
      helpTopic="prefs-csk"
      data-l10n-id="category-CSK"
      data-l10n-attrs="tooltiptext"
      align="center"
    >
      <xul:image class="category-icon" />
      <xul:label
        class="category-name"
        flex="1"
        data-l10n-id="category-CSK-title"
      />
    </xul:richlistitem>
  );
}
