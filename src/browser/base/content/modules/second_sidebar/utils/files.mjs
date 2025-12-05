import { ChromeRegistry } from "../wrappers/chrome_registry.mjs";
import { IOUtilsWrapper } from "../wrappers/io_utils.mjs";
import { PathUtilsWrapper } from "../wrappers/path_utils.mjs";

// Use browser content directory instead of non-existent userchrome
const CONTENT_URL = "chrome://browser/content/";

/**
 *
 * @param {string} relativePath
 * @param {string} data
 * @returns {Promise<string>}
 */
export async function writeFile(relativePath, data) {
  const path = makePath(relativePath);
  if (!path) {
    console.warn("Cannot write file - invalid path:", relativePath);
    return null;
  }
  try {
    await IOUtilsWrapper.writeUTF8(path, data);
    return makeChromePath(relativePath);
  } catch (error) {
    console.error("Failed to write file:", relativePath, error);
    return null;
  }
}

/**
 *
 * @param {string} relativePath
 */
export async function removeFile(relativePath) {
  const path = makePath(relativePath);
  if (!path) {
    console.warn("Cannot remove file - invalid path:", relativePath);
    return;
  }
  try {
    await IOUtilsWrapper.remove(path);
  } catch (error) {
    console.error("Failed to remove file:", relativePath, error);
  }
}

/**
 *
 * @param {string} relativePath
 * @returns {string}
 */
function makePath(relativePath) {
  const contentDir = ChromeRegistry.convertChromeURL(CONTENT_URL);
  if (!contentDir) {
    console.error("Failed to convert chrome URL:", CONTENT_URL);
    return null;
  }
  try {
    const resourcePath = contentDir.QueryInterface(window.Ci.nsIFileURL).file.parent
      .path;
    const resourcePathParts = PathUtilsWrapper.split(resourcePath);
    const relativePathParts = relativePath.split("/");
    return PathUtilsWrapper.join(resourcePathParts.concat(relativePathParts));
  } catch (error) {
    console.error("Failed to make path:", error);
    return null;
  }
}

/**
 *
 * @param {string} path
 * @returns {string}
 */
function makeChromePath(path) {
  return CONTENT_URL + path;
}
