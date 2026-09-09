/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {
  MAX_CUSTOM_FILTERS_BYTES,
  MidoriBlockerService,
  normalizeCustomFiltersText,
} = ChromeUtils.importESModule(
  "resource:///modules/MidoriBlockerService.sys.mjs"
);

const CUSTOM_FILTERS_DEFAULT_FILE_NAME = "midori-custom-filters.txt";

function countActiveFilters(text) {
  let count = 0;

  for (const line of String(text || "").split("\n")) {
    const rule = line.trim();
    if (!rule || rule.startsWith("!") || rule.startsWith("[")) {
      continue;
    }
    count++;
  }

  return count;
}

async function formatValue(id, fallback, args = undefined) {
  try {
    const value = await document.l10n?.formatValue(id, args);
    return value && value !== id ? value : fallback;
  } catch (_) {
    return fallback;
  }
}

async function showAlert(titleId, titleFallback, messageId, messageFallback) {
  const [title, message] = await Promise.all([
    formatValue(titleId, titleFallback),
    formatValue(messageId, messageFallback),
  ]);
  Services.prompt.alert(window, title, message);
}

function openFilePicker(mode, title) {
  return new Promise(resolve => {
    const picker = Cc["@mozilla.org/filepicker;1"].createInstance(
      Ci.nsIFilePicker
    );
    picker.init(window.browsingContext, title, mode);
    picker.appendFilters(
      Ci.nsIFilePicker.filterText | Ci.nsIFilePicker.filterAll
    );

    if (mode === Ci.nsIFilePicker.modeSave) {
      picker.defaultString = CUSTOM_FILTERS_DEFAULT_FILE_NAME;
      picker.defaultExtension = "txt";
    }

    picker.open(result => {
      if (
        result === Ci.nsIFilePicker.returnOK ||
        result === Ci.nsIFilePicker.returnReplace
      ) {
        resolve(picker.file?.path || "");
        return;
      }

      resolve("");
    });
  });
}

var gMidoriBlockerCustomFilters = {
  _acceptButton: null,
  _dialog: null,
  _exportButton: null,
  _enabledCheckbox: null,
  _initialEnabled: true,
  _importButton: null,
  _initialText: "",
  _loadFailed: false,
  _saving: false,
  _status: null,
  _statusUpdateGeneration: 0,
  _textarea: null,

  async init() {
    this._dialog = document.getElementById("customFiltersDialog");
    this._textarea = document.getElementById(
      "midoriBlockerCustomFiltersText"
    );
    this._status = document.getElementById(
      "midoriBlockerCustomFiltersStatus"
    );
    this._importButton = document.getElementById(
      "midoriBlockerCustomFiltersImport"
    );
    this._exportButton = document.getElementById(
      "midoriBlockerCustomFiltersExport"
    );
    this._enabledCheckbox = document.getElementById(
      "midoriBlockerCustomFiltersEnabled"
    );
    this._acceptButton = this._dialog?.getButton("accept") || null;

    if (!this._dialog || !this._textarea || !this._status) {
      return;
    }

    this._textarea.addEventListener("input", () => this._updateStatus());
    this._enabledCheckbox?.addEventListener("command", () =>
      this._updateStatus()
    );
    this._importButton?.addEventListener("command", () => {
      this._importFromFile().catch(err => {
        console.error(
          "[MidoriBlocker] Failed to import custom filters:",
          err
        );
        showAlert(
          "midori-blocker-custom-filters-import-error-title",
          "Import failed",
          "midori-blocker-custom-filters-import-error",
          err?.message || "The selected file could not be imported."
        );
      });
    });
    this._exportButton?.addEventListener("command", () => {
      this._exportToFile().catch(err => {
        console.error(
          "[MidoriBlocker] Failed to export custom filters:",
          err
        );
        showAlert(
          "midori-blocker-custom-filters-export-error-title",
          "Export failed",
          "midori-blocker-custom-filters-export-error",
          err?.message || "Custom filters could not be exported."
        );
      });
    });

    document.addEventListener("dialogaccept", event => {
      event.preventDefault();
      this._saveAndClose().catch(err => {
        console.error("[MidoriBlocker] Failed to save custom filters:", err);
        showAlert(
          "midori-blocker-custom-filters-save-error-title",
          "Save failed",
          "midori-blocker-custom-filters-save-error",
          err?.message || "Custom filters could not be saved."
        );
      });
    });

    await this._load();
  },

  async _load() {
    this._setBusy(true);
    try {
      this._initialText = await MidoriBlockerService.getCustomFiltersText();
      this._initialEnabled = MidoriBlockerService.areCustomFiltersEnabled();
      this._textarea.value = this._initialText;
      if (this._enabledCheckbox) {
        this._enabledCheckbox.checked = this._initialEnabled;
      }
      this._updateStatus();
      this._textarea.focus();
    } catch (err) {
      // Do not allow saving when the existing file could not be read; saving an
      // empty editor would otherwise overwrite intact content on the disk. Import
      // remains enabled so the user can replace the file with a valid one.
      this._loadFailed = true;
      console.error("[MidoriBlocker] Failed to load custom filters:", err);
      await showAlert(
        "midori-blocker-custom-filters-load-error-title",
        "Load failed",
        "midori-blocker-custom-filters-load-error",
        err?.message || "Custom filters could not be loaded."
      );
    } finally {
      this._setBusy(false);
    }
  },

  _setBusy(busy) {
    this._saving = busy;

    if (this._textarea) {
      this._textarea.disabled = busy || this._loadFailed;
    }
    if (this._enabledCheckbox) {
      this._enabledCheckbox.disabled = busy || this._loadFailed;
    }
    if (this._importButton) {
      this._importButton.disabled = busy;
    }
    if (this._exportButton) {
      this._exportButton.disabled = busy || this._loadFailed;
    }
    if (this._acceptButton) {
      this._acceptButton.disabled = busy || this._loadFailed;
    }
  },

  _updateStatus() {
    if (!this._status || !this._textarea) {
      return;
    }

    const activeCount = countActiveFilters(this._textarea.value);
    const dirty =
      this._textarea.value !== this._initialText ||
      this._enabledCheckbox?.checked !== this._initialEnabled;
    const generation = ++this._statusUpdateGeneration;

    this._updateStatusLocalized(activeCount, dirty, generation).catch(err => {
      if (generation !== this._statusUpdateGeneration || !this._status) {
        return;
      }

      console.error(
        "[MidoriBlocker] Failed to localize custom filters status:",
        err
      );

      let status;
      if (!activeCount) {
        status = "No custom filters.";
      } else if (activeCount === 1) {
        status = "1 custom filter.";
      } else {
        status = `${activeCount} custom filters.`;
      }

      if (dirty) {
        status += " Unsaved changes.";
      }

      this._status.removeAttribute("data-l10n-id");
      this._status.setAttribute("value", status);
    });
  },

  async _updateStatusLocalized(activeCount, dirty, generation) {
    let fallback;
    if (!activeCount) {
      fallback = "No custom filters.";
    } else if (activeCount === 1) {
      fallback = "1 custom filter.";
    } else {
      fallback = `${activeCount} custom filters.`;
    }

    let status = await formatValue(
      "midori-blocker-custom-filters-status",
      fallback,
      { count: activeCount }
    );

    if (dirty) {
      const unsavedStatus = await formatValue(
        "midori-blocker-custom-filters-status-unsaved",
        "Unsaved changes."
      );
      status = `${status} ${unsavedStatus}`.trim();
    }

    if (
      generation !== this._statusUpdateGeneration ||
      !this._status ||
      !this._status.isConnected
    ) {
      return;
    }

    this._status.removeAttribute("data-l10n-id");
    this._status.setAttribute("value", status);
  },

  async _saveAndClose() {
    if (this._saving || this._loadFailed) {
      return;
    }

    this._setBusy(true);
    try {
      const normalized = normalizeCustomFiltersText(this._textarea.value);
      const enabled = this._enabledCheckbox?.checked ?? true;
      await MidoriBlockerService.setCustomFiltersText(normalized, { enabled });
      this._initialText = normalized;
      this._initialEnabled = enabled;
      this._textarea.value = normalized;
      this._updateStatus();
      window.close();
    } finally {
      this._setBusy(false);
    }
  },

  async _importFromFile() {
    const title = await formatValue(
      "midori-blocker-custom-filters-import-picker-title",
      "Import custom filters"
    );
    const path = await openFilePicker(Ci.nsIFilePicker.modeOpen, title);
    if (!path) {
      return;
    }

    const stat = await IOUtils.stat(path);
    if (stat.size > MAX_CUSTOM_FILTERS_BYTES) {
      throw new Error("The selected file is too large.");
    }

    const importedText = normalizeCustomFiltersText(
      await IOUtils.readUTF8(path)
    );

    if (this._textarea.value !== this._initialText) {
      const confirmTitle = await formatValue(
        "midori-blocker-custom-filters-import-replace-title",
        "Replace current custom filters?"
      );
      const confirmMessage = await formatValue(
        "midori-blocker-custom-filters-import-replace-message",
        "Importing a file will replace the text currently in the editor."
      );

      if (!Services.prompt.confirm(window, confirmTitle, confirmMessage)) {
        return;
      }
    }

    this._textarea.value = importedText;
    if (this._loadFailed) {
      this._loadFailed = false;
      this._setBusy(this._saving);
    }
    this._updateStatus();
    this._textarea.focus();
  },

  async _exportToFile() {
    const title = await formatValue(
      "midori-blocker-custom-filters-export-picker-title",
      "Export custom filters"
    );
    const path = await openFilePicker(Ci.nsIFilePicker.modeSave, title);
    if (!path) {
      return;
    }

    const text = normalizeCustomFiltersText(this._textarea.value);
    await IOUtils.writeUTF8(path, text, {
      tmpPath: `${path}.tmp`,
    });
  },
};

document.addEventListener("DOMContentLoaded", () => {
  gMidoriBlockerCustomFilters.init();
});
