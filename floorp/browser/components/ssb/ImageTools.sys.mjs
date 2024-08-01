/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";
import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

export const EXPORTED_SYMBOLS = ["ImageTools"];

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  FileUtils: "resource://gre/modules/FileUtils.sys.mjs",
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
});

XPCOMUtils.defineLazyServiceGetter(
  lazy,
  "ImgTools",
  "@mozilla.org/image/tools;1",
  Ci.imgITools,
);

export const ImageTools = {
  /**
   * Given a data URI decodes the data into an object with "type" which is the
   * found mimetype and "container" which is an imgIContainer.
   *
   * @param {nsIURI} dataURI the URI to load.
   * @returns {Promise<object>} the image info.
   */
  loadImage(dataURI) {
    return new Promise((resolve, reject) => {
      if (!dataURI.schemeIs("data")) {
        reject(new Error("Should only be loading data URIs."));
        return;
      }

      let channel = lazy.NetUtil.newChannel({
        uri: dataURI,
        loadUsingSystemPrincipal: true,
      });

      lazy.ImgTools.decodeImageFromChannelAsync(
        dataURI,
        channel,
        (container, status) => {
          if (Components.isSuccessCode(status)) {
            resolve({
              type: channel.contentType,
              container,
            });
          } else {
            reject(Components.Exception("Failed to load image.", status));
          }
        },
        null,
      );
    });
  },

  scaleImage(container, width, height) {
    return new Promise((resolve, reject) => {
      let stream = lazy.ImgTools.encodeScaledImage(
        container,
        "image/png",
        width,
        height,
        "",
      );

      try {
        stream.QueryInterface(Ci.nsIAsyncInputStream);
      } catch (e) {
        reject(
          Components.Exception(
            "imgIEncoder must implement nsIAsyncInputStream",
            e,
          ),
        );
      }

      let binaryStream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
        Ci.nsIBinaryInputStream,
      );
      binaryStream.setInputStream(stream);

      let buffers = [];
      let callback = () => {
        try {
          let available = binaryStream.available();
          if (available) {
            let buffer = new ArrayBuffer(available);
            binaryStream.readArrayBuffer(available, buffer);
            buffers.push(buffer);

            stream.asyncWait(callback, 0, 0, Services.tm.mainThread);
            return;
          }

          // No data available, assume the encoding is done.
          resolve(new Blob(buffers));
        } catch (e) {
          reject(e);
        }
      };

      try {
        stream.asyncWait(callback, 0, 0, Services.tm.mainThread);
      } catch (e) {
        reject(e);
      }
    });
  },

  saveIcon(container, width, height, target) {
    let format;
    if (AppConstants.platform == "win") {
      format = "image/vnd.microsoft.icon";
    } 
    if (AppConstants.platform == "linux") {
      format = "image/png";
    }
    return new Promise((resolve, reject) => {
      let output = lazy.FileUtils.openFileOutputStream(target);
      let stream = lazy.ImgTools.encodeScaledImage(
        container,
        format,
        width,
        height,
        "",
      );
      lazy.NetUtil.asyncCopy(stream, output, (status) => {
        if (Components.isSuccessCode(status)) {
          resolve();
        } else {
          reject(Components.Exception("Failed to save icon.", status));
        }
      });
    });
  },
};
