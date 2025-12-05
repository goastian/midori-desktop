export class FileProtocolHandler {
  static get #raw() {
    return window.Services.io
      .getProtocolHandler("file")
      .QueryInterface(window.Ci.nsIFileProtocolHandler);
  }

  /**
   *
   * @param {any} dir
   * @returns {string}
   */
  static getURLSpecFromDir(dir) {
    return this.#raw.getURLSpecFromDir(dir);
  }
}
