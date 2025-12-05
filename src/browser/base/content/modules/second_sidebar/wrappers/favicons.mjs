/**
 * @typedef {Object} URI
 * @property {string} scheme
 * @property {string} host
 * @property {string} spec
 * @property {string} specIgnoringRef
 */

export class FaviconsWrapper {
  /**
   *
   * @param {number} value
   */
  static setDefaultIconURIPreferredSize(value) {
    if (typeof window.Favicons !== 'undefined') {
      window.Favicons.setDefaultIconURIPreferredSize(value);
    } else {
      console.warn("Favicons is not available");
    }
  }

  /**
   *
   * @param {URI} uri
   * @param {function(URI):void} callback
   */
  static getFaviconURLForPage(uri, callback) {
    if (typeof window.Favicons === 'undefined') {
      console.warn("Favicons is not available");
      callback(null);
      return;
    }
    
    if ("getFaviconURLForPage" in window.Favicons) {
      window.Favicons.getFaviconURLForPage(uri, callback);
    } else {
      window.Favicons.getFaviconForPage(uri).then((favicon) =>
        callback(favicon ? favicon.uri : null),
      );
    }
  }
}
