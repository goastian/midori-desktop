/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class MidoriResourceTabChild extends globalThis.JSWindowActorChild {
  receiveMessage(message) {
    if (message.name === 'MidoriResourceTab:PersistHistory') {
      if (this.inspect(true, false).protected) return false;
      SessionStoreUtils.persistHistoryState(this.document);
      return true;
    }
    const pausing = ['MidoriResourceTab:PauseState', 'MidoriResourceTab:PauseProtection'].includes(message.name);
    if (!pausing && message.name !== 'MidoriResourceTab:Protected') return true;
    const collectForms = message.name === 'MidoriResourceTab:PauseState';
    const state = this.inspect(pausing, collectForms);
    return collectForms ? state : state.protected;
  }

  inspect(allowForms, collectForms) {
    const protectedState = { protected: true, forms: [] };
    const document = this.document;
    if (!document || document.readyState !== 'complete') return protectedState;
    const requests = this.docShell.QueryInterface(Ci.nsIDocumentLoader).loadGroup.requests;
    for (const request of requests) {
      let channel;
      try { channel = request.QueryInterface(Ci.nsIHttpChannel); } catch { continue; }
      if (request.isPending() && !['GET', 'HEAD'].includes(channel.requestMethod)) return protectedState;
    }
    if (document.querySelector('[contenteditable]:not([contenteditable="false"])')) return protectedState;
    const forms = [];
    const fieldLimit = Services.prefs.getIntPref('browser.sessionstore.dom_form_limit', 2 * 1024 * 1024);
    const formLimit = Services.prefs.getIntPref('browser.sessionstore.dom_form_max_limit', 50 * 1024 * 1024);
    let formSize = 0;
    for (const input of document.querySelectorAll('input, textarea, select')) {
      if (input.textLength > fieldLimit || input.files?.length ||
          input.type === 'password' && input.value) return protectedState;
      let changed;
      let value;
      if (input.localName === 'select') {
        changed = [...input.options].some(option => option.selected !== option.defaultSelected);
        value = input.multiple ? [...input.selectedOptions].map(option => option.value) :
          { selectedIndex: input.selectedIndex, value: input.value };
      } else if (input.type === 'checkbox' || input.type === 'radio') {
        changed = input.checked !== input.defaultChecked;
        value = input.checked;
      } else {
        changed = input.value !== input.defaultValue;
        value = input.value;
      }
      if (!changed) continue;
      if (!allowForms || this.browsingContext.parent || !input.id || input.id.length > formLimit ||
          document.querySelectorAll(`#${document.defaultView.CSS.escape(input.id)}`).length !== 1 ||
          /(?:^|\s)(?:off|one-time-code|cc-\S+)(?:\s|$)/i.test(input.autocomplete)) return protectedState;
      const size = typeof value === 'string' ? value.length : typeof value === 'boolean' ? value ? 4 : 5 :
        Array.isArray(value) ? value.reduce((sum, item) => sum + item.length, 0) : value.value.length;
      formSize += size + input.id.length;
      if (size > fieldLimit || formSize > formLimit) return protectedState;
      if (collectForms) forms.push({ id: input.id, value });
    }
    return { protected: [...document.querySelectorAll('audio, video')].some(media => !media.paused), forms };
  }
}
