/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MidoriBlockerService } = ChromeUtils.importESModule(
  "resource:///modules/MidoriBlockerService.sys.mjs"
);

const PREF_ENABLED_LISTS = "midori.blocker.enabledLists";
const PREF_RS_POLL_INTERVAL_SECONDS = "services.settings.poll_interval";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const CATEGORY_ORDER = [
  "core",
  "privacy",
  "annoyances",
  "optional",
  "regional",
];
const EXPANDED_BY_DEFAULT = new Set(["core", "privacy", "annoyances"]);

const CATEGORY_LABELS = Object.freeze({
  annoyances: "Annoyances",
  core: "Default",
  optional: "Optional",
  privacy: "Privacy",
  regional: "Regional",
});

const CATEGORY_L10N_IDS = Object.freeze({
  annoyances: "midori-blocker-filter-lists-category-annoyances",
  core: "midori-blocker-filter-lists-category-core",
  optional: "midori-blocker-filter-lists-category-optional",
  privacy: "midori-blocker-filter-lists-category-privacy",
  regional: "midori-blocker-filter-lists-category-regional",
});

function setLabelL10nAttributes(element, l10nId, args = null) {
  if (!element || !l10nId) {
    return;
  }

  document.l10n.setAttributes(element, l10nId, args || undefined);
}

function getCategoryKey(category) {
  const key = String(category || "")
    .trim()
    .toLowerCase();
  return key || "optional";
}

function getCategoryLabelInfo(category) {
  const key = getCategoryKey(category);
  if (Object.hasOwn(CATEGORY_LABELS, key)) {
    return {
      fallback: CATEGORY_LABELS[key],
      l10nId: CATEGORY_L10N_IDS[key],
    };
  }

  return {
    fallback: key
      .split(/[-_ ]+/)
      .filter(Boolean)
      .map(part => part[0].toUpperCase() + part.slice(1))
      .join(" "),
    l10nId: "",
  };
}

function getCategorySortIndex(category) {
  const key = getCategoryKey(category);
  const index = CATEGORY_ORDER.indexOf(key);
  return index === -1 ? 999 : index;
}

function createXULElement(tag, attrs = {}) {
  const element = document.createXULElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) {
      element.setAttribute(name, value);
    }
  }
  return element;
}

/**
 * Loads list metadata from `MidoriBlockerService`, renders category sections
 * with toggles for each list, and saves state overrides when the dialog is
 * accepted.
 */
var gMidoriBlockerFilterListsManager = {
  _categorySections: new Map(),
  _entries: [],
  _prefLocked: false,

  onLoad() {
    this._initialise().catch(err => {
      console.error(
        "[MidoriBlocker] Failed to initialise filter list dialog:",
        err
      );
    });
  },

  async _initialise() {
    this._categoriesContainer = document.getElementById(
      "midoriBlockerFilterListsCategories"
    );

    this._prefLocked = Services.prefs.prefIsLocked(PREF_ENABLED_LISTS);
    const acceptButton = document
      .getElementById("midoriBlockerFilterListsDialog")
      .getButton("accept");
    acceptButton.disabled = this._prefLocked;

    this._entries = await this._loadEntries();
    this._metadata = await this._loadMetadata();
    this._buildSections();
    this._initToolbar();
    this._initSearch();
    this._updateNextRefreshLabel();
  },

  async _loadEntries() {
    let catalog = [];
    try {
      catalog = await MidoriBlockerService.getFilterListCatalog();
    } catch (err) {
      console.error("[MidoriBlocker] Failed to load filter lists:", err);
    }

    if (!Array.isArray(catalog)) {
      return [];
    }

    return catalog
      .map(entry => ({
        category: getCategoryKey(entry.category),
        defaultEnabled: !!entry.defaultEnabled,
        enabled: !!entry.enabled,
        id: String(entry.id || ""),
        sourceUrl: String(entry.sources?.[0]?.url || ""),
        sourceUrls: (entry.sources || []).map(s => s.url).filter(Boolean),
        title: String(entry.title || entry.id || ""),
      }))
      .filter(entry => !!entry.id)
      .sort((a, b) => {
        const aIndex = getCategorySortIndex(a.category);
        const bIndex = getCategorySortIndex(b.category);
        if (aIndex !== bIndex) {
          return aIndex - bIndex;
        }

        if (a.category !== b.category) {
          return a.category.localeCompare(b.category);
        }

        return a.title.localeCompare(b.title);
      });
  },

  _buildSections() {
    this._categoriesContainer.replaceChildren();
    this._categorySections.clear();

    if (!this._entries.length) {
      const emptyLabel = createXULElement("label");
      setLabelL10nAttributes(
        emptyLabel,
        "midori-blocker-filter-lists-empty-state"
      );
      this._categoriesContainer.appendChild(emptyLabel);
      return;
    }

    const grouped = new Map();
    for (const entry of this._entries) {
      if (!grouped.has(entry.category)) {
        grouped.set(entry.category, []);
      }
      grouped.get(entry.category).push(entry);
    }

    const unknownCategories = [...grouped.keys()]
      .filter(category => !CATEGORY_ORDER.includes(category))
      .sort();
    const orderedCategories = [...CATEGORY_ORDER, ...unknownCategories];

    for (const category of orderedCategories) {
      const entries = grouped.get(category);
      if (!entries?.length) {
        continue;
      }

      const section = this._buildCategorySection(category, entries);
      this._categorySections.set(category, section);
      this._categoriesContainer.appendChild(section.container);
      this._updateCategoryCounter(category);
    }
  },

  _buildCategorySection(category, entries) {
    const container = createXULElement("vbox", {
      class: "midori-blocker-category",
    });

    const header = createXULElement("hbox", {
      align: "center",
      "aria-expanded": "false",
      class: "midori-blocker-category-header",
      role: "button",
      tabindex: "0",
    });

    const twisty = createXULElement("image", {
      class: "twisty",
    });
    header.appendChild(twisty);

    const categoryLabelInfo = getCategoryLabelInfo(category);
    const categoryLabel = createXULElement("label", {
      class: "midori-blocker-category-title",
    });
    if (categoryLabelInfo.l10nId) {
      setLabelL10nAttributes(categoryLabel, categoryLabelInfo.l10nId);
    } else {
      categoryLabel.setAttribute("value", categoryLabelInfo.fallback);
    }
    header.appendChild(categoryLabel);

    const counterLabel = createXULElement("label", {
      class: "text-deemphasized midori-blocker-category-counter",
      value: "0/0",
    });
    header.appendChild(counterLabel);

    const headerSpacer = createXULElement("spacer", {
      flex: "1",
    });
    header.appendChild(headerSpacer);

    container.appendChild(header);

    const listContainer = createXULElement("vbox", {
      class: "midori-blocker-category-lists",
    });
    container.appendChild(listContainer);

    for (const entry of entries) {
      const row = createXULElement("hbox", {
        align: "center",
        class: "midori-blocker-list-row",
      });

      const textColumn = createXULElement("vbox", {
        flex: "1",
      });

      const titleRow = createXULElement("hbox", {
        align: "center",
      });
      const titleLabel = createXULElement("label", {
        value: entry.title,
      });
      titleRow.appendChild(titleLabel);

      if (entry.sourceUrl) {
        const linkIcon = createXULElement("image", {
          class: "midori-blocker-list-link-icon",
          tooltiptext: entry.sourceUrl,
        });
        linkIcon.addEventListener("click", () => {
          const win = Services.wm.getMostRecentWindow("navigator:browser");
          win?.openWebLinkIn(entry.sourceUrl, "tab");
        });
        titleRow.appendChild(linkIcon);
      }
      textColumn.appendChild(titleRow);

      const lastUpdatedLabel = createXULElement("label", {
        class: "text-deemphasized midori-blocker-list-updated",
      });
      const metaEntry = this._getMetadataForEntry(entry);
      this._setLastUpdatedText(lastUpdatedLabel, metaEntry);
      textColumn.appendChild(lastUpdatedLabel);
      entry._lastUpdatedLabel = lastUpdatedLabel;

      row.appendChild(textColumn);

      const toggle = createXULElement("checkbox");
      toggle.checked = !!entry.enabled;
      toggle.disabled = this._prefLocked;
      toggle.addEventListener("command", () => {
        entry.enabled = !!toggle.checked;
        this._updateCategoryCounter(category);
      });
      row.appendChild(toggle);
      entry._row = row;
      entry._toggle = toggle;

      listContainer.appendChild(row);
    }

    const section = {
      container,
      counterLabel,
      entries,
      header,
      listContainer,
      twisty,
    };

    const expanded = EXPANDED_BY_DEFAULT.has(category);
    this._setSectionExpanded(section, expanded);

    const onToggle = () => {
      const nextExpanded = listContainer.hasAttribute("hidden");
      this._setSectionExpanded(section, nextExpanded);
    };

    header.addEventListener("click", onToggle);
    header.addEventListener("keypress", event => {
      if (event.key === " " || event.key === "Enter") {
        onToggle();
        event.preventDefault();
      }
    });

    return section;
  },

  _setSectionExpanded(section, expanded) {
    section.listContainer.toggleAttribute("collapsed", !expanded);
    section.listContainer.toggleAttribute("hidden", !expanded);
    section.listContainer.style.display = expanded ? "" : "none";
    section.header.setAttribute("aria-expanded", String(expanded));
    section.twisty.classList.toggle("open", expanded);
  },

  _updateCategoryCounter(category) {
    const section = this._categorySections.get(category);
    if (!section) {
      return;
    }

    const totalCount = section.entries.length;
    const enabledCount = section.entries.filter(
      entry => !!entry.enabled
    ).length;
    section.counterLabel.setAttribute("value", `${enabledCount}/${totalCount}`);
  },

  async _loadMetadata() {
    try {
      const metaList = await MidoriBlockerService.getFilterListMetadata();
      return new Map(metaList.map(m => [m.url, m]));
    } catch (err) {
      console.error("[MidoriBlocker] Failed to load metadata:", err);
      return new Map();
    }
  },

  _initToolbar() {
    const refreshButton = document.getElementById("midoriBlockerRefreshNow");
    refreshButton.addEventListener("command", () => this._onRefreshNow());
    const restoreButton = document.getElementById(
      "midoriBlockerRestoreDefaults"
    );
    restoreButton.disabled = this._prefLocked;
    restoreButton.addEventListener("command", () => this._restoreDefaults());
  },

  _restoreDefaults() {
    if (this._prefLocked) {
      return;
    }
    for (const entry of this._entries) {
      entry.enabled = entry.defaultEnabled;
      if (entry._toggle) {
        entry._toggle.checked = entry.defaultEnabled;
      }
    }
    for (const category of this._categorySections.keys()) {
      this._updateCategoryCounter(category);
    }
  },

  _initSearch() {
    const input = document.getElementById("midoriBlockerFilterListsSearch");
    input.addEventListener("input", () => this._filterBySearch(input.value));
  },

  _filterBySearch(query) {
    const terms = query.toLowerCase().trim();

    for (const entry of this._entries) {
      if (!entry._row) {
        continue;
      }
      const match = !terms || entry.title.toLowerCase().includes(terms);
      entry._row.style.display = match ? "" : "none";
    }

    for (const [, section] of this._categorySections) {
      const visibleCount = section.entries.filter(
        e => e._row && e._row.style.display !== "none"
      ).length;
      section.container.style.display = visibleCount ? "" : "none";

      if (terms && visibleCount) {
        this._setSectionExpanded(section, true);
      }
    }
  },

  async _onRefreshNow() {
    const button = document.getElementById("midoriBlockerRefreshNow");
    button.disabled = true;

    try {
      await MidoriBlockerService.refreshListsAndEngine({ forceUpdate: true });
      this._metadata = await this._loadMetadata();
      this._updateAllLastUpdatedLabels();
      this._updateNextRefreshLabel();
    } catch (err) {
      console.error("[MidoriBlocker] Manual refresh failed:", err);
    } finally {
      button.disabled = false;
    }
  },

  _updateNextRefreshLabel() {
    const label = document.getElementById("midoriBlockerNextRefresh");
    if (!label) {
      return;
    }

    const intervalMs =
      Services.prefs.getIntPref(PREF_RS_POLL_INTERVAL_SECONDS, 86400) * 1000;

    let nextRefreshMs = 0;
    if (this._metadata?.size) {
      for (const meta of this._metadata.values()) {
        const lastFetched = Number(meta?.lastFetched || 0);
        const candidate = Number(
          meta?.nextAttempt || (lastFetched ? lastFetched + intervalMs : 0)
        );
        if (candidate && (!nextRefreshMs || candidate < nextRefreshMs)) {
          nextRefreshMs = candidate;
        }
      }
    }

    if (nextRefreshMs) {
      setLabelL10nAttributes(
        label,
        "midori-blocker-filter-lists-next-refresh",
        { date: DATE_FORMATTER.format(new Date(nextRefreshMs)) }
      );
    } else {
      setLabelL10nAttributes(
        label,
        "midori-blocker-filter-lists-next-refresh-unknown"
      );
    }
  },

  _getMetadataForEntry(entry) {
    if (!this._metadata || !entry.sourceUrls) {
      return null;
    }
    for (const url of entry.sourceUrls) {
      const meta = this._metadata.get(url);
      if (meta) {
        return meta;
      }
    }
    return null;
  },

  _setLastUpdatedText(label, metaEntry) {
    if (metaEntry?.lastError) {
      const attemptedAt = Number(metaEntry.lastAttempt || 0);
      const attemptedText = attemptedAt
        ? DATE_FORMATTER.format(new Date(attemptedAt))
        : "last attempt";
      const errorText = String(metaEntry.lastError).trim();

      let text = `Update failed ${attemptedText}`;
      if (errorText) {
        text += `: ${errorText}`;
      }

      if (metaEntry.lastFetched) {
        text += ` · Last successful ${DATE_FORMATTER.format(
          new Date(metaEntry.lastFetched)
        )}`;
      }

      label.removeAttribute("data-l10n-id");
      label.setAttribute("value", text);
      return;
    }

    if (!metaEntry?.lastFetched) {
      setLabelL10nAttributes(
        label,
        "midori-blocker-filter-lists-never-updated"
      );
      return;
    }

    const text = `Updated ${DATE_FORMATTER.format(new Date(metaEntry.lastFetched))}`;
    label.removeAttribute("data-l10n-id");
    label.setAttribute("value", text);
  },

  _updateAllLastUpdatedLabels() {
    for (const entry of this._entries) {
      if (!entry._lastUpdatedLabel) {
        continue;
      }
      this._setLastUpdatedText(
        entry._lastUpdatedLabel,
        this._getMetadataForEntry(entry)
      );
    }
  },

  onDialogAccept() {
    if (this._prefLocked) {
      return true;
    }

    const nextState = {};
    for (const entry of this._entries) {
      if (!!entry.enabled !== !!entry.defaultEnabled) {
        nextState[entry.id] = !!entry.enabled;
      }
    }

    Services.prefs.setStringPref(PREF_ENABLED_LISTS, JSON.stringify(nextState));
    return true;
  },

  onDialogCancel() {
    return true;
  },
};

document.addEventListener("DOMContentLoaded", () => {
  gMidoriBlockerFilterListsManager.onLoad();
});

document.addEventListener("dialogaccept", event => {
  if (!gMidoriBlockerFilterListsManager.onDialogAccept()) {
    event.preventDefault();
  }
});

document.addEventListener("dialogcancel", event => {
  if (!gMidoriBlockerFilterListsManager.onDialogCancel()) {
    event.preventDefault();
  }
});
