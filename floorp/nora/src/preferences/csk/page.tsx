/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 import { For } from "solid-js";
 import {
   cskData,
   cskDatumToString,
   currentFocus,
   editingStatus,
   focusElement,
   setCurrentFocus,
   setEditingStatus,
   setFocusElement,
 } from "./setkey";
 import {
   commands,
   csk_category,
 } from "../../components/custom-shortcut-key/commands";
 
 export const CustomShortcutKeyPage = () => {
   return (
     <>
       <div>
         <h1 data-l10n-id="floorp-CSK-title" />
         <xul:description
           class="indent tip-caption needreboot"
           data-l10n-id="floorp-CSK-description"
         />
         <xul:checkbox data-l10n-id="disable-fx-actions" checked={Services.prefs.getBoolPref("floorp.custom.shortcutkeysAndActions.remove.fx.actions", false)} onClick={(ev) => {
           Services.prefs.setBoolPref("floorp.custom.shortcutkeysAndActions.remove.fx.actions", ev.currentTarget.checked);
           if (!Services.prefs.getBoolPref("floorp.enable.auto.restart", false)) {
             (async () => {
               let userConfirm = await confirmRestartPrompt(null);
               if (userConfirm == CONFIRM_RESTART_PROMPT_RESTART_NOW) {
                 Services.startup.quit(
                   Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart
                 );
               }
             })();
           } else {
             window.setTimeout(function () {
               Services.startup.quit(
                 Services.startup.eAttemptQuit | Services.startup.eRestart
               );
             }, 500);
           }
         }} />
       </div>
       <For each={csk_category}>
         {(category) => (
           <xul:vbox class="csks-content-box">
             <h2
               data-l10n-id={"floorp-custom-actions-" + category}
               class="csks-box-title"
             >
               {category}
             </h2>
             <For each={Object.entries(commands)}>
               {([key, value]) =>
                 value.type === category ? (
                   <div class="csks-box-item" style={{ display: "flex" }}>
                     <label
                       style={{ "flex-grow": "1" }}
                       data-l10n-id={
                         "floorp-custom-actions-" +
                         key.replace("floorp-", "").replace("gecko-", "")
                       }
                     >
                       {key}
                     </label>
                     <div style={{
                       display: "flex",
                       "flex-direction": "column-reverse",
                       "justify-content": "right",
                       "align-content": "end",
                       "align-items": "end"
                     }}>
                       <label class="csks-error-message" data-l10n-id="floorp-CSK-error" />
                       <input
                         value={
                           currentFocus() === key && editingStatus() !== null
                             ? editingStatus()!
                             : cskDatumToString(cskData(), key)
                         }
                         onFocus={(ev) => {
                           if (focusElement() === ev.currentTarget) {
                             return;
                           }
                           focusElement()?.classList.remove("csk-error");
                           setCurrentFocus(key);
                           setFocusElement(ev.currentTarget);
                         }}
                         onBlur={(ev) => {
                           setEditingStatus(null);
                           if (currentFocus() === key) {
                             setCurrentFocus(null);
                           }
                         }}
                         readonly={true}
                         placeholder="Type a shortcut"
                         style={{
                           "border-radius": "4px",
                           color: "inherit",
                           padding: "6px 10px",
                           "background-color": "transparent !important",
                           transition: "all .2s ease-in-out !important",
                         }}
                       />
                     </div>
                   </div>
                 ) : undefined
               }
             </For>
           </xul:vbox>
         )}
       </For>
     </>
   );
 };
 