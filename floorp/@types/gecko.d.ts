/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Namespace anything that has its types mocked out here. These definitions are
 * only "good enough" to get the type checking to pass in this directory.
 * Eventually some more structured solution should be found. This namespace is
 * global and makes sure that all the definitions inside do not clash with
 * naming.
 */
declare namespace MockedExports {
  /**
   * This interface teaches ChromeUtils.import how to find modules.
   */
  interface KnownModules {
    "resource://gre/modules/FileUtils.sys.mjs": FileUtils;
    "resource://gre/modules/FileUtils.jsm": FileUtils;

    Services: Services;
    "resource://gre/modules/Services.jsm": Services;
    "resource://gre/modules/AppConstants.sys.mjs": typeof AppConstantsSYSMJS;
    "resource:///modules/CustomizableUI.sys.mjs": typeof CustomizableUISYSMJS;
    "resource:///modules/CustomizableWidgets.sys.mjs": typeof CustomizableWidgetsSYSMJS;
    "resource://devtools/shared/loader/Loader.sys.mjs": typeof LoaderESM;
    //"resource://devtools/client/performance-new/shared/background.jsm.js": typeof import("resource://devtools/client/performance-new/shared/background.jsm.js");
    //"resource://devtools/client/performance-new/shared/symbolication.jsm.js": typeof import("resource://devtools/client/performance-new/shared/symbolication.jsm.js");
    "resource://devtools/shared/loader/browser-loader.js": any;
    //"resource://devtools/client/performance-new/popup/menu-button.jsm.js": typeof import("resource://devtools/client/performance-new/popup/menu-button.jsm.js");
    //"resource://devtools/client/performance-new/shared/typescript-lazy-load.jsm.js": typeof import("resource://devtools/client/performance-new/shared/typescript-lazy-load.jsm.js");
    //"resource://devtools/client/performance-new/popup/logic.jsm.js": typeof import("resource://devtools/client/performance-new/popup/logic.jsm.js");
    "resource:///modules/PanelMultiView.sys.mjs": typeof PanelMultiViewSYSMJS;
  }

  type Services = {
    Services: import("firefox").Services;
  };

  type FileUtils = {
    FileUtils: IFileUtils;
  };

  interface IFileUtils {
    MODE_RDONLY: number;
    MODE_WRONLY: number;
    MODE_RDWR: number;
    MODE_CREATE: number;
    MODE_APPEND: number;
    MODE_TRUNCATE: number;

    PERMS_FILE: number;
    PERMS_DIRECTORY: number;
    /**
     * Gets a file at the specified hierarchy under a nsIDirectoryService key.
     * @param   key
     *          The Directory Service Key to start from
     * @param   pathArray
     *          An array of path components to locate beneath the directory
     *          specified by |key|. The last item in this array must be the
     *          leaf name of a file.
     * @return  nsIFile object for the file specified. The file is NOT created
     *          if it does not exist, however all required directories along
     *          the way are if pathArray has more than one item.
     */
    getFile: (key: any, pathArray: any) => any;
    /**
     * Gets a directory at the specified hierarchy under a nsIDirectoryService
     * key.
     * @param   key
     *          The Directory Service Key to start from
     * @param   pathArray
     *          An array of path components to locate beneath the directory
     *          specified by |key|
     * @param   shouldCreate
     *          true if the directory hierarchy specified in |pathArray|
     *          should be created if it does not exist, false otherwise.
     * @return  nsIFile object for the location specified.
     */
    getDir: (key, pathArray, shouldCreate) => any;
    /**
     * Opens a file output stream for writing.
     * @param   file
     *          The file to write to.
     * @param   modeFlags
     *          (optional) File open flags. Can be undefined.
     * @returns nsIFileOutputStream to write to.
     * @note The stream is initialized with the DEFER_OPEN behavior flag.
     *       See nsIFileOutputStream.
     */
    openFileOutputStream: (file, modeFlags) => any;
    /**
     * Opens an atomic file output stream for writing.
     * @param   file
     *          The file to write to.
     * @param   modeFlags
     *          (optional) File open flags. Can be undefined.
     * @returns nsIFileOutputStream to write to.
     * @note The stream is initialized with the DEFER_OPEN behavior flag.
     *       See nsIFileOutputStream.
     *       OpeanAtomicFileOutputStream is generally better than openSafeFileOutputStream
     *       baecause flushing is not needed in most of the issues.
     */
    openAtomicFileOutputStream: (file, modeFlags) => any;
    /**
     * Opens a safe file output stream for writing.
     * @param   file
     *          The file to write to.
     * @param   modeFlags
     *          (optional) File open flags. Can be undefined.
     * @returns nsIFileOutputStream to write to.
     * @note The stream is initialized with the DEFER_OPEN behavior flag.
     *       See nsIFileOutputStream.
     */
    openSafeFileOutputStream: (file, modeFlags) => any;

    _initFileOutputStream: (fos, file, modeFlags) => any;
    /**
     * Closes an atomic file output stream.
     * @param   stream
     *          The stream to close.
     */

    closeAtomicFileOutputStream: <
      Stream extends
        import("firefox").Components_Interfaces["nsISafeOutputStream"] & any,
    >(
      stream: Stream
    ) => void;
    /**
     * Closes a safe file output stream.
     * @param   stream
     *          The stream to close.
     */
    closeSafeFileOutputStream: <
      Stream extends
        import("firefox").Components_Interfaces["nsISafeOutputStream"] & any,
    >(
      stream: Stream
    ) => void;
    File: any;
  }

  //TODO: add to window
  interface MozXULElement {
    /**
     * Allows eager deterministic construction of XUL elements with XBL attached, by
     * parsing an element tree and returning a DOM fragment to be inserted in the
     * document before any of the inner elements is referenced by JavaScript.
     *
     * This process is required instead of calling the createElement method directly
     * because bindings get attached when:
     *
     * 1. the node gets a layout frame constructed, or
     * 2. the node gets its JavaScript reflector created, if it's in the document,
     *
     * whichever happens first. The createElement method would return a JavaScript
     * reflector, but the element wouldn't be in the document, so the node wouldn't
     * get XBL attached. After that point, even if the node is inserted into a
     * document, it won't get XBL attached until either the frame is constructed or
     * the reflector is garbage collected and the element is touched again.
     *
     * @param {string} str
     *        String with the XML representation of XUL elements.
     * @param {string[]} [entities]
     *        An array of DTD URLs containing entity definitions.
     *
     * @return {DocumentFragment} `DocumentFragment` instance containing
     *         the corresponding element tree, including element nodes
     *         but excluding any text node.
     */
    parseXULToFragment: (str: string, entities: string[]) => DocumentFragment;
  }

  interface ChromeUtils {
    /**
     * This function reads the KnownModules and resolves which import to use.
     * If you are getting the TS2345 error:
     *
     *  Argument of type '"resource:///.../file.jsm"' is not assignable to parameter
     *  of type
     *
     * Then add the file path to the KnownModules above.
     */
    import: <S extends keyof KnownModules>(module: S) => KnownModules[S];
    importESModule: <S extends keyof KnownModules>(
      module: S
    ) => KnownModules[S];
    defineModuleGetter: (target: any, variable: string, path: string) => void;
    defineESModuleGetters: (target: any, mappings: any) => void;
  }

  interface MessageManager {
    loadFrameScript(url: string, flag: boolean): void;
    sendAsyncMessage: (event: string, data: any) => void;
    addMessageListener: (event: string, listener: (event: any) => void) => void;
  }

  interface Browser {
    addWebTab: (url: string, options: any) => BrowserTab;
    contentPrincipal: any;
    selectedTab: BrowserTab;
    selectedBrowser?: ChromeBrowser;
    messageManager: MessageManager;
    ownerDocument?: ChromeDocument;
  }

  interface BrowserTab {
    linkedBrowser: Browser;
  }

  interface ChromeWindow {
    gBrowser: Browser;
    focus(): void;
    openWebLinkIn(
      url: string,
      where: "current" | "tab" | "window",
      options: Partial<{
        // Not all possible options are present, please add more if/when needed.
        userContextId: number;
        forceNonPrivate: boolean;
        resolveOnContentBrowserCreated: (
          contentBrowser: ChromeBrowser
        ) => unknown;
      }>
    ): void;
  }

  interface ChromeBrowser {
    browsingContext?: BrowsingContext;
  }

  interface BrowsingContext {
    /**
     * A unique identifier for the browser element that is hosting this
     * BrowsingContext tree. Every BrowsingContext in the element's tree will
     * return the same ID in all processes and it will remain stable regardless of
     * process changes. When a browser element's frameloader is switched to
     * another browser element this ID will remain the same but hosted under the
     * under the new browser element.
     * We are using this identifier for getting the active tab ID and passing to
     * the profiler back-end. See `getActiveBrowserID` for the usage.
     */
    browserId: number;
  }

  type GetPref<T> = (prefName: string, defaultValue?: T) => T;
  type SetPref<T> = (prefName: string, value?: T) => T;

  type PrefObserverFunction = (
    aSubject: import("./firefox/modules/libpref/nsIPrefBranch").nsIPrefBranch,
    aTopic: "nsPref:changed",
    aData: string
  ) => unknown;
  type PrefObserver = PrefObserverFunction | { observe: PrefObserverFunction };

  interface SharedLibrary {
    start: number;
    end: number;
    offset: number;
    name: string;
    path: string;
    debugName: string;
    debugPath: string;
    breakpadId: string;
    arch: string;
  }

  interface ProfileGenerationAdditionalInformation {
    sharedLibraries: SharedLibrary[];
  }

  interface ProfileAndAdditionalInformation {
    profile: ArrayBuffer;
    additionalInformation?: ProfileGenerationAdditionalInformation;
  }

  const EventEmitter: {
    decorate: (target: object) => void;
  };

  const AppConstantsSYSMJS: {
    AppConstants: {
      platform: string;
    };
  };

  interface BrowsingContextStub {}
  interface PrincipalStub {}

  interface WebChannelTarget {
    browsingContext: BrowsingContextStub;
    browser: Browser;
    eventTarget: null;
    principal: PrincipalStub;
  }

  // TS-TODO
  const CustomizableUISYSMJS: any;
  const CustomizableWidgetsSYSMJS: any;
  const PanelMultiViewSYSMJS: any;

  const LoaderESM: {
    require: (path: string) => any;
  };

  //const Services: Services;

  // This class is needed by the Cc importing mechanism. e.g.
  // Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
  //class nsIFilePicker {}

  interface FilePicker {
    init: (window: Window, title: string, mode: number) => void;
    open: (callback: (rv: number) => unknown) => void;
    // The following are enum values.
    modeGetFolder: number;
    returnOK: number;
    file: {
      path: string;
    };
  }

  // interface Cc {
  //   "@mozilla.org/filepicker;1": {
  //     createInstance(instance: nsIFilePicker): FilePicker;
  //   };
  // }

  // interface Ci {
  //   nsIFilePicker: nsIFilePicker;
  // }

  // interface Cu {
  //   /**
  //    * This function reads the KnownModules and resolves which import to use.
  //    * If you are getting the TS2345 error:
  //    *
  //    *  Argument of type '"resource:///.../file.jsm"' is not assignable to parameter
  //    *  of type
  //    *
  //    * Then add the file path to the KnownModules above.
  //    */
  //   import: <S extends keyof KnownModules>(module: S) => KnownModules[S];
  //   exportFunction: (fn: Function, scope: object, options?: object) => void;
  //   cloneInto: (value: any, scope: object, options?: object) => void;
  //   isInAutomation: boolean;
  // }

  interface FluentLocalization {
    /**
     * This function sets the attributes data-l10n-id and possibly data-l10n-args
     * on the element.
     */
    setAttributes(
      target: Element,
      id?: string,
      args?: Record<string, string>
    ): void;
  }
}

interface PathUtilsInterface {
  split: (path: string) => string[];
  isAbsolute: (path: string) => boolean;
}

// export module "resource://devtools/client/shared/vendor/react.js" {
//   import * as React from "react";
//   export = React;
// }

// declare module "resource://devtools/client/shared/vendor/react-dom-factories.js" {
//   import * as ReactDomFactories from "react-dom-factories";
//   export = ReactDomFactories;
// }

// declare module "resource://devtools/client/shared/vendor/redux.js" {
//   import * as Redux from "redux";
//   export = Redux;
// }

// declare module "resource://devtools/client/shared/vendor/react-redux.js" {
//   import * as ReactRedux from "react-redux";
//   export = ReactRedux;
// }

// declare module "resource://devtools/shared/event-emitter2.js" {
//   export = MockedExports.EventEmitter;
// }

// declare module "Services" {
//   export = Services;
// }

// declare module "ChromeUtils" {
//   export = ChromeUtils;
// }

// declare module "resource://gre/modules/AppConstants.sys.mjs" {
//   export = MockedExports.AppConstantsSYSMJS;
// }

// declare module "resource://devtools/client/performance-new/shared/background.jsm.js" {
//   import * as Background from "devtools/client/performance-new/shared/background.jsm.js";
//   export = Background;
// }

// declare module "resource://devtools/client/performance-new/shared/symbolication.jsm.js" {
//   import * as PerfSymbolication from "devtools/client/performance-new/shared/symbolication.jsm.js";
//   export = PerfSymbolication;
// }

// declare module "resource:///modules/CustomizableUI.sys.mjs" {
//   export = MockedExports.CustomizableUISYSMJS;
// }

// declare module "resource:///modules/CustomizableWidgets.sys.mjs" {
//   export = MockedExports.CustomizableWidgetsSYSMJS;
// }

// declare module "resource:///modules/PanelMultiView.sys.mjs" {
//   export = MockedExports.PanelMultiViewSYSMJS;
// }

// declare module "resource://devtools/shared/loader/Loader.sys.mjs" {
//   export = MockedExports.LoaderESM;
// }

declare var ChromeUtils: MockedExports.ChromeUtils;

declare var PathUtils: PathUtilsInterface;

/**
 * This is a variant on the normal Document, as it contains chrome-specific properties.
 */
declare interface ChromeDocument extends Document {
  /**
   * Create a XUL element of a specific type. Right now this function
   * only refines iframes, but more tags could be added.
   */
  createXULElement: ((type: "iframe") => XULIframeElement) &
    ((type: string) => XULElement);

  /**
   * This is a fluent instance connected to this document.
   */
  l10n: MockedExports.FluentLocalization;
}

/**
 * This is a variant on the HTMLElement, as it contains chrome-specific properties.
 */
declare interface ChromeHTMLElement extends HTMLElement {
  ownerDocument: ChromeDocument;
}

declare interface XULElement extends HTMLElement {
  ownerDocument: ChromeDocument;
}

declare interface XULIframeElement extends XULElement {
  contentWindow: ChromeWindow;
  src: string;
}

declare interface ChromeWindow extends Window {
  openWebLinkIn: (
    url: string,
    where: "current" | "tab" | "tabshifted" | "window" | "save",
    // TS-TODO
    params?: unknown
  ) => void;
  openTrustedLinkIn: (
    url: string,
    where: "current" | "tab" | "tabshifted" | "window" | "save",
    // TS-TODO
    params?: unknown
  ) => void;
}

declare class ChromeWorker extends Worker {}

declare interface MenuListElement extends XULElement {
  value: string;
  disabled: boolean;
}

declare interface XULCommandEvent extends Event {
  target: XULElement;
}

declare interface XULElementWithCommandHandler {
  addEventListener: (
    type: "command",
    handler: (event: XULCommandEvent) => void,
    isCapture?: boolean
  ) => void;
  removeEventListener: (
    type: "command",
    handler: (event: XULCommandEvent) => void,
    isCapture?: boolean
  ) => void;
}

//declare type nsIPrefBranch = MockedExports.nsIPrefBranch;

// chrome context-only DOM isInstance method
// XXX: This hackishly extends Function because there is no way to extend DOM constructors.
// Callers should manually narrow the type when needed.
// See also https://github.com/microsoft/TypeScript-DOM-lib-generator/issues/222
interface Function {
  isInstance(obj: any): boolean;
}

declare module "resource://gre/modules/FileUtils.sys.mjs" {
  const FileUtils: MockedExports.IFileUtils;
  export { FileUtils };
}
