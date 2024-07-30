/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */

import { WorkspacesExternalFileService } from "./WorkspacesExternalFileService.mjs"

/**
 * @description Overview This file contains the implementation of the WorkspacesDataSaver module.
 * @module WorkspacesDataSaver
 */

/**
 * The exported symbols from this module.
 *
 * @type {Array<string>}
 */
export const EXPORTED_SYMBOLS = ["WorkspacesDataSaver"];

/**
 * The WorkspacesDataSaver module.
 *
 * @type {object}
 */
export const WorkspacesDataSaver = {
  /**
   * Get the path of the workspaces store file.
   *
   * @type {string}
   */
  get _workspacesStoreFile() {
    return WorkspacesExternalFileService._workspacesStoreFile;
  },

  /**
   * Save the workspaces data for a specific window.
   *
   * @param {object} workspacesData - The workspaces data to be saved.
   * @param {number} windowId - The ID of the window.
   * @returns {Promise<void>} A promise that resolves when the data is saved.
   */
  async saveWorkspacesData(workspacesData, windowId) {
    let json = await IOUtils.readJSON(this._workspacesStoreFile);
    json.windows[windowId] = workspacesData;

    await IOUtils.writeJSON(this._workspacesStoreFile, json);
  },

  /**
   * Save the data for a specific workspace in a window.
   *
   * @param {object} workspaceData - The workspace data to be saved.
   * @param {number} windowId - The ID of the window.
   * @returns {Promise<void>} A promise that resolves when the data is saved.
   */
  async saveWorkspaceData(workspaceData, windowId) {
    let json = await IOUtils.readJSON(this._workspacesStoreFile);
    if (!json.windows[windowId]) {
      json.windows[windowId] = {};
    }

    json.windows[windowId][workspaceData.id] = workspaceData;

    await IOUtils.writeJSON(this._workspacesStoreFile, json);
  },

  /**
   * Save the workspaces data for a specific window without overwriting preferences.
   *
   * @param {object} workspacesData - The workspaces data to be saved.
   * @param {number} windowId - The ID of the window.
   * @returns {Promise<void>} A promise that resolves when the data is saved.
   */
  async saveWorkspacesDataWithoutOverwritingPreferences(
    workspacesData,
    windowId,
  ) {
    let json = await IOUtils.readJSON(this._workspacesStoreFile);
    let preferences = json.windows[windowId].preferences;
    json.windows[windowId] = workspacesData;
    json.windows[windowId].preferences = preferences;

    await IOUtils.writeJSON(this._workspacesStoreFile, json);
  },

  /**
   * Save the preferences for a specific window.
   *
   * @param {object} preferences - The preferences to be saved.
   * @param {number} windowId - The ID of the window.
   * @returns {Promise<void>} A promise that resolves when the preferences are saved.
   */
  async saveWindowPreferences(preferences, windowId) {
    let json = await IOUtils.readJSON(this._workspacesStoreFile);
    json.windows[windowId].preferences = preferences;

    await IOUtils.writeJSON(this._workspacesStoreFile, json);
  },
};
