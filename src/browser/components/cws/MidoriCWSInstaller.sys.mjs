/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Orchestrates the Chrome Web Store install flow on the parent process:
 *
 *   1. Download the CRX from clients2.google.com.
 *   2. Strip the CRX header to expose the inner ZIP.
 *   3. Walk the ZIP entries with nsIZipReader and rebuild a new XPI with
 *      nsIZipWriter, replacing manifest.json with the transformed copy.
 *   4. Hand the rebuilt XPI to AddonManager.getInstallForFile().
 *
 * No external dependencies — only XPCOM zip utilities that ship with Gecko.
 */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import {
  clearTimeout,
  setTimeout,
} from "resource://gre/modules/Timer.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  MidoriCWSConstants:
    "resource:///modules/MidoriCWSConstants.sys.mjs",
  parseCRX: "resource:///modules/MidoriCRXParser.sys.mjs",
  transformManifest:
    "resource:///modules/MidoriManifestTransformer.sys.mjs",
});

const Cc = Components.classes;
const Ci = Components.interfaces;

export const MidoriCWSInstaller = {
  /**
   * Public entry point.
   *
   * @param {object} opts
   * @param {string} opts.extensionId   Chrome Web Store extension ID.
   * @param {object} [opts.metadata]    Optional metadata from the CWS page
   *                                    (name, icon URL). Used for logging.
   * @param {Window} [opts.installingWindow] Window that initiated the install
   *                                    — passed to AddonManager so the
   *                                    permission doorhanger anchors there.
   * @returns {Promise<{ success: boolean, addonId?: string, error?: string,
   *                     warnings: string[] }>}
   */
  async install({ extensionId, metadata = {}, installingWindow = null }) {
    if (!/^[a-p]{32}$/.test(extensionId)) {
      return {
        success: false,
        error: "Invalid Chrome extension ID",
        warnings: [],
      };
    }

    const log = msg =>
      console.info(`[MidoriCWSInstaller:${extensionId}] ${msg}`);

    let crxFile = null;
    let xpiFile = null;
    try {
      log("downloading CRX");
      const crxBytes = await this._downloadCRX(extensionId);

      log(`parsing CRX (${crxBytes.byteLength} bytes)`);
      const { zip: zipBytes, version } = lazy.parseCRX(crxBytes);
      log(`extracted CRX${version} zip payload (${zipBytes.byteLength} bytes)`);

      crxFile = await this._writeTempFile(zipBytes, `cws-${extensionId}.zip`);
      xpiFile = this._makeTempFile(`cws-${extensionId}-${Date.now()}.xpi`);
      xpiFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);

      log("repacking with transformed manifest");
      const { warnings } = await this._repackXPI(
        crxFile,
        xpiFile,
        extensionId,
        metadata
      );
      log(`repack done, ${warnings.length} warning(s)`);

      log("submitting to AddonManager");
      const install = await lazy.AddonManager.getInstallForFile(
        xpiFile,
        "application/x-xpinstall"
      );

      if (!install) {
        return {
          success: false,
          error: "AddonManager rejected the package",
          warnings,
        };
      }

      // Tag the window so our doorhanger hook can recognize CWS installs.
      if (installingWindow) {
        installingWindow.__midoriCWSInstallInfo = {
          chromeId: extensionId,
          name: metadata.name || extensionId,
          icon: metadata.icon || null,
        };
      }

      Services.obs.notifyObservers(
        {
          wrappedJSObject: {
            chromeId: extensionId,
            name: metadata.name,
            icon: metadata.icon,
          },
        },
        "midori-cws-install-started"
      );

      const result = await this._driveInstall(
        install,
        installingWindow,
        warnings
      );

      // Best-effort temp cleanup once AddonManager has copied the file.
      this._safeDelete(xpiFile);
      this._safeDelete(crxFile);
      xpiFile = crxFile = null;

      return result;
    } catch (err) {
      console.error("[MidoriCWSInstaller] install failed", err);
      this._safeDelete(xpiFile);
      this._safeDelete(crxFile);
      return {
        success: false,
        error: err?.message || String(err),
        warnings: [],
      };
    }
  },

  // -----------------------------------------------------------------------
  // Download
  // -----------------------------------------------------------------------

  async _downloadCRX(extensionId) {
    const url = lazy.MidoriCWSConstants.CRX_DOWNLOAD_URL.replace(
      "{id}",
      encodeURIComponent(extensionId)
    );
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      lazy.MidoriCWSConstants.INSTALL_TIMEOUT_MS
    );
    try {
      const resp = await fetch(url, {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": lazy.MidoriCWSConstants.USER_AGENT,
          Accept: "application/x-chrome-extension,*/*;q=0.8",
        },
      });
      if (!resp.ok) {
        throw new Error(
          `CRX download HTTP ${resp.status} — extension may not exist`
        );
      }
      const buf = await resp.arrayBuffer();
      if (buf.byteLength > lazy.MidoriCWSConstants.MAX_CRX_SIZE) {
        const maxMiB = Math.floor(
          lazy.MidoriCWSConstants.MAX_CRX_SIZE / (1024 * 1024)
        );
        throw new Error(
          `CRX exceeds maximum supported size (${maxMiB} MiB)`
        );
      }
      return new Uint8Array(buf);
    } finally {
      clearTimeout(timer);
    }
  },

  // -----------------------------------------------------------------------
  // ZIP repacking
  // -----------------------------------------------------------------------

  async _writeTempFile(bytes, name) {
    const file = this._makeTempFile(name);
    file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
    const stream = Cc[
      "@mozilla.org/network/file-output-stream;1"
    ].createInstance(Ci.nsIFileOutputStream);
    stream.init(file, 0x02 | 0x08 | 0x20, 0o600, 0); // WRONLY|CREATE|TRUNCATE
    try {
      const binStream = Cc[
        "@mozilla.org/binaryoutputstream;1"
      ].createInstance(Ci.nsIBinaryOutputStream);
      binStream.setOutputStream(stream);
      binStream.writeByteArray(bytes);
      binStream.close();
    } finally {
      try {
        stream.close();
      } catch (_) {}
    }
    return file;
  },

  _makeTempFile(name) {
    const file = Services.dirsvc.get("TmpD", Ci.nsIFile);
    file.append(name);
    return file;
  },

  async _repackXPI(zipFile, xpiFile, extensionId, metadata) {
    const reader = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(
      Ci.nsIZipReader
    );
    reader.open(zipFile);

    const writer = Cc["@mozilla.org/zipwriter;1"].createInstance(
      Ci.nsIZipWriter
    );
    // 0x02 | 0x08 | 0x20 = WRONLY|CREATE|TRUNCATE
    writer.open(xpiFile, 0x02 | 0x08 | 0x20);

    const warnings = [];
    let foundManifest = false;
    try {
      const entries = reader.findEntries(null);
      while (entries.hasMore()) {
        const name = entries.getNext();
        const entry = reader.getEntry(name);
        if (entry.isDirectory) {
          continue;
        }

        if (name === "manifest.json" || name.endsWith("/manifest.json")) {
          // Only transform the root manifest.
          if (name === "manifest.json" && !foundManifest) {
            foundManifest = true;
            const transformed = await this._readAndTransformManifest(
              reader,
              name,
              extensionId
            );
            warnings.push(...transformed.warnings);
            this._writeBytes(writer, name, transformed.bytes);
            continue;
          }
        }

        // Copy the entry verbatim using a streamed input.
        const input = reader.getInputStream(name);
        writer.addEntryStream(
          name,
          entry.lastModifiedTime,
          Ci.nsIZipWriter.COMPRESSION_DEFAULT,
          input,
          /* aQueue */ false
        );
      }

      if (!foundManifest) {
        throw new Error("CRX did not contain a manifest.json");
      }
    } finally {
      try {
        writer.close();
      } catch (_) {}
      try {
        reader.close();
      } catch (_) {}
    }
    return { warnings };
  },

  async _readAndTransformManifest(reader, name, extensionId) {
    const input = reader.getInputStream(name);
    const bytes = this._readAllBytes(input);
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const manifest = this._parseManifestText(text);

    const { manifest: out, warnings, blockers } = lazy.transformManifest(
      manifest,
      extensionId
    );

    if (Array.isArray(blockers) && blockers.length) {
      const strictCompat = Services.prefs.getBoolPref(
        lazy.MidoriCWSConstants.PREF_STRICT_COMPAT,
        false
      );
      if (strictCompat) {
        throw new Error(
          "Incompatible extension for Midori/Firefox: " +
            blockers.slice(0, 3).join("; ")
        );
      }
      warnings.push(
        "Compatibility warning: " + blockers.slice(0, 3).join("; ")
      );
    }

    const encoded = new TextEncoder().encode(JSON.stringify(out, null, 2));
    return { bytes: encoded, warnings };
  },

  _parseManifestText(text) {
    try {
      return JSON.parse(text);
    } catch (_) {}

    // Fallback for non-standard JSON (comments / trailing commas).
    const cleaned = text
      .replace(/^\uFEFF/, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "$1")
      .replace(/,\s*([}\]])/g, "$1");

    try {
      return JSON.parse(cleaned);
    } catch (err) {
      throw new Error(
        `Invalid extension manifest JSON: ${err?.message || String(err)}`
      );
    }
  },

  _readAllBytes(input) {
    const bin = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
      Ci.nsIBinaryInputStream
    );
    bin.setInputStream(input);
    const chunks = [];
    let total = 0;
    let avail;
    while ((avail = bin.available()) > 0) {
      const arr = bin.readByteArray(avail);
      chunks.push(arr);
      total += arr.length;
    }
    bin.close();
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  },

  _writeBytes(writer, name, bytes) {
    // Build a binary-safe string (one char per byte) and hand it to
    // nsIStringInputStream. We chunk to keep below JS argument-list limits.
    const sis = Cc[
      "@mozilla.org/io/string-input-stream;1"
    ].createInstance(Ci.nsIStringInputStream);

    let s = "";
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      s += String.fromCharCode.apply(
        null,
        bytes.subarray(i, Math.min(i + CHUNK, bytes.length))
      );
    }
    sis.setByteStringData(s);

    writer.addEntryStream(
      name,
      Date.now() * 1000,
      Ci.nsIZipWriter.COMPRESSION_DEFAULT,
      sis,
      false
    );
  },

  // -----------------------------------------------------------------------
  // AddonManager driving
  // -----------------------------------------------------------------------

  _driveInstall(install, installingWindow, warnings) {
    return new Promise(resolve => {
      const listener = {
        onInstallEnded: (_install, addon) => {
          resolve({ success: true, addonId: addon?.id, warnings });
        },
        onInstallFailed: _install => {
          resolve({
            success: false,
            error: `Install failed (${_install.error})`,
            warnings,
          });
        },
        onInstallCancelled: () => {
          resolve({ success: false, error: "User cancelled", warnings });
        },
      };
      install.addListener(listener);
      try {
        install.install();
      } catch (e) {
        resolve({
          success: false,
          error: e?.message || String(e),
          warnings,
        });
      }
    });
  },

  // -----------------------------------------------------------------------
  // Misc
  // -----------------------------------------------------------------------

  _safeDelete(file) {
    if (!file) return;
    try {
      if (file.exists()) {
        file.remove(false);
      }
    } catch (_) {}
  },
};

// Silence the unused-import warning in builds where AppConstants is dropped.
void AppConstants;
