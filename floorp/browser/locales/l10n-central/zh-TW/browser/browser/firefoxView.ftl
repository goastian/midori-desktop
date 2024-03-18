# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

toolbar-button-firefox-view =
    .label = { -firefoxview-brand-name }
    .tooltiptext = { -firefoxview-brand-name }
menu-tools-firefox-view =
    .label = { -firefoxview-brand-name }
    .accesskey = F
firefoxview-page-title = { -firefoxview-brand-name }
firefoxview-close-button =
    .title = 關閉
    .aria-label = 關閉
# Used instead of the localized relative time when a timestamp is within a minute or so of now
firefoxview-just-now-timestamp = 剛剛
# This is a headline for an area in the product where users can resume and re-open tabs they have previously viewed on other devices.
firefoxview-tabpickup-header = 接收分頁
firefoxview-tabpickup-description = 開啟其他裝置上的頁面。
# Variables:
#  $percentValue (Number): the percentage value for setup completion
firefoxview-tabpickup-progress-label = 完成 { $percentValue }%
firefoxview-tabpickup-step-signin-header = 無縫切換裝置
firefoxview-tabpickup-step-signin-description = 請先登入或註冊帳號，即可在此處接收手機上的分頁。
firefoxview-tabpickup-step-signin-primarybutton = 繼續
firefoxview-tabpickup-adddevice-header = 與您的手機或平板電腦同步 { -brand-product-name }
firefoxview-tabpickup-adddevice-description = 下載 { -brand-product-name } 行動版並在該裝置登入。
firefoxview-tabpickup-adddevice-learn-how = 了解要怎麼做
firefoxview-tabpickup-adddevice-primarybutton = 下載 { -brand-product-name } 行動版
firefoxview-tabpickup-synctabs-header = 開啟分頁同步
firefoxview-tabpickup-synctabs-description = 允許 { -brand-short-name } 在不同裝置間分享分頁。
firefoxview-tabpickup-synctabs-learn-how = 了解要怎麼做
firefoxview-tabpickup-synctabs-primarybutton = 同步開啟的分頁
firefoxview-tabpickup-fxa-admin-disabled-header = 您的組織已停用同步功能
firefoxview-tabpickup-fxa-admin-disabled-description = 由於您的管理員已停用同步功能，{ -brand-short-name } 無法在裝置間同步分頁。
firefoxview-tabpickup-network-offline-header = 請檢查您的網際網路連線是否正常
firefoxview-tabpickup-network-offline-description = 若您在防火牆或代理伺服器後面，請確認 { -brand-short-name } 可連線至網際網路。
firefoxview-tabpickup-network-offline-primarybutton = 重試
firefoxview-tabpickup-sync-error-header = 同步時遇到問題
firefoxview-tabpickup-generic-sync-error-description = { -brand-short-name } 暫時無法連線到同步服務，請稍候幾分鐘再試一次。
firefoxview-tabpickup-sync-error-primarybutton = 再試一次
firefoxview-tabpickup-sync-disconnected-header = 開啟同步功能即可繼續
firefoxview-tabpickup-sync-disconnected-description = 若要取得您的分頁，需要先在 { -brand-short-name } 開啟同步功能。
firefoxview-tabpickup-sync-disconnected-primarybutton = 到設定中開啟
firefoxview-tabpickup-password-locked-header = 請輸入您的主控密碼來檢視分頁
firefoxview-tabpickup-password-locked-description = 若要取得您的分頁，需要先輸入 { -brand-short-name } 的主控密碼。
firefoxview-tabpickup-password-locked-link = 了解更多
firefoxview-tabpickup-password-locked-primarybutton = 輸入主控密碼
firefoxview-tabpickup-signed-out-header = 登入即可重新連線
firefoxview-tabpickup-signed-out-description = 登入 { -fxaccount-brand-name } 即可重新連線並取回分頁。
firefoxview-tabpickup-signed-out-primarybutton = 登入
firefoxview-tabpickup-syncing = 稍等分頁進行同步，只要一下下即可。
firefoxview-mobile-promo-header = 在手機或平板電腦接收分頁
firefoxview-mobile-promo-description = 若要檢視您最新的行動分頁，請登入 iOS 或 Android 上的 { -brand-product-name }。
firefoxview-mobile-promo-primarybutton = 下載 { -brand-product-name } 行動版
firefoxview-mobile-confirmation-header = 🎉都搞定了！
firefoxview-mobile-confirmation-description = 您現在可以直接開啟平板電腦或手機上的 { -brand-product-name } 分頁。
firefoxview-closed-tabs-title = 最近關閉的分頁
firefoxview-closed-tabs-description2 = 重新開啟您最近在此視窗關閉的分頁。
firefoxview-closed-tabs-placeholder-header = 沒有最近關閉的分頁
firefoxview-closed-tabs-placeholder-body = 當您關閉此視窗中的分頁時，可以在此取回。
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
firefoxview-closed-tabs-dismiss-tab =
    .title = 關閉 { $tabTitle }
# refers to the last tab that was used
firefoxview-pickup-tabs-badge = 最後開啟
# Variables:
#   $targetURI (string) - URL that will be opened in the new tab
firefoxview-tabs-list-tab-button =
    .title = 用新分頁開啟 { $targetURI }
firefoxview-try-colorways-button = 嘗試 Colorways
firefoxview-change-colorway-button = 更改配色
# Variables:
#  $intensity (String): Colorway intensity
#  $collection (String): Colorway Collection name
firefoxview-colorway-description = { $intensity } · { $collection }
firefoxview-synced-tabs-placeholder-header = 還沒有任何東西
firefoxview-synced-tabs-placeholder-body = 下次您在另一台裝置上的 { -brand-product-name } 開啟頁面時，也可以在此處開啟。
firefoxview-collapse-button-show =
    .title = 顯示清單
firefoxview-collapse-button-hide =
    .title = 隱藏清單
firefoxview-overview-nav = 近期瀏覽
    .title = 近期瀏覽

## History in this context refers to browser history

firefoxview-history-nav = 瀏覽紀錄
    .title = 瀏覽紀錄
firefoxview-history-header = 瀏覽紀錄瀏覽紀錄

## Open Tabs in this context refers to all open tabs in the browser

firefoxview-opentabs-nav = 開啟分頁
    .title = 開啟分頁
firefoxview-opentabs-header = 開啟分頁

## Recently closed tabs in this context refers to recently closed tabs from all windows

firefoxview-recently-closed-nav = 最近關閉的分頁
    .title = 最近關閉的分頁
firefoxview-recently-closed-header = 最近關閉的分頁

## Tabs from other devices refers in this context refers to synced tabs from other devices

firefoxview-synced-tabs-nav = 來自其他裝置的分頁
    .title = 來自其他裝置的分頁
firefoxview-synced-tabs-header = 來自其他裝置的分頁

##

# Used for a link in collapsible cards, in the 'Recent browsing' page of Firefox View
firefoxview-view-all-link = 檢視全部
