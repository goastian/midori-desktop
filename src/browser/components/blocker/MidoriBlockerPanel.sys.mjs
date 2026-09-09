/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MidoriBlockerService } from "resource:///modules/MidoriBlockerService.sys.mjs";
import {
  isPrivateBrowsingContext,
  toSafeDomain,
} from "resource:///modules/MidoriBlockerUtils.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  CustomizableUI:
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
  DownloadUtils: "resource://gre/modules/DownloadUtils.sys.mjs",
  PanelMultiView:
    "moz-src:///browser/components/customizableui/PanelMultiView.sys.mjs",
});

const PREF_BRANCH = "midori.blocker.";
const PREF_ENABLED = "midori.blocker.enabled";
const PREF_UI_ENABLED = "midori.blocker.ui.enabled";
const PREF_SHOW_BADGE = "midori.blocker.showBadge";

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "uiEnabled",
  PREF_UI_ENABLED,
  false
);
XPCOMUtils.defineLazyPreferenceGetter(lazy, "showBadge", PREF_SHOW_BADGE, true);
XPCOMUtils.defineLazyPreferenceGetter(lazy, "enabled", PREF_ENABLED, true);

const TOPIC_BLOCKED_COUNT_UPDATED = "MidoriBlocker:BlockedCountUpdated";
const TOPIC_BLOCKED_COUNTS_CLEARED = "MidoriBlocker:BlockedCountsCleared";
const TOPIC_CONTENT_BLOCKING_EVENT = "SiteProtection:ContentBlockingEvent";

const OBSERVED_TOPICS = [
  "browser-delayed-startup-finished",
  TOPIC_CONTENT_BLOCKING_EVENT,
  TOPIC_BLOCKED_COUNT_UPDATED,
  TOPIC_BLOCKED_COUNTS_CLEARED,
];

const HTML_NS = "http://www.w3.org/1999/xhtml";

const WIDGET_ID = "midori-protection_astian_org-browser-action";
const PANEL_STYLESHEET_URI =
  "chrome://browser/content/blocker/midoriBlockerPanel.css";
const HERO_LOGO_URI = "chrome://browser/content/blocker/midoriShield.svg";

const PANEL_IDS = {
  panel: "midori-blocker-panel",
  multiview: "midori-blocker-multiview",
  mainView: "midori-blocker-mainView",
  blockedListView: "midori-blocker-blockedListView",
  hero: "midori-blocker-hero",
  heroTitle: "midori-blocker-hero-title",
  heroSubtitle: "midori-blocker-hero-subtitle",
  categories: "midori-blocker-categories",
  categoriesFooter: "midori-blocker-categories-footer",
  seeAllButton: "midori-blocker-see-all",
  pausedCard: "midori-blocker-paused-card",
  toggleRow: "midori-blocker-toggle-row",
  siteToggle: "midori-blocker-panel-site-toggle",
  allowlistRow: "midori-blocker-allowlist-row",
  allowlistCount: "midori-blocker-allowlist-count",
  footerStats: "midori-blocker-footer-stats",
  settingsButton: "midori-blocker-settings-button",
  detailBackButton: "midori-blocker-detail-back",
  detailSubtitle: "midori-blocker-detail-subtitle",
  detailCountPill: "midori-blocker-detail-count",
  detailBody: "midori-blocker-detail-body",
};

const L10N_IDS = {
  notAvailable: "midori-blocker-panel-not-available",
  disabled: "midori-blocker-panel-disabled",
  heroCount: "midori-blocker-panel-hero-count",
  heroPaused: "midori-blocker-panel-hero-paused",
  heroSubtitle: "midori-blocker-panel-hero-subtitle",
  pausedCard: "midori-blocker-panel-paused-card",
  seeAll: "midori-blocker-panel-see-all",
  toggle: "midori-blocker-panel-toggle2",
  allowlist: "midori-blocker-panel-allowlist",
  allowlistCount: "midori-blocker-panel-allowlist-count",
  footerStats: "midori-blocker-panel-footer-stats",
  footerSettings: "midori-blocker-panel-footer-settings",
  back: "midori-blocker-panel-back",
  detailTitle: "midori-blocker-panel-detail-title",
  allowDomain: "midori-blocker-panel-allow-domain",
  domainCount: "midori-blocker-panel-domain-count",
  popupNote: "midori-blocker-panel-detail-popup-note",
};

const CATEGORIES = [
  {
    key: "ads",
    rowL10nId: "midori-blocker-panel-category-ads",
    sectionL10nId: "midori-blocker-panel-detail-section-ads",
  },
  {
    key: "trackers",
    rowL10nId: "midori-blocker-panel-category-trackers",
    sectionL10nId: "midori-blocker-panel-detail-section-trackers",
  },
  {
    key: "popups",
    rowL10nId: "midori-blocker-panel-category-popups",
    sectionL10nId: "midori-blocker-panel-detail-section-popups",
  },
];

function createXUL(doc, tag, attrs = {}) {
  const el = doc.createXULElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) {
      el.setAttribute(name, value);
    }
  }
  return el;
}

function createHTML(doc, tag, attrs = {}) {
  const el = doc.createElementNS(HTML_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) {
      el.setAttribute(name, value);
    }
  }
  return el;
}

function setNodeL10nAttributes(doc, node, id, args = undefined) {
  if (!node) {
    return;
  }

  doc.l10n.setAttributes(node, id, args);
}

/**
 * Owns the Midori blocker toolbar button and popup panel.
 *
 * Registers a CustomizableUI `button` widget, injects a `<panel>` per
 * browser window, keeps badge and panel state in sync with the blocker,
 * and routes interactions to `MidoriBlockerService`.
 */
export const MidoriBlockerPanel = {
  _initialized: false,
  _widgetRegistered: false,
  _windowState: new WeakMap(),
  _styledWindows: new WeakSet(),

  _buildCategoryRow(doc, category) {
    const row = createHTML(doc, "div", {
      class: "midori-blocker-category-row",
      "data-category": category.key,
      hidden: "",
    });

    const label = createHTML(doc, "span", {
      class: "midori-blocker-category-label",
    });
    setNodeL10nAttributes(doc, label, category.rowL10nId);

    const track = createHTML(doc, "span", {
      class: "midori-blocker-category-track",
    });
    track.appendChild(
      createHTML(doc, "span", { class: "midori-blocker-category-fill" })
    );

    const count = createHTML(doc, "span", {
      class: "midori-blocker-category-count",
    });

    row.append(label, track, count);
    return row;
  },

  _buildAllowlistRow(doc) {
    const row = createHTML(doc, "button", {
      class: "midori-blocker-row midori-blocker-allowlist-row",
      id: PANEL_IDS.allowlistRow,
    });

    const label = createHTML(doc, "span", {
      class: "midori-blocker-row-label",
    });
    setNodeL10nAttributes(doc, label, L10N_IDS.allowlist);
    row.appendChild(label);

    const count = createHTML(doc, "span", {
      class: "midori-blocker-row-detail",
      id: PANEL_IDS.allowlistCount,
    });
    row.appendChild(count);

    row.appendChild(
      createHTML(doc, "span", {
        class: "midori-blocker-chevron",
        "aria-hidden": "true",
      })
    );
    return row;
  },

  _buildMainView(doc, win) {
    const mainView = createXUL(doc, "panelview", {
      class: "PanelUI-subView midori-blocker-view",
      id: PANEL_IDS.mainView,
      role: "document",
      mainview: "true",
      "has-custom-header": "true",
    });

    const body = createXUL(doc, "vbox", {
      class: "panel-subview-body",
    });

    const hero = createHTML(doc, "div", {
      class: "midori-blocker-hero",
      id: PANEL_IDS.hero,
    });

    const shield = createHTML(doc, "img", {
      class: "midori-blocker-hero-shield",
      src: HERO_LOGO_URI,
      alt: "",
      role: "presentation",
    });

    const heroText = createHTML(doc, "div", {
      class: "midori-blocker-hero-text",
    });
    const heroTitle = createHTML(doc, "h1", {
      class: "midori-blocker-hero-title",
      id: PANEL_IDS.heroTitle,
    });
    const heroSubtitle = createHTML(doc, "div", {
      class: "midori-blocker-hero-subtitle",
      id: PANEL_IDS.heroSubtitle,
    });
    heroText.append(heroTitle, heroSubtitle);
    hero.append(shield, heroText);
    body.appendChild(hero);

    const categories = createHTML(doc, "div", {
      class: "midori-blocker-categories",
      id: PANEL_IDS.categories,
      hidden: "",
    });
    for (const category of CATEGORIES) {
      categories.appendChild(this._buildCategoryRow(doc, category));
    }

    const categoriesFooter = createHTML(doc, "div", {
      class: "midori-blocker-categories-footer",
      id: PANEL_IDS.categoriesFooter,
    });
    const seeAll = createHTML(doc, "button", {
      class: "midori-blocker-link-button",
      id: PANEL_IDS.seeAllButton,
    });
    setNodeL10nAttributes(doc, seeAll, L10N_IDS.seeAll);
    seeAll.addEventListener("click", () => {
      this._showBlockedListView(win);
    });
    categoriesFooter.append(seeAll);
    categories.appendChild(categoriesFooter);
    body.appendChild(categories);

    const pausedCard = createHTML(doc, "div", {
      class: "midori-blocker-paused-card",
      id: PANEL_IDS.pausedCard,
      hidden: "",
    });
    body.appendChild(pausedCard);

    const toggleRow = createHTML(doc, "div", {
      class: "midori-blocker-toggle-row",
      id: PANEL_IDS.toggleRow,
    });
    const siteToggle = createHTML(doc, "moz-toggle", {
      id: PANEL_IDS.siteToggle,
    });
    setNodeL10nAttributes(doc, siteToggle, L10N_IDS.toggle);
    toggleRow.appendChild(siteToggle);
    body.appendChild(toggleRow);

    const allowlistRow = this._buildAllowlistRow(doc);
    allowlistRow.addEventListener("click", () => {
      this._openBlockerPreferences(win, allowlistRow);
    });
    body.appendChild(allowlistRow);

    const footer = createHTML(doc, "div", {
      class: "midori-blocker-footer",
    });
    const footerStats = createHTML(doc, "span", {
      class: "midori-blocker-footer-stats",
      id: PANEL_IDS.footerStats,
    });
    footerStats.appendChild(
      createHTML(doc, "b", { "data-l10n-name": "total" })
    );
    const settingsButton = createHTML(doc, "button", {
      class: "midori-blocker-link-button midori-blocker-footer-settings",
      id: PANEL_IDS.settingsButton,
    });
    setNodeL10nAttributes(doc, settingsButton, L10N_IDS.footerSettings);
    settingsButton.addEventListener("click", () => {
      this._openBlockerPreferences(win, settingsButton);
    });
    footer.append(footerStats, settingsButton);
    body.appendChild(footer);

    mainView.appendChild(body);
    return mainView;
  },

  _buildBlockedListView(doc) {
    const view = createXUL(doc, "panelview", {
      class: "PanelUI-subView midori-blocker-view",
      id: PANEL_IDS.blockedListView,
      "has-custom-header": "true",
    });

    const header = createHTML(doc, "div", {
      class: "midori-blocker-detail-header",
    });

    const backButton = createXUL(doc, "toolbarbutton", {
      class: "subviewbutton subviewbutton-iconic subviewbutton-back",
      id: PANEL_IDS.detailBackButton,
      closemenu: "none",
      tabindex: "0",
    });
    setNodeL10nAttributes(doc, backButton, L10N_IDS.back);
    backButton.addEventListener("command", () => {
      doc.getElementById(PANEL_IDS.multiview)?.goBack();
      backButton.blur();
    });

    const titleBlock = createHTML(doc, "div", {
      class: "midori-blocker-detail-title-block",
    });
    const title = createHTML(doc, "h2", {
      class: "midori-blocker-detail-title",
    });
    setNodeL10nAttributes(doc, title, L10N_IDS.detailTitle);
    const subtitle = createHTML(doc, "div", {
      class: "midori-blocker-detail-subtitle",
      id: PANEL_IDS.detailSubtitle,
    });
    titleBlock.append(title, subtitle);

    const countPill = createHTML(doc, "span", {
      class: "midori-blocker-count-pill",
      id: PANEL_IDS.detailCountPill,
    });

    header.append(backButton, titleBlock, countPill);
    view.appendChild(header);

    const body = createXUL(doc, "vbox", {
      class: "panel-subview-body",
    });
    body.appendChild(
      createHTML(doc, "div", {
        class: "midori-blocker-detail-body",
        id: PANEL_IDS.detailBody,
      })
    );

    view.appendChild(body);
    return view;
  },

  _buildPanel(doc) {
    const win = doc.defaultView;

    const panel = createXUL(doc, "panel", {
      class: "panel-no-padding",
      id: PANEL_IDS.panel,
      noautofocus: "true",
      orient: "vertical",
      role: "alertdialog",
      type: "arrow",
      "aria-labelledby": PANEL_IDS.heroTitle,
    });

    const multiview = createXUL(doc, "panelmultiview", {
      id: PANEL_IDS.multiview,
      mainViewId: PANEL_IDS.mainView,
    });

    multiview.appendChild(this._buildMainView(doc, win));
    multiview.appendChild(this._buildBlockedListView(doc));
    panel.appendChild(multiview);

    return panel;
  },

  _forEachBrowserWindow(callback) {
    const windows = Services.wm.getEnumerator("navigator:browser");
    while (windows.hasMoreElements()) {
      const win = windows.getNext();
      try {
        callback(win);
      } catch (_) {
        // Keep iterating windows even if one callback fails.
      }
    }
  },

  _forEachTab(win, callback) {
    const tabs = win?.gBrowser?.tabs;
    if (!tabs) {
      return;
    }

    for (const tab of tabs) {
      try {
        callback(tab);
      } catch (_) {
        // Keep iterating tabs even if one callback fails.
      }
    }
  },

  _getCurrentBrowser(win) {
    return win?.gBrowser?.selectedBrowser || null;
  },

  _getCurrentBrowserId(win) {
    return this._getCurrentBrowser(win)?.browsingContext?.top?.browserId || 0;
  },

  _isPrivateWindow(win) {
    return isPrivateBrowsingContext(
      this._getCurrentBrowser(win)?.browsingContext
    );
  },

  _getCurrentHost(win) {
    const uri = this._getCurrentBrowser(win)?.currentURI;
    try {
      if (!uri || (!uri.schemeIs("http") && !uri.schemeIs("https"))) {
        return "";
      }
      return toSafeDomain(uri.asciiHost || uri.host || "");
    } catch (_) {
      // nsIURI.host throws for URI types without an authority component.
      return "";
    }
  },

  _getPanelNode(doc) {
    return doc?.getElementById(PANEL_IDS.panel) || null;
  },

  _handlePanelToggle(win, event) {
    if (event.target?.id !== PANEL_IDS.siteToggle) {
      return;
    }

    const pressed = !!event.target.pressed;
    this._setSiteExceptionForCurrentSite(win, !pressed);
    event.stopPropagation();
  },

  _handleTabOpen(win, event) {
    const newTab = event?.target;
    const gBrowser = win?.gBrowser;
    const newBrowserId =
      gBrowser?.getBrowserForTab?.(newTab)?.browsingContext?.top?.browserId ||
      0;
    const openerURI = newTab?.openerTab
      ? gBrowser.getBrowserForTab?.(newTab.openerTab)?.currentURI
      : null;
    if (
      !newBrowserId ||
      (!openerURI?.schemeIs("http") && !openerURI?.schemeIs("https"))
    ) {
      return;
    }

    MidoriBlockerService.recordNewTabSourceHost(
      newBrowserId,
      openerURI.asciiHost || openerURI.host,
      { isPrivate: this._isPrivateWindow(win) }
    );
  },

  _hidePanelForNode(node) {
    if (!node) {
      return;
    }

    try {
      lazy.CustomizableUI.hidePanelForNode(node);
      return;
    } catch (_) {
      // Fallback below.
    }

    try {
      const panel = node.closest("panel");
      if (panel) {
        node.ownerGlobal.PanelMultiView.hidePopup(panel);
      }
    } catch (_) {
      // Panel may already be hidden.
    }
  },

  _ensurePanelStylesheet(win) {
    if (!win?.windowUtils || this._styledWindows.has(win)) {
      return;
    }

    try {
      win.windowUtils.loadSheetUsingURIString(
        PANEL_STYLESHEET_URI,
        Ci.nsIStyleSheetService.AUTHOR_SHEET
      );
    } catch (_) {
      // Stylesheet may already be loaded or unavailable in this context.
    }

    this._styledWindows.add(win);
  },

  _injectPanelIntoWindow(win) {
    const doc = win?.document;
    if (!doc || this._getPanelNode(doc)) {
      return;
    }

    this._ensurePanelStylesheet(win);
    doc.l10n.addResourceIds(["browser/midori/blocker.ftl"]);

    const popupset =
      doc.getElementById("mainPopupSet") ||
      doc.querySelector("popupset") ||
      doc.documentElement;
    if (!popupset) {
      return;
    }

    popupset.appendChild(this._buildPanel(doc));
  },

  _removePanelFromWindow(win) {
    const panel = this._getPanelNode(win?.document);
    panel?.remove();
  },

  _hookBrowserWindow(win) {
    const gBrowser = win?.gBrowser;
    const tabContainer = gBrowser?.tabContainer;
    if (
      !win?.document ||
      !gBrowser ||
      !tabContainer ||
      this._windowState.has(win)
    ) {
      return;
    }

    this._injectPanelIntoWindow(win);

    const doc = win.document;

    const onLocationChange = (
      browser,
      webProgress,
      _request,
      _location,
      flags = 0
    ) => {
      const isTopLevel = !!webProgress?.isTopLevel;
      const isSameDocument = !!(
        flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT
      );

      if (isTopLevel && !isSameDocument) {
        const browserId = browser?.browsingContext?.top?.browserId || 0;
        if (browserId) {
          MidoriBlockerService.resetBlockedCount(browserId);
        }
      }

      if (win.gBrowser?.selectedBrowser === browser) {
        this._refreshWindow(win);
      }
    };

    const progressListener = {
      onLocationChange,
    };

    const onTabSelect = () => {
      this._refreshWindow(win);
    };

    const onTabClose = () => {
      this._refreshWindow(win);
    };

    const onTabOpen = event => {
      this._handleTabOpen(win, event);
    };

    const onToggle = event => {
      this._handlePanelToggle(win, event);
    };

    const onUnload = () => {
      this._unhookBrowserWindow(win);
    };

    doc.addEventListener("toggle", onToggle, true);
    gBrowser.addTabsProgressListener?.(progressListener);
    tabContainer.addEventListener("TabOpen", onTabOpen);
    tabContainer.addEventListener("TabSelect", onTabSelect);
    tabContainer.addEventListener("TabClose", onTabClose);
    win.addEventListener("unload", onUnload, { once: true });

    this._windowState.set(win, {
      onTabClose,
      onTabOpen,
      onTabSelect,
      onToggle,
      onUnload,
      progressListener,
    });
  },

  _isCurrentPageProtectable(win) {
    return !!this._getCurrentHost(win);
  },

  _onBrowserDelayedStartupFinished(subject) {
    const win = subject;
    if (!win?.gBrowser) {
      return;
    }

    this._hookBrowserWindow(win);
    this._refreshWindow(win);
  },

  _onSiteProtectionEvent(subject) {
    const wrapped = subject?.wrappedJSObject;
    const browser = wrapped?.browser;
    const win = browser?.ownerGlobal;
    if (!win?.gBrowser) {
      return;
    }

    if (win.gBrowser.selectedBrowser === browser) {
      this._refreshWindow(win);
    }
  },

  async _openToolbarPanel(win, event = null) {
    const doc = win?.document;
    if (!doc) {
      return;
    }

    try {
      this._injectPanelIntoWindow(win);
    } catch (error) {
      console.error("[MidoriBlockerPanel] Failed to create panel:", error);
      return;
    }

    const button =
      lazy.CustomizableUI.getWidget(WIDGET_ID)?.forWindow(win)?.node || null;
    const panel = this._getPanelNode(doc);

    if (!button || !panel) {
      return;
    }

    try {
      await lazy.PanelMultiView.openPopup(panel, button, {
        position: "bottomleft topleft",
        triggerEvent: event,
      });
    } catch (error) {
      console.error("[MidoriBlockerPanel] Failed to open panel:", error);
      return;
    }

    try {
      this._refreshWindow(win);
      MidoriBlockerService.prepareBlockedStats(
        this._getCurrentBrowserId(win)
      ).catch(() => {});
    } catch (error) {
      console.error("[MidoriBlockerPanel] Failed to refresh panel:", error);
    }
  },

  _showBlockedListView(win) {
    const doc = win?.document;
    const multiview = doc?.getElementById(PANEL_IDS.multiview);
    if (!multiview) {
      return;
    }

    this._refreshBlockedListView(win);
    try {
      multiview.showSubView(PANEL_IDS.blockedListView);
    } catch (err) {
      console.error("[MidoriBlockerPanel] Failed to open subview:", err);
    }
  },

  _openBlockerPreferences(win, sourceNode = null) {
    this._hidePanelForNode(sourceNode);

    try {
      if (typeof win.openTrustedLinkIn === "function") {
        win.openTrustedLinkIn("about:center#home", "tab");
        return;
      }
    } catch (_) {
      // Fall back to direct preferences opening.
    }

    try {
      if (typeof win.openPreferences === "function") {
        win.openPreferences("panePrivacy", { origin: "midori-blocker" });
      }
    } catch (_) {
      // Fallback opener may be unavailable in non-standard windows.
    }
  },

  _readBlockedCount(browserId) {
    if (!browserId || !lazy.enabled) {
      return 0;
    }

    return Number(MidoriBlockerService.getBlockedCount(browserId) || 0);
  },

  _refreshAllWindows() {
    this._forEachBrowserWindow(win => {
      this._refreshWindow(win);
    });
  },

  _refreshHero(doc, { state, host, total }) {
    const hero = doc.getElementById(PANEL_IDS.hero);
    const heroTitle = doc.getElementById(PANEL_IDS.heroTitle);
    const heroSubtitle = doc.getElementById(PANEL_IDS.heroSubtitle);
    if (!hero || !heroTitle || !heroSubtitle) {
      return;
    }

    hero.setAttribute("state", state);

    switch (state) {
      case "active":
        setNodeL10nAttributes(doc, heroTitle, L10N_IDS.heroCount, {
          count: total,
        });
        setNodeL10nAttributes(doc, heroSubtitle, L10N_IDS.heroSubtitle, {
          host,
        });
        heroSubtitle.hidden = false;
        break;

      case "paused":
        setNodeL10nAttributes(doc, heroTitle, L10N_IDS.heroPaused);
        setNodeL10nAttributes(doc, heroSubtitle, L10N_IDS.heroSubtitle, {
          host,
        });
        heroSubtitle.hidden = false;
        break;

      case "disabled":
        setNodeL10nAttributes(doc, heroTitle, L10N_IDS.disabled);
        heroSubtitle.hidden = true;
        break;

      default:
        setNodeL10nAttributes(doc, heroTitle, L10N_IDS.notAvailable);
        heroSubtitle.hidden = true;
        break;
    }
  },

  _refreshCategories(doc, stats, visible) {
    const categories = doc.getElementById(PANEL_IDS.categories);
    if (!categories) {
      return;
    }

    categories.hidden = !visible;
    if (!visible) {
      return;
    }

    const total = Math.max(
      1,
      CATEGORIES.reduce((sum, c) => sum + (stats.counts[c.key] || 0), 0)
    );

    for (const row of categories.querySelectorAll(
      ".midori-blocker-category-row"
    )) {
      const key = row.getAttribute("data-category");
      const count = stats.counts[key] || 0;
      row.hidden = !count;
      if (!count) {
        continue;
      }

      row.querySelector(".midori-blocker-category-count").textContent =
        String(count);
      row
        .querySelector(".midori-blocker-category-fill")
        .style.setProperty(
          "--midori-blocker-bar-fill",
          `${Math.round((count / total) * 100)}%`
        );
    }
  },

  _refreshFooter(doc) {
    const footerStats = doc.getElementById(PANEL_IDS.footerStats);
    if (!footerStats) {
      return;
    }

    const globalStats = MidoriBlockerService.getGlobalStats();
    const [size, unit] = lazy.DownloadUtils.convertByteUnits(
      globalStats.bytesSaved
    );
    setNodeL10nAttributes(doc, footerStats, L10N_IDS.footerStats, {
      count: globalStats.totalBlocked,
      size: `${size} ${unit}`,
    });
  },

  _refreshAllowlistRow(doc) {
    const count = doc.getElementById(PANEL_IDS.allowlistCount);
    if (!count) {
      return;
    }

    setNodeL10nAttributes(doc, count, L10N_IDS.allowlistCount, {
      count: MidoriBlockerService.getSiteExceptionCount(),
    });
  },

  _buildDomainRow(doc, win, host, entry) {
    const row = createHTML(doc, "div", {
      class: "midori-blocker-domain-row",
    });

    const domain = createHTML(doc, "span", {
      class: "midori-blocker-domain-name",
    });
    domain.textContent = entry.domain;
    row.appendChild(domain);

    if (!MidoriBlockerService.isDomainExceptedOnSite(host, entry.domain)) {
      const allowButton = createHTML(doc, "button", {
        class: "midori-blocker-allow-button",
      });
      setNodeL10nAttributes(doc, allowButton, L10N_IDS.allowDomain, {
        domain: entry.domain,
      });
      allowButton.addEventListener("click", () => {
        MidoriBlockerService.addDomainExceptionForSite(host, entry.domain);
        this._refreshBlockedListView(win);
      });
      row.appendChild(allowButton);
    }

    const count = createHTML(doc, "span", {
      class: "midori-blocker-domain-count",
    });
    setNodeL10nAttributes(doc, count, L10N_IDS.domainCount, {
      count: entry.count,
    });
    row.appendChild(count);

    return row;
  },

  _refreshBlockedListView(win) {
    const doc = win?.document;
    const body = doc?.getElementById(PANEL_IDS.detailBody);
    if (!body) {
      return;
    }

    const host = this._getCurrentHost(win);
    const browserId = this._getCurrentBrowserId(win);
    const stats = MidoriBlockerService.getBlockedStats(browserId);

    const subtitle = doc.getElementById(PANEL_IDS.detailSubtitle);
    if (subtitle) {
      subtitle.textContent = host;
    }

    const countPill = doc.getElementById(PANEL_IDS.detailCountPill);
    if (countPill) {
      countPill.textContent = String(stats.total);
    }

    body.replaceChildren();

    for (const category of CATEGORIES) {
      const count = stats.counts[category.key] || 0;
      if (!count) {
        continue;
      }

      const section = createHTML(doc, "div", {
        class: "midori-blocker-detail-section",
      });
      const heading = createHTML(doc, "h3", {
        class: "midori-blocker-detail-section-heading",
      });
      const headingLabel = createHTML(doc, "span");
      setNodeL10nAttributes(doc, headingLabel, category.sectionL10nId);
      const headingCount = createHTML(doc, "span", {
        class: "midori-blocker-count-pill",
      });
      headingCount.textContent = String(count);
      heading.append(headingLabel, headingCount);
      section.appendChild(heading);

      const entries = stats.entries.filter(e => e.category === category.key);
      if (entries.length) {
        for (const entry of entries) {
          section.appendChild(this._buildDomainRow(doc, win, host, entry));
        }
      } else if (category.key === "popups") {
        const note = createHTML(doc, "div", {
          class: "midori-blocker-detail-note",
        });
        setNodeL10nAttributes(doc, note, L10N_IDS.popupNote, { count });
        section.appendChild(note);
      }

      body.appendChild(section);
    }
  },

  _refreshPanelForWindow(win, blockedCount, enabled) {
    const doc = win?.document;
    if (!doc) {
      return;
    }

    const host = this._getCurrentHost(win);
    const protectable = this._isCurrentPageProtectable(win);
    const activeEnabled = enabled ?? lazy.enabled;
    const browserId = this._getCurrentBrowserId(win);
    const options = { isPrivate: this._isPrivateWindow(win) };
    const excepted = host
      ? MidoriBlockerService.isSiteExcepted(host, options)
      : false;
    const siteBlockingEnabled = activeEnabled && protectable && !excepted;

    const count =
      blockedCount !== undefined
        ? blockedCount
        : this._readBlockedCount(browserId);
    const visibleBadgeCount = siteBlockingEnabled ? count : 0;

    const stats = MidoriBlockerService.getBlockedStats(browserId);
    const panel = this._getPanelNode(doc);
    if (panel?.state === "open") {
      MidoriBlockerService.prepareBlockedStats(browserId).catch(() => {});
    }

    let state = "unavailable";
    if (!activeEnabled) {
      state = "disabled";
    } else if (!protectable) {
      state = "unavailable";
    } else if (excepted) {
      state = "paused";
    } else {
      state = "active";
    }

    this._refreshHero(doc, { state, host, total: count });

    this._refreshCategories(doc, stats, state === "active" && count > 0);

    const pausedCard = doc.getElementById(PANEL_IDS.pausedCard);
    if (pausedCard) {
      const showCard = state === "paused";
      pausedCard.hidden = !showCard;
      if (showCard) {
        setNodeL10nAttributes(doc, pausedCard, L10N_IDS.pausedCard);
      }
    }

    const siteToggle = doc.getElementById(PANEL_IDS.siteToggle);
    if (siteToggle) {
      siteToggle.pressed = siteBlockingEnabled;
      siteToggle.disabled = !activeEnabled || !protectable;
      setNodeL10nAttributes(doc, siteToggle, L10N_IDS.toggle);
    }

    this._refreshAllowlistRow(doc);
    this._refreshFooter(doc);

    const blockedListView = doc.getElementById(PANEL_IDS.blockedListView);
    if (blockedListView?.hasAttribute("visible")) {
      this._refreshBlockedListView(win);
    }

    this._updateToolbarButtonForWindow(
      win,
      visibleBadgeCount,
      protectable,
      state
    );
  },

  _refreshWindow(win) {
    const browserId = this._getCurrentBrowserId(win);

    if (!win?.document) {
      return;
    }

    this._injectPanelIntoWindow(win);

    const blockedCount = this._readBlockedCount(browserId);

    this._refreshPanelForWindow(win, blockedCount, lazy.enabled);
  },

  _setSiteExceptionForCurrentSite(win, disableForSite) {
    const host = this._getCurrentHost(win);
    if (!host) {
      this._refreshWindow(win);
      return;
    }

    if (this._isPrivateWindow(win)) {
      if (disableForSite) {
        MidoriBlockerService.allowSiteForSession(host, { isPrivate: true });
      } else {
        MidoriBlockerService.removeSiteException(host, { isPrivate: true });
      }
    } else if (disableForSite) {
      MidoriBlockerService.addSiteException(host);
    } else {
      MidoriBlockerService.removeSiteException(host);
    }

    const browserId = this._getCurrentBrowserId(win);
    if (browserId) {
      MidoriBlockerService.resetBlockedCount(browserId);
    }

    this._refreshWindow(win);
    this._reloadCurrentTab(win);
  },

  _reloadCurrentTab(win) {
    try {
      win.gBrowser?.reloadTab(win.gBrowser.selectedTab);
      return;
    } catch (_) {
      // Selected tab may be unavailable during teardown.
    }

    try {
      win.BrowserCommands?.reload();
    } catch (_) {
      // Fallback may be unavailable in non-standard windows.
    }
  },

  _unhookBrowserWindow(win) {
    const doc = win?.document;
    if (!doc) {
      return;
    }

    const state = this._windowState.get(win);
    if (state) {
      try {
        doc.removeEventListener("toggle", state.onToggle, true);
        win.gBrowser?.removeTabsProgressListener?.(state.progressListener);
        win.gBrowser?.tabContainer?.removeEventListener(
          "TabOpen",
          state.onTabOpen
        );
        win.gBrowser?.tabContainer?.removeEventListener(
          "TabSelect",
          state.onTabSelect
        );
        win.gBrowser?.tabContainer?.removeEventListener(
          "TabClose",
          state.onTabClose
        );
        win.removeEventListener("unload", state.onUnload);
      } catch (_) {
        // Listeners may already be removed as part of shutdown ordering.
      }

      this._windowState.delete(win);
    }

    this._removePanelFromWindow(win);
    this._styledWindows.delete(win);
  },

  _updateToolbarButtonForWindow(win, blockedCount, protectable, state) {
    const button =
      lazy.CustomizableUI.getWidget(WIDGET_ID)?.forWindow(win)?.node || null;

    if (!button) {
      return;
    }

    button.hidden = !lazy.uiEnabled;

    if (!lazy.uiEnabled) {
      button.removeAttribute("badge");
      button.removeAttribute("page-not-protectable");
      button.removeAttribute("midori-paused");
      return;
    }

    button.setAttribute("badged", "true");

    const paused = state === "paused";
    if (lazy.showBadge && (blockedCount > 0 || paused)) {
      button.setAttribute("badge", String(blockedCount));
    } else {
      button.removeAttribute("badge");
    }

    button.toggleAttribute("midori-paused", paused);
    button.toggleAttribute("page-not-protectable", !protectable);
  },

  init() {
    if (this._initialized) {
      return;
    }

    this._initialized = true;

    if (!this._widgetRegistered) {
      if (lazy.CustomizableUI.getWidget(WIDGET_ID)) {
        lazy.CustomizableUI.destroyWidget(WIDGET_ID);
      }

      const widget = lazy.CustomizableUI.createWidget({
        id: WIDGET_ID,
        type: "button",
        defaultArea: lazy.CustomizableUI.AREA_NAVBAR,
        l10nId: "midori-blocker-toolbar-button",
        onCommand: event => {
          const win =
            event.currentTarget?.ownerDocument?.defaultView ||
            event.target?.ownerDocument?.defaultView;
          this._openToolbarPanel(win, event);
        },
        onCreated: button => {
          button.classList.add("badged-button");
        },
      });

      if (!widget) {
        this._initialized = false;
        throw new Error(`Unable to register ${WIDGET_ID}`);
      }

      this._widgetRegistered = true;
      this._restoreWidgetPlacement();
    }

    for (const topic of OBSERVED_TOPICS) {
      Services.obs.addObserver(this, topic);
    }
    Services.prefs.addObserver(PREF_BRANCH, this);

    this._forEachBrowserWindow(win => {
      this._hookBrowserWindow(win);
      this._refreshWindow(win);
    });
  },

  _restoreWidgetPlacement() {
    const placements = lazy.CustomizableUI.getWidgetIdsInArea(
      lazy.CustomizableUI.AREA_NAVBAR
    );
    const widgetIndex = placements.indexOf(WIDGET_ID);
    const urlbarIndex = placements.indexOf("urlbar-container");

    if (urlbarIndex < 0 || widgetIndex === urlbarIndex - 1) {
      return;
    }

    if (widgetIndex < 0) {
      lazy.CustomizableUI.addWidgetToArea(
        WIDGET_ID,
        lazy.CustomizableUI.AREA_NAVBAR,
        urlbarIndex
      );
      return;
    }

    lazy.CustomizableUI.moveWidgetWithinArea(WIDGET_ID, urlbarIndex);
  },

  observe(subject, topic, data) {
    if (topic === "nsPref:changed") {
      if (String(data || "").startsWith(PREF_BRANCH)) {
        this._refreshAllWindows();
      }
      return;
    }

    switch (topic) {
      case "browser-delayed-startup-finished":
        this._onBrowserDelayedStartupFinished(subject);
        break;

      case TOPIC_CONTENT_BLOCKING_EVENT:
        this._onSiteProtectionEvent(subject);
        break;

      case TOPIC_BLOCKED_COUNT_UPDATED:
      case TOPIC_BLOCKED_COUNTS_CLEARED:
        this._refreshAllWindows();
        break;
    }
  },

  uninit() {
    if (!this._initialized) {
      return;
    }

    this._initialized = false;

    for (const topic of OBSERVED_TOPICS) {
      try {
        Services.obs.removeObserver(this, topic);
      } catch (err) {
        console.warn(
          `[MidoriBlockerPanel] Failed to remove observer for ${topic}:`,
          err
        );
      }
    }

    try {
      Services.prefs.removeObserver(PREF_BRANCH, this);
    } catch (err) {
      console.warn(
        "[MidoriBlockerPanel] Failed to remove pref observer:",
        err
      );
    }

    this._forEachBrowserWindow(win => {
      this._unhookBrowserWindow(win);
    });
  },
};
