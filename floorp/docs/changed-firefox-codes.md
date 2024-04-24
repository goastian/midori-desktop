## Firefox's changed codes


### First

This docs for changed codes in Firefox. This file not include replace "Firefox" string with "Floorp" string. This file include only changed codes.

Replace string commit is: https://github.com/Floorp-Projects/Floorp/commit/29876e196b616d970cda21c4516570ca9e755bd0

### Repalced points

1. browser/base/content/tabbrowser.js | browser/components/sessionstore/TabState.sys.mjs | browser\components\sessionstore\*

**Feature: "workspaces"**

changed: "Workspace attributions save feature in sessionstore"

URL: https://github.com/Floorp-Projects/Floorp/commit/620ade84aec74fe2980d00e4985c894346374c2d

---

2. browser\base\content\aboutDialog.xhtml

**Feature: "about:Dialog" (about:dialog)**

changed: "Replace "Firefox" to "Floorp"."

URL: https://github.com/Floorp-Projects/Floorp/commit/ebef6dcb88e8116514d3535ab4ca9c71217c3fcc

---

3. browser\base\content\browser-box.inc.xhtml

**Feature: "BMS"**

changed: "Insert BMS & webpanel XHTML codes."

URL: https://github.com/Floorp-Projects/Floorp/commit/ae8ff28138e127f598e30874c5d6a9117da655ef

---

4. browser\base\content\browser.xhtml

**Feature: "BMS, Workspaces & localize"**

changed: "Insert BMS & Workspaces context menu & localize codes."

URL: https://github.com/Floorp-Projects/Floorp/commit/ae8ff28138e127f598e30874c5d6a9117da655ef

---

5. browser\base\content\default-bookmarks.html

**Feature: "Default bookmarks"**

changed: "Replace default bookmarks."

URL: https://github.com/Floorp-Projects/Floorp/commit/4f6fa16241bca141d015e47b1e8c438356303fc7

---

6. browser\base\content\tabbrowser-tabs.js

**Feature: "Vertical tabs"**

changed: "Insert vertical tabs codes."

URL: https://github.com/Floorp-Projects/Floorp/commit/c66e30a33e3f3098196e8b0b66592089a9792301#diff-d7f1a53af718729a44fb78c6c76ec224f73b14e55160ffb844625989b7c10d1b

---

7. browser\branding\*

**Feature: "Branding"**

changed: "Replace Firefox branding to Floorp branding."

URL: https://github.com/Floorp-Projects/Floorp/commit/cf24423a1f1786ff5fab17acb88a714794a7ce0b

8. browser\components\about\*

**Feature: "about:*"**

changed: "Add Floorp pages for about:*"

URL: https://github.com/Floorp-Projects/Floorp/commit/636326dcdea4db14401eca7f09fc2537deac1b98

NOTICE: This commit is not completeley. Please see raw file on current branch.

---

9. browser\components\extensions\parent\ext-sidebarAction.js

**Feature: "BSM"**

changed: "BMS use sidebarAction API. Inject for save sidebarAction API's information."

URL: https://github.com/Floorp-Projects/Floorp/commit/2fca0b10dd7e6e06c58e5cc637998dfcfc87866c

---

10. browser\components\newtab\*

**Feature: "Newtab"**

changed: "Replace Firefox's newtab to Floorp's newtab."

URL: https://github.com/Floorp-Projects/Floorp/pull/269 (PR)

---

11. browser\components\BrowserGlue.sys.mjs

**Feature: "Startup"**

changed: "Insert startup codes."

URL: https://github.com/Floorp-Projects/Floorp/commit/f2f1a651c90cb117b887f83697b624ffbc952436

---

12. browser\themes\shared\*

changed: "Insert Floorp's themes."

URL: https://github.com/Floorp-Projects/Floorp/commit/ff13fc3e8e0a64028bbea0c565156e79f8eda8aa

---

13. ./.mozbuild

changed: "Connect Floorp Core to Gecko of Firefox."

URL: https://github.com/Floorp-Projects/Floorp/commit/32b43fa707b60d668841012cfcab7247de07d103


---

14. browser\components\BrowserContentHandler.sys.mjs

**Feature: "Release Note (Upgrade Floorp)"**

changed: "Insert release note codes. If lang start with "ja", open spesific URL for Japanese users."

URL: https://github.com/Floorp-Projects/Floorp/commit/91a52b0d8c24dc37318e621d97925c93c523ccfd

15. browser\components\newtab\lib\TopSitesFeed.jsm | browser\components\newtab\data\content\tippytop\top_sites.json

**Feature: "Newtab"**

changed: "Replace Firefox's newtab sponsors to Floorp's newtab sponsors."

URL: https://github.com/Floorp-Projects/Floorp/commit/80f761b0e9fe7b9ab9383f9f590b822a841c2428

---

16. browser/modules/AsyncTabSwitcher.jsm | dom/ipc/BrowserChild.cpp & BrowserHost.cpp & dom/ipc/BrowserParent.cpp

**Feature: "Split View"**

changed: "Insert split view codes."

URL: https://github.com/Floorp-Projects/Floorp/commit/595e139fe7f51a58481939788668adb947396425


---

17. browser/base/content/browser-tabsintitlebar.js | browser/base/content/browser.js

**Feature: "Site Specific Browser"**

changed: "Insert Site Specific Browser codes."

URL: https://github.com/Floorp-Projects/Floorp/commit/c3041c9aebd207d42e8da75ea298cecd7c573196

---

18. browser/app/moz.build

**Feature: "Branding"**

changed: "Replace PDF Document icon to Floorp's PDF Document icon."

URL:

---

19. browser/base/content/browser.js

**Feature: "onLocationChange"**

changed: "Insert onLocationChange codes."
Line: 5312

URL: [Searchfox](https://searchfox.org/mozilla-central/source/browser/base/content/browser.js#5312)

---