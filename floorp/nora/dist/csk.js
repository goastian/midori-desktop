import { c as createSignal, a as createEffect, z as zCSKData, b as checkIsSystemShortcut, d as createElement, i as insertNode, s as setProp, e as createComponent, F as For, f as csk_category, g as insert, h as commands, j as effect, S as Show, r as render } from "./assets/utils.js";
const [editingStatus, setEditingStatus] = createSignal(
  null
);
const [currentFocus, setCurrentFocus] = createSignal(null);
createEffect(() => {
  console.log(currentFocus() !== null);
  Services.obs.notifyObservers(
    {},
    "nora-csk",
    JSON.stringify({
      type: "disable-csk",
      data: currentFocus() !== null
    })
  );
});
const [cskData, setCSKData] = createSignal(
  //TODO: safely catch
  zCSKData.parse(
    JSON.parse(
      Services.prefs.getStringPref("floorp.browser.nora.csk.data", "{}")
    )
  )
);
function cskDatumToString(data, key) {
  if (key in data) {
    const datum = data[key];
    return `${(datum == null ? void 0 : datum.modifiers.ctrl) ? "Ctrl + " : ""}${(datum == null ? void 0 : datum.modifiers.alt) ? "Alt + " : ""}${(datum == null ? void 0 : datum.modifiers.shift) ? "Shift + " : ""}${datum == null ? void 0 : datum.key}`;
  }
  return "";
}
createEffect(() => {
  Services.prefs.setStringPref(
    "floorp.browser.nora.csk.data",
    JSON.stringify(cskData())
  );
  Services.obs.notifyObservers(
    {},
    "nora-csk",
    JSON.stringify({
      type: "update-pref"
    })
  );
});
function initSetKey() {
  document.addEventListener("keydown", (ev) => {
    const key = ev.key;
    const alt = ev.altKey;
    const ctrl = ev.ctrlKey;
    const shift = ev.shiftKey;
    const meta = ev.metaKey;
    if (shift && !alt && !ctrl && !meta) {
      return;
    }
    if (key === "Escape" || key === "Tab") {
      return;
    }
    const focus = currentFocus();
    if (!(alt || ctrl || shift || meta)) {
      if (key === "Delete" || key === "Backspace") {
        if (focus) {
          ev.preventDefault();
          const temp = cskData();
          for (const key2 of Object.keys(temp)) {
            if (key2 === focus) {
              delete temp[key2];
              setCSKData(temp);
              setEditingStatus(cskDatumToString(cskData(), focus));
              break;
            }
          }
          console.log(cskData());
        }
        return;
      }
    }
    if (focus) {
      ev.preventDefault();
      if (["Control", "Alt", "Meta", "Shift"].filter((k) => key.includes(k)).length === 0) {
        if (checkIsSystemShortcut(ev)) {
          console.warn(`This Event is registered in System: ${ev}`);
          return;
        }
        setCSKData({
          ...cskData(),
          [focus]: {
            key,
            modifiers: {
              alt,
              ctrl,
              meta,
              shift
            }
          }
        });
        setEditingStatus(cskDatumToString(cskData(), focus));
      }
    }
  });
}
const CustomShortcutKeyPage = () => {
  return [(() => {
    var _el$ = createElement("div"), _el$2 = createElement("h1"), _el$3 = createElement("xul:description"), _el$4 = createElement("xul:checkbox");
    insertNode(_el$, _el$2);
    insertNode(_el$, _el$3);
    insertNode(_el$, _el$4);
    setProp(_el$2, "data-l10n-id", "floorp-CSK-title");
    setProp(_el$3, "class", "indent tip-caption");
    setProp(_el$3, "data-l10n-id", "floorp-CSK-description");
    setProp(_el$4, "data-l10n-id", "disable-fx-actions");
    return _el$;
  })(), createComponent(For, {
    each: csk_category,
    children: (category2) => (() => {
      var _el$5 = createElement("xul:vbox"), _el$6 = createElement("h2");
      insertNode(_el$5, _el$6);
      setProp(_el$5, "class", "csks-content-box");
      setProp(_el$6, "data-l10n-id", "floorp-custom-actions-" + category2);
      setProp(_el$6, "class", "csks-box-title");
      insert(_el$6, category2);
      insert(_el$5, createComponent(For, {
        get each() {
          return Object.entries(commands);
        },
        children: ([key, value]) => value.type === category2 ? (() => {
          var _el$7 = createElement("div"), _el$8 = createElement("label"), _el$9 = createElement("input");
          insertNode(_el$7, _el$8);
          insertNode(_el$7, _el$9);
          setProp(_el$7, "class", "csks-box-item");
          setProp(_el$7, "style", {
            display: "flex"
          });
          setProp(_el$8, "style", {
            "flex-grow": "1"
          });
          insert(_el$8, key);
          setProp(_el$9, "onFocus", (ev) => {
            setCurrentFocus(key);
          });
          setProp(_el$9, "onBlur", (ev) => {
            setEditingStatus(null);
            if (currentFocus() === key) {
              setCurrentFocus(null);
            }
          });
          setProp(_el$9, "readonly", true);
          setProp(_el$9, "placeholder", "Type a shortcut");
          setProp(_el$9, "style", {
            "border-radius": "4px",
            color: "inherit",
            padding: "6px 10px",
            "background-color": "transparent !important",
            border: "1px solid var(--input-border-color) !important",
            transition: "all .2s ease-in-out !important"
          });
          effect((_p$) => {
            var _v$ = "floorp-custom-actions-" + key.replace("floorp-", "").replace("gecko-", ""), _v$2 = currentFocus() === key && editingStatus() !== null ? editingStatus() : cskDatumToString(cskData(), key);
            _v$ !== _p$.e && (_p$.e = setProp(_el$8, "data-l10n-id", _v$, _p$.e));
            _v$2 !== _p$.t && (_p$.t = setProp(_el$9, "value", _v$2, _p$.t));
            return _p$;
          }, {
            e: void 0,
            t: void 0
          });
          return _el$7;
        })() : void 0
      }), null);
      return _el$5;
    })()
  })];
};
const [showCSK, setShowCSK] = createSignal(false);
const onHashChange = (ev) => {
  switch (location.hash) {
    case "#csk": {
      setShowCSK(true);
      break;
    }
    default: {
      setShowCSK(false);
    }
  }
};
function initHashChange() {
  window.addEventListener("hashchange", onHashChange);
  onHashChange();
}
function csk() {
  initSetKey();
  return (() => {
    var _el$ = createElement("section");
    setProp(_el$, "id", "nora-csk-entry");
    insert(_el$, createComponent(Show, {
      get when() {
        return showCSK();
      },
      get children() {
        return createComponent(CustomShortcutKeyPage, {});
      }
    }));
    return _el$;
  })();
}
function category() {
  return (() => {
    var _el$ = createElement("xul:richlistitem"), _el$2 = createElement("xul:image"), _el$3 = createElement("xul:label");
    insertNode(_el$, _el$2);
    insertNode(_el$, _el$3);
    setProp(_el$, "id", "category-csk");
    setProp(_el$, "class", "category");
    setProp(_el$, "value", "paneCsk");
    setProp(_el$, "helpTopic", "prefs-csk");
    setProp(_el$, "data-l10n-id", "category-CSK");
    setProp(_el$, "data-l10n-attrs", "tooltiptext");
    setProp(_el$, "align", "center");
    setProp(_el$2, "class", "category-icon");
    setProp(_el$3, "class", "category-name");
    setProp(_el$3, "flex", "1");
    setProp(_el$3, "data-l10n-id", "category-CSK-title");
    return _el$;
  })();
}
function initScripts() {
  const init = () => {
    var _a;
    insert(
      document.querySelector("#categories"),
      category(),
      document.getElementById("category-Downloads")
    );
    render(csk, document.querySelector(".pane-container"));
    initHashChange();
    switch (location.hash) {
      case "#csk": {
        (_a = document.getElementById("category-csk")) == null ? void 0 : _a.click();
        break;
      }
    }
  };
  if (document.readyState !== "loading") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
}
initScripts();
//# sourceMappingURL=csk.js.map
