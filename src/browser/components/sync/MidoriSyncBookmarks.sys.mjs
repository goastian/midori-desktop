/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PlacesUtils } from "resource://gre/modules/PlacesUtils.sys.mjs";
import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";

const encoder = new TextEncoder();
const GUID = /^[A-Za-z0-9_-]{12}$/;
export const SYNC_BOOKMARK_ROOTS = Object.freeze(["menu________", "toolbar_____", "unfiled_____", "mobile______"]);
const RESERVED_GUIDS = new Set([...SYNC_BOOKMARK_ROOTS, "root________", "tags________", "new_________",
  "menu_______v", "toolbar____v", "unfiled____v", "mobile_____v"]);
const CAPTURE_EVENTS = ["bookmark-added", "bookmark-removed", "bookmark-moved", "bookmark-title-changed", "bookmark-url-changed", "bookmark-time-changed", "bookmark-guid-changed", "bookmark-tags-changed", "bookmark-keyword-changed"];
const STRUCTURE = ["version", "kind", "parentGuid", "index", "title", "url", "dateAdded"];
const MAX_TAGS = 32;
const MAX_LABEL_UNITS = 100;

function codePointCompare(left, right) {
  const a = Array.from(left, character => character.codePointAt(0));
  const b = Array.from(right, character => character.codePointAt(0));
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) {
      return a[index] - b[index];
    }
  }
  return a.length - b.length;
}

function canonicalTags(tags) {
  const unique = new Set();
  for (const tag of tags ?? []) {
    if (typeof tag === "string" && tag && tag.length <= MAX_LABEL_UNITS && tag.trim() === tag && !/\p{Cc}/u.test(tag)) {
      unique.add(tag);
    }
  }
  return [...unique].sort(codePointCompare).slice(0, MAX_TAGS);
}

function validKeyword(keyword) {
  return typeof keyword === "string" && keyword && keyword.length <= MAX_LABEL_UNITS &&
    !/[\p{Cc}\s]/u.test(keyword) && keyword === keyword.toLowerCase();
}

function structure(value) {
  return value === null ? null : Object.fromEntries(STRUCTURE.map(field => [field, value[field]]));
}

export class MidoriSyncBookmarks {
  #model;
  #bookmarks;
  #closed = false;
  #abort = new AbortController();
  #observers;
  #tagging;
  #keywords;
  #subscriptions = new Set();

  constructor({ bookmarks = PlacesUtils.bookmarks, observers = PlacesUtils.observers,
    tagging = PlacesUtils.tagging, keywords = PlacesUtils.keywords,
    model = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto) } = {}) {
    this.#bookmarks = bookmarks;
    this.#tagging = tagging;
    this.#keywords = keywords;
    this.#observers = observers;
    this.#model = model;
  }

  observe(listener) {
    this.#ensureOpen();
    const callback = events => {
      if (this.#closed) {
        return;
      }
      for (const event of events) {
        if (!event.isTagging && GUID.test(event.guid) && !RESERVED_GUIDS.has(event.guid)) {
          listener({ id: event.guid, parents: [event.parentGuid, event.oldParentGuid].filter(id => GUID.test(id)),
            subtree: event.type === "bookmark-guid-changed" ||
              (event.itemType === this.#bookmarks.TYPE_FOLDER && ["bookmark-added", "bookmark-moved"].includes(event.type)) });
        }
      }
    };
    this.#observers.addListener(CAPTURE_EVENTS, callback);
    const unsubscribe = () => {
      if (this.#subscriptions.delete(unsubscribe)) {
        this.#observers.removeListener(CAPTURE_EVENTS, callback);
      }
    };
    this.#subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  matchesLocal(_id, current, base, position) {
    return this.#same(current, base && position ? { ...base, ...position } : base);
  }

  async validate(id, value) {
    const canonical = await this.#process({ action: "validate", id, value });
    if (canonical.url !== null) {
      let url;
      try {
        url = new URL(canonical.url).href;
      } catch {
        throw new SyncProtocolError("invalid_record");
      }
      if (url !== canonical.url) {
        return this.#process({ action: "validate", id, value: { ...canonical, url } });
      }
    }
    return canonical;
  }

  async read(id) {
    this.#ensureOpen();
    this.#validateId(id);
    const item = await this.#bookmarks.fetch(id);
    this.#ensureOpen();
    if (!item) {
      return null;
    }
    await this.#checkAncestors(item.parentGuid, id);
    return this.#describe(item);
  }

  async readPage(parentGuid, { index = 0, limit = 100 } = {}) {
    this.#ensureOpen();
    if (!GUID.test(parentGuid) || !Number.isInteger(index) || index < 0 || index > 1000000 ||
        !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new SyncProtocolError("invalid_bookmark_query");
    }
    await this.#checkAncestors(parentGuid);
    const parent = await this.#bookmarks.fetch(parentGuid);
    this.#ensureOpen();
    if (!parent || parent.type !== this.#bookmarks.TYPE_FOLDER) {
      throw new SyncProtocolError("bookmark_parent_missing");
    }
    const entries = [];
    for (let offset = 0; offset < limit; offset++) {
      const item = await this.#bookmarks.fetch({ parentGuid, index: index + offset });
      this.#ensureOpen();
      if (!item) {
        return { entries, nextIndex: null };
      }
      entries.push({ id: item.guid, value: await this.#describe(item) });
    }
    return { entries, nextIndex: index + entries.length };
  }

  async plan(incoming, previous = null) {
    const { id, current, base, remote } = await this.#inputs(incoming, previous);
    const decision = await this.#process({ action: "merge", id, base, local: current, remote });
    return { current, decision };
  }

  async prepare(incoming, previous = null, { position = null } = {}) {
    position = structuredClone(position);
    const { id, current, base, remote } = await this.#inputs(incoming, previous);
    const prepared = await this.#process({ action: "prepare", id, base, local: current, remote, localPosition: position });
    return { version: 1, id, current, ...prepared };
  }

  async applyPrepared(plan) {
    this.#ensureOpen();
    if (this.#bookmarks.midoriConditionalVersion !== 1) {
      throw new SyncProtocolError("bookmarks_api_unavailable");
    }
    plan = structuredClone(plan);
    if (plan?.version !== 1) {
      throw new SyncProtocolError("invalid_bookmark_plan");
    }
    this.#validateId(plan.id);
    const { current, decision } = plan;
    if (decision.status === "apply") {
      const actual = await this.read(plan.id);
      if (!this.#same(actual, current)) {
        if (this.#same(actual, decision.value)) {
          return { status: "applied", position: plan.position, effects: plan.effects };
        }
        return { status: "conflict", reason: "application_state_changed" };
      }
    }
    let outcome;
    try {
      outcome = await this.#write(plan.id, current, decision);
    } catch (error) {
      if (["bookmark_changed", "bookmark_parent_changed", "bookmark_position_changed"].includes(error.code)) {
        return { status: "deferred", reason: error.code };
      }
      throw error;
    }
    return outcome.status === "applied" ? { ...outcome, position: plan.position, effects: plan.effects } : outcome;
  }

  async repair(value, reason, id) {
    this.#ensureOpen();
    if (!value || !["bookmark", "folder", "separator"].includes(value.kind)) {
      return null;
    }
    const tail = async parentGuid => {
      const last = await this.#bookmarks.fetch({ parentGuid, index: this.#bookmarks.DEFAULT_INDEX });
      this.#ensureOpen();
      return last ? last.index + 1 : 0;
    };
    if (reason === "bookmark_parent_missing") {
      const parentGuid = this.#bookmarks.unfiledGuid;
      return { ...value, parentGuid, index: await tail(parentGuid) };
    }
    if (reason === "bookmark_position_pending") {
      const current = id ? await this.#bookmarks.fetch(id) : null;
      this.#ensureOpen();
      const count = await tail(value.parentGuid) - (current?.parentGuid === value.parentGuid ? 1 : 0);
      return value.index > count ? { ...value, index: count } : null;
    }
    return null;
  }

  positionOf(id, value) {
    if (!GUID.test(id) || RESERVED_GUIDS.has(id) || !value || !["bookmark", "folder", "separator"].includes(value.kind) ||
        !GUID.test(value.parentGuid) || !Number.isInteger(value.index) || value.index < 0 || value.index > 1000000) {
      return null;
    }
    return { parentGuid: value.parentGuid, index: value.index };
  }

  project(id, effects, items) {
    return this.#process({ action: "project", id, effects, items });
  }

  #same(left, right) {
    return left === null || right === null ? left === right :
      STRUCTURE.every(field => left[field] === right[field]) &&
      (left.keyword ?? null) === (right.keyword ?? null) &&
      JSON.stringify(left.tags ?? []) === JSON.stringify(right.tags ?? []);
  }

  #sameStructure(left, right) {
    return left !== null && right !== null && STRUCTURE.every(field => left[field] === right[field]);
  }

  async #labels(item) {
    if (item.type !== this.#bookmarks.TYPE_BOOKMARK) {
      return {};
    }
    const labels = {};
    const tags = canonicalTags(this.#tagging.getTagsForURI(Services.io.newURI(item.url.href)));
    if (tags.length) {
      labels.tags = tags;
    }
    const entry = await this.#keywords.fetch({ url: item.url.href });
    this.#ensureOpen();
    if (entry && !entry.postData && validKeyword(entry.keyword)) {
      labels.keyword = entry.keyword;
    }
    return labels;
  }

  async #applyLabels(value, current) {
    if (value.kind !== "bookmark") {
      return;
    }
    const uri = Services.io.newURI(value.url);
    const wanted = canonicalTags(value.tags);
    const existing = canonicalTags(this.#tagging.getTagsForURI(uri));
    const previous = current?.tags ?? [];
    const remove = existing.filter(tag => previous.includes(tag) && !wanted.includes(tag));
    const add = wanted.filter(tag => !existing.includes(tag));
    if (remove.length) {
      this.#tagging.untagURI(uri, remove, PlacesUtils.bookmarks.SOURCES.SYNC);
    }
    if (add.length) {
      this.#tagging.tagURI(uri, add, PlacesUtils.bookmarks.SOURCES.SYNC);
    }
    const keyword = value.keyword ?? null;
    const currentKeyword = current?.keyword ?? null;
    if (keyword !== currentKeyword) {
      if (currentKeyword && (current.url === value.url || keyword === null)) {
        await this.#keywords.remove({ keyword: currentKeyword, source: PlacesUtils.bookmarks.SOURCES.SYNC });
      }
      if (keyword !== null) {
        const owner = await this.#keywords.fetch(keyword);
        this.#ensureOpen();
        if (owner && owner.url.href !== value.url) {
          return;
        }
        await this.#keywords.insert({ keyword, url: value.url, source: PlacesUtils.bookmarks.SOURCES.SYNC });
      }
    }
    this.#ensureOpen();
  }

  async #inputs(incoming, previous) {
    incoming = structuredClone(incoming);
    previous = structuredClone(previous);
    this.#validateId(incoming?.id);
    if (typeof incoming.deleted !== "boolean" ||
        (previous !== null && (typeof previous.deleted !== "boolean" || (previous.id !== undefined && previous.id !== incoming.id)))) {
      throw new SyncProtocolError("invalid_record");
    }
    const current = await this.read(incoming.id);
    const remote = incoming.deleted ? null : await this.validate(incoming.id, incoming.value);
    const base = previous === null || previous.deleted ? null : await this.validate(incoming.id, previous.value);
    return { id: incoming.id, current, base, remote };
  }

  async apply(incoming, previous = null) {
    this.#ensureOpen();
    incoming = structuredClone(incoming);
    previous = structuredClone(previous);
    if (this.#bookmarks.midoriConditionalVersion !== 1) {
      throw new SyncProtocolError("bookmarks_api_unavailable");
    }
    const { current, decision } = await this.plan(incoming, previous);
    return this.#write(incoming.id, current, decision);
  }

  async #write(id, current, decision) {
    this.#ensureOpen();
    if (this.#bookmarks.midoriConditionalVersion !== 1) {
      throw new SyncProtocolError("bookmarks_api_unavailable");
    }
    if (decision.status === "conflict") {
      return decision;
    }
    if (decision.status === "keep_local") {
      return { status: "applied" };
    }
    if (decision.status !== "apply") {
      throw new SyncProtocolError("invalid_bookmark_decision");
    }
    const value = decision.value;
    try {
      const position = value === null ? null : await this.#position(id, current, value);
      const options = {
        midoriCondition: { version: 1, guid: id, expected: structure(current), position },
        midoriSignal: this.#abort.signal,
      };
      this.#ensureOpen();
      if (value === null) {
        await this.#bookmarks.remove(id, { ...options, preventRemovalOfNonEmptyFolders: true });
      } else {
        const info = { guid: id, parentGuid: value.parentGuid, index: value.index,
          dateAdded: new Date(value.dateAdded), type: value.kind === "bookmark" ? this.#bookmarks.TYPE_BOOKMARK :
            value.kind === "folder" ? this.#bookmarks.TYPE_FOLDER : this.#bookmarks.TYPE_SEPARATOR };
        if (value.kind !== "separator") {
          info.title = value.title;
        }
        if (value.kind === "bookmark") {
          info.url = value.url;
        }
        if (!this.#sameStructure(current, value)) {
          if (current) {
            await this.#bookmarks.update(info, options);
          } else {
            await this.#bookmarks.insert(info, options);
          }
        }
        await this.#applyLabels(value, current);
      }
      this.#ensureOpen();
      return { status: "applied" };
    } catch (error) {
      this.#ensureOpen();
      if (["bookmark_parent_missing", "bookmark_position_pending", "bookmark_folder_not_empty"].includes(error.code)) {
        return { status: "deferred", reason: error.code };
      }
      if (["bookmark_outside_roots", "bookmark_tree_too_deep"].includes(error.code)) {
        return { status: "conflict", reason: error.code };
      }
      throw error;
    }
  }

  close() {
    this.#closed = true;
    for (const unsubscribe of this.#subscriptions) {
      unsubscribe();
    }
    this.#abort.abort();
    this.#model.close();
  }

  async #position(id, current, value) {
    await this.#checkAncestors(value.parentGuid, id);
    const parent = await this.#bookmarks.fetch(value.parentGuid);
    this.#ensureOpen();
    if (!parent || parent.type !== this.#bookmarks.TYPE_FOLDER) {
      throw new SyncProtocolError("bookmark_parent_missing");
    }
    const last = await this.#bookmarks.fetch({ parentGuid: value.parentGuid, index: this.#bookmarks.DEFAULT_INDEX });
    this.#ensureOpen();
    const sameParent = current?.parentGuid === value.parentGuid;
    const count = (last ? last.index + 1 : 0) - (sameParent ? 1 : 0);
    if (value.index > count) {
      throw new SyncProtocolError("bookmark_position_pending");
    }
    const at = async offset => {
      if (offset < 0 || offset >= count) {
        return null;
      }
      const index = offset + (sameParent && current.index <= offset ? 1 : 0);
      const item = await this.#bookmarks.fetch({ parentGuid: value.parentGuid, index });
      this.#ensureOpen();
      return item?.guid ?? null;
    };
    return { parentGuid: value.parentGuid, index: value.index, before: await at(value.index - 1), after: await at(value.index) };
  }

  async #describe(item) {
    const kind = item.type === this.#bookmarks.TYPE_BOOKMARK ? "bookmark" :
      item.type === this.#bookmarks.TYPE_FOLDER ? "folder" :
        item.type === this.#bookmarks.TYPE_SEPARATOR ? "separator" : null;
    return this.validate(item.guid, {
      version: 1, kind, parentGuid: item.parentGuid, index: item.index,
      title: item.title ?? "", url: kind === "bookmark" ? item.url.href : null,
      dateAdded: item.dateAdded.getTime(), ...await this.#labels(item),
    });
  }

  async #checkAncestors(parentGuid, childGuid = null) {
    const seen = new Set(childGuid ? [childGuid] : []);
    for (let depth = 0; depth < 256; depth++) {
      this.#ensureOpen();
      if (SYNC_BOOKMARK_ROOTS.includes(parentGuid)) {
        return;
      }
      if (!GUID.test(parentGuid) || parentGuid === "root________" || parentGuid === "tags________" || seen.has(parentGuid)) {
        throw new SyncProtocolError("bookmark_outside_roots");
      }
      seen.add(parentGuid);
      const parent = await this.#bookmarks.fetch(parentGuid);
      this.#ensureOpen();
      if (!parent || parent.type !== this.#bookmarks.TYPE_FOLDER) {
        throw new SyncProtocolError("bookmark_parent_missing");
      }
      parentGuid = parent.parentGuid;
    }
    throw new SyncProtocolError("bookmark_tree_too_deep");
  }

  #validateId(id) {
    if (!GUID.test(id) || RESERVED_GUIDS.has(id)) {
      throw new SyncProtocolError("invalid_record");
    }
  }

  async #process(request) {
    this.#ensureOpen();
    const bytes = encoder.encode(JSON.stringify(request));
    try {
      if (bytes.length > 524288) {
        throw new SyncProtocolError("record_too_large");
      }
      const response = await this.#model.processBookmark(bytes);
      this.#ensureOpen();
      return JSON.parse(response);
    } catch (error) {
      if (error.result === Cr.NS_ERROR_INVALID_ARG) {
        throw new SyncProtocolError("invalid_record");
      }
      throw error;
    } finally {
      bytes.fill(0);
    }
  }

  #ensureOpen() {
    if (this.#closed) {
      throw new SyncProtocolError("cancelled");
    }
  }
}
