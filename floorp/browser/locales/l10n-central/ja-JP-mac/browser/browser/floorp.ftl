# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

###################################################################### about:Dialog #################################################################################

about-floorp = <label data-l10n-name="floorp-browser-link">{ -brand-product-name }</label> は日本で開発される独立した１つのウェブブラウザーです。 Firefox ベースで <label data-l10n-name="ablaze-Link">{ -vendor-short-name }</label> の下でウェブをより良くするために作られています。 参加・応援をしたいですか？ <label data-l10n-name="helpus-donateLink">寄付</label> をご検討ください。
icon-creator = アイコン作成者：<label data-l10n-name="browser-logo-twitter">@CutterKnife_</label> と <label data-l10n-name="brand-logo-twitter">@mwxdxx</label>
contributors = <label data-l10n-name="about-contributor">貢献者・開発者</label> のリストもご確認ください

#################################################################### about:preferences ####################################################################

pane-design-title = デザイン
category-design =
    .tooltiptext = { pane-design-title }
design-header = デザイン

feature-requires-restart = この機能を変更するには { -brand-short-name } を再起動する必要があります。

tab-width = タブの最小幅
preferences-tabs-newtab-position = 新しいタブの開く位置
open-new-tab-use-default =
 .label =
      { PLATFORM() ->
        [macos] デフォルト設定を使用
       *[other] 既定の設定を使用
     }
open-new-tab-at-the-end =
 .label = 新しいタブをタブバーの最後の位置に開く
open-new-tab-next-to-current =
 .label = 現在のタブの隣に新しいタブを開く
enable-multitab =
 .label = 多段タブを有効にする
multirow-tabs-limit =
 .label = 多段タブの行制限を有効にする
multirow-tabs-newtab =
 .label = 新しいタブボタンを常にタブの列内に配置する
multirow-tabs-value = 多段タブの有効化時の行制限数
enable-tab-sleep =
 .label = タブスリープを有効にする
tab-sleep-settings-button =
    .label = タブスリープの設定
    .accesskey = S
enable-floorp-workspace =
 .label =  ワークスペース機能を有効にする（実験的）
workspace-warring = ワークスペースはタブグループアドオンと併用できません。タブグループアドオンを使用したい場合は、ワークスペースを無効にし、{ -brand-short-name} を再起動してください。
floorp-workspace-settings-button =
    .label = ワークスペースの設定と管理
    .accesskey = B
enable-tab-scroll-reverse =
  .label = タブバーでのスクロールを反転させる
enable-tab-scroll-wrap =
  .label = タブバーでのスクロールをループさせる
tab-sleep-timeout-minutes-value = タブをスリープ状態にするまでの時間 (分)
enable-tab-scroll-change =
 .label = タブをスクロールで切り替える
enable-double-click-block =
 .label = ダブルクリックでタブを閉じる
enable-show-pinned-tabs-title =
 .label = ピン留めされたタブのタイトルを表示する
Mouse-side-button =
  .label =「進む」・「戻る」ボタンを隠す

tabbar-preference = タブバーの設定（実験的）

None-mode =
 .label= 通常モード（変更なし）

hide-horizontality-tabs =
 .label= { -brand-short-name } の組み込みのタブバーを隠す

verticalTab-setting =
 .label = 垂直タブにブラウザーを最適化 (Mac では非互換)

move-tabbar-position =
 .label = タブバーの位置をツールバーの下部に表示 (Mac では非互換)

tabbar-on-bottom =
 .label = タブバーをウインドウの下部に表示

tabbar-favicon-color =
 .label = タブバーの背景色をウェブページに合わせる

tabbar-style-preference = タブスタイル
tabbar-style-description = この設定の完全な適用には、{ -brand-short-name } を再起動する必要があります。
horizontal-tabbar =
 .label = 水平タブ
multirow-tabbar =
 .label = 多段タブ
vertical-tabbar =
 .label = 垂直タブ (実験的)
 
native-tabbar-tip = この機能は Firefox のサイドバーを使用し、サイドバーを使用するアドオン・サイドバーパネルが使用できなくなります。

hover-vertical-tab =
 .label = フォーカスされた場合に垂直タブを展開する

TST = ツリー型タブ

treestyletab-Settings =
  .label = フォーカスされた場合にツリースタイルタブを展開する

about-TST = ツリー型タブは Midori 10 で内蔵されていた垂直タブを作成するアドオンです。このアドオンをインストールすると、固有の設定が使用でき、Midori 10 と同じ使用感に戻せます。

## ↓ Will be deleted
vertical-tab-reverse-position = 垂直タブの位置を反転させる

sidebar-reverse-position-toolbar = サイドバーの位置を反転させる

bookmarks-bar-settings = ブックマークバーの設定（設定の併用不可）
bookmarks-focus-mode =
 .label = ブックマークバーをフォーカスされた場合に表示
bookmarks-bottom-mode =
 .label = ブックマークバーをウインドウの下部に表示

nav-bar-settings = ナビゲーションバーの設定
show-nav-bar-bottom =
 .label = ナビゲーションバーをウインドウの下部に表示 (実験的)

material-effect =
 .label = Mica for Everyone によるマテリアルデザインの効果を有効にする
disable-extension-check-compatibility-option =
 .label = アドオンと互換性があるか確認しない
other-preference = その他の設定

enable-userscript =
 .label = userChrome.js スクリプト・レガシーアドオンのローダーを有効にする
about-legacy-components = この機能を有効にすると予期せぬエラーを発生させる可能性があります。

Search-positon-top =
 .label = 検索バーを上部に表示
allow-auto-restart =
 .label = 再起動が必要な設定を変更した時に自動で再起動する

browser-rest-mode =
 .label = 休憩モードのショートカットキー（F9）を有効にする

disable-fullscreen-notification =
 .label = 動画閲覧時のフルスクリーン通知を無効にする

floorp-updater = { -brand-short-name } のアップデーター設定
enable-floorp-updater =
 .label = { -brand-short-name } のアップデートを起動時に確認する
floorp-update-latest =
 .label = { -brand-short-name } が最新版であることを自動アップデートチェック時に通知する

## system theme color

system-color-settings = ライトモード・ダークモードの双方に設定中のテーマが対応している場合デザインを切り替えられます。
preferences-theme-appearance-header = テーマの外観設定

system-theme-dark =
 .label = ダークモードを有効にする

system-theme-light =
 .label = ライトモードを有効にする

system-theme-auto =
 .label = システムの設定に従う

## user interface prefernces

ui-preference = ユーザーインターフェイスの設定
preferences-browser-appearance-description = ブラウザーの外観設定を決められます。完全テーマのように、５つのデザインの中からブラウザーの外観を変更することができます。

firefox-proton =
 .label = Firefox Proton デザイン

firefox-proton-fix =
 .label = Firefox Proton FIX デザイン

firefox-photon-lepton =
 .label = Firefox Photon・Lepton デザイン

floorp-legacy =
 .label = Midori Legacy デザイン（サポート対象外）

floorp-fluentUI =
 .label = Microsoft Fluent UI デザイン

floorp-fluerialUI =
 .label = Midori Fluerial UI デザイン

floorp-gnomeUI =
 .label = GNOME デスクトップのデザイン（システムテーマ & GTK が必要）

## download mgr
download-notification-preferences = ダウンロード通知の設定
start-always-notify =
 .label = 開始時にのみ通知する
finish-always-notify =
 .label = 終了時にのみ通知する
always-notify =
 .label = 開始時と終了時に通知する
do-not-notify =
 .label = 通知しない

## sidebar
profiles-button-label = プロファイルを管理
floorp-help-button-label = { -brand-short-name } サポート

appmenuitem-reboot =
 .label = 再起動

## useagent

UserAgent-preference = ユーザーエージェント
default-useragent-mode =
 .label =
    { PLATFORM() ->
        [macos] デフォルトユーザーエージェントを使用する
       *[other] 既定のユーザーエージェントを使用する
    }

windows-chrome-useragent-mode =
 .label = Windows 上の Chrome のユーザーエージェントを使用する
macOS-chrome-useragent-mode =
 .label = macOS 上の Chrome のユーザーエージェントを使用する
linux-chrome-useragent-mode =
 .label = Linux 上の Chrome のユーザーエージェントを使用する
mobile-chrome-useragent-mode =
 .label = iOS 上の Chrome のユーザーエージェントを使用する
use-custom-useragent-mode =
 .label = カスタムユーザーエージェントを使用する

## DMR UI
download-mgr-UI =
 .label = ダウンロードマネージャーの UI をシンプルに変更する
downloading-red-color =
 .label = ダウンロード中の表示を赤色に変更する

sidebar-preferences = ブラウザーマネージャーサイドバーの設定
view-sidebar2-right =
 .label = サイドバーを右側に表示する
enable-sidebar2 =
 .label = ブラウザーマネージャーサイドバーを有効にする

custom-URL-option = ウェブパネルの URL 設定
set-custom-URL-button =
    .label = カスタム URL を設定
    .accesskey = S
bsb-header = ブラウザーマネージャーサイドバー
bsb-preferences = ブラウザーマネージャーサイドバーの設定
visible-bms = 
 .label = ブラウザーマネージャーサイドバーを表示する
hide-bms-to-unload-panel =
  .label = パネルを非表示にするときにパネルをアンロードする
pane-BSB-title = ブラウザーマネージャーサイドバー
bsb-context = コンテナタブを選択する
bsb-userAgent-label =
  .label = ユーザーエージェントをモバイルに切り替える
bsb-width = ウェブパネルの幅 (もし0ならグローバル値が使われます)
bsb-page = 開くページ

bsb-add = ブラウザーマネージャーサイドバーのウェブパネルを追加する

bsb-setting = ウェブパネルの設定

bsb-add-title =
 .title = { bsb-add }

bsb-setting-title =
 .title = { bsb-setting }

bsb-browser-manager-sidebar =
  .label = { sidebar2-browser-manager-sidebar }

bsb-bookmark-sidebar =
  .label = { sidebar2-bookmark-sidebar }

bsb-history-sidebar =
  .label = { sidebar2-history-sidebar }

bsb-download-sidebar =
  .label = { sidebar2-download-sidebar }

bsb-notes-sidebar =
  .label = { sidebar2-notes-sidebar }

bsb-TST-sidebar =
  .label = { sidebar2-TST-sidebar }

bsb-website = 
  .label = ウェブサイト

sidebar2-pref-delete =
 .label = 削除

sidebar2-pref-setting =
 .label = 設定

sidebar2-global-width = ウェブパネルの幅のグローバル値

use-icon-provider-option = ウェブパネルのアイコン提供元

use-icon-provider-option-google =
 .label = Google

use-icon-provider-option-duckduckgo =
 .label = DuckDuckGo

use-icon-provider-option-yandex =
 .label = Yandex (中国本土で利用可能)

use-icon-provider-option-hatena =
 .label = Hatena (中国本土で利用可能)

memory-and-performance = メモリとパフォーマンスの設定

min-memory =
    .label = メモリ使用量を最小限にする

balance-memory =
    .label = パフォーマンスとメモリ使用量のバランスを取る

max-memory =
    .label = 最高パフォーマンスを得るためにメモリ使用量を最大限にする（既定）

delete-border-and-roundup-option =
  .label = 枠線をサイトの枠のみにし、{ -brand-short-name } 自体を丸くする

## DualTheme
dualtheme-enable =
 .label = デュアルテーマを有効にする

newtab-background = { -brand-short-name } Home の背景の設定

newtab-background-random-image =
    .label = ランダムな Unsplash の画像を使用する

newtab-background-gradation =
    .label = グラデーション

newtab-background-not-background =
    .label = 背景を表示しない

newtab-background-selected-image =
    .label = 選択されているフォルダ内の画像を使用する

newtab-background-folder = 選択されているフォルダ

newtab-background-folder-reload =
  .label = 画像を再読込する

newtab-background-folder-default =
  .label = 既定値に戻す

newtab-background-folder-open =
  .label = フォルダを開く

newtab-background-folder-choose = フォルダを選ぶ

newtab-background-extensions = 画像の拡張子 (","で区切ります)

disable-blur-on-newtab = 
  .label = { -brand-short-name } Home でのブラー効果を無効にする

## lepton preferences

about-lepton = { -brand-short-name } を Lepton を使用してカスタマイズします。設定の変更に、{ -brand-short-name } の再起動は必要ありません。代わりに Midori は Lepton を再適用します。

lepton-preference-button =
    .label = Lepton の設定を開く
    .accesskey = L

lepton-header = Lepton の設定

lepton-preference = Lepton の UI 設定
photon-mode =
    .label = Photon UI モード

lepton-mode =
    .label = Lepton UI モード

protonfix-mode =
    .label = Proton Fix UI モード

autohide-preference = 自動非表示のカスタマイズ

floorp-lepton-enable-tab-autohide =
    .label = タブバーの自動非表示を有効にする
floorp-lepton-enable-navbar-autohide =
    .label = ナビゲーションバーの自動非表示を有効にする
floorp-lepton-enable-sidebar-autohide =
    .label = サイドバーの自動非表示を有効にする
floorp-lepton-enable-urlbar-autohide =
    .label = URL バーの自動非表示を有効にする
floorp-lepton-enable-back-button-autohide =
    .label = 「戻る」ボタンの自動非表示を有効にする
floorp-lepton-enable-forward-button-autohide =
    .label = 「進む」ボタンの自動非表示を有効にする
floorp-lepton-enable-page-action-button-autohide =
    .label = アドオンのページアクションボタンの自動非表示を有効にする
floorp-lepton-enable-toolbar-overlap =
    .label = ツールバーを URL バーと重ねる
floorp-lepton-enable-toolbar-overlap-allow-layout-shift-autohide =
    .label = ツールバーを URL バーと重ねる (自動非表示を有効にするとレイアウトが崩れる場合があります)

hide-preference = 非表示のカスタマイズ

floorp-lepton-enable-tab_icon-hide =
    .label = タブのアイコンを非表示にする
floorp-lepton-enable-tabbar-hide =
    .label = タブバーを非表示にする
floorp-lepton-enable-navbar-hide =
    .label = ナビゲーションバーを非表示にする
floorp-lepton-enable-sidebar_header-hide =
    .label = サイドバーのヘッダーを非表示にする
floorp-lepton-enable-urlbar_iconbox-hide =
    .label = URL バーのアイコンボックスを非表示にする
floorp-lepton-enable-bookmarkbar_icon-hide =
    .label = ブックマークバーのアイコンを非表示にする
floorp-lepton-enable-bookmarkbar_label-hide =
    .label = ブックマークバーのラベル名を非表示にする
floorp-lepton-enable-disabled_menu-hide =
    .label = 無効なコンテストメニュー・メニューを非表示にする

positon-preferences = 位置のカスタマイズ

floorp-lepton-enable-centered-tab =
    .label = タブ名を中央に配置する
floorp-lepton-enable-centered-urlbar =
    .label = URL バーを中央に配置する
floorp-lepton-enable-centered-bookmarkbar =
    .label = ブックマークバーを中央に配置する

urlbar-preferences = URLバーのカスタマイズ

floorp-lepton-enable-urlbar-icon-move-to-left =
    .label = URL バーのアイコンを左に移動する
floorp-lepton-enable-urlname-go_button_when_typing =
    .label = URL バーで入力中は「移動」ボタンを表示する
floorp-lepton-enable-always-show-page_action =
    .label = アドオンのページアクションボタンを常に表示する

tabbar-preferences = タブバーのカスタマイズ

floorp-lepton-enable-tabbar-positon-as-titlebar =
    .label = タブバーをタイトルバーの位置に配置する
floorp-lepton-enable-tabbar-as-urlbar =
    .label = タブバーを URL バーの位置に配置する

lepton-sidebar-preferences = サイドバーのカスタマイズ
floorp-lepton-enable-overlap-sidebar =
    .label = サイドバーをウェブサイトビューワーの上にオーバーラップする

floorp-home-mode-choice-default =
    .label = Midori Home (既定)
floorp-home-prefs-content-header = Midori Home コンテンツ
floorp-home-prefs-content-description = Midori Home に表示するコンテンツを選びましょう。

## Notes
floorp-notes = { -brand-short-name } Notes
restore-from-backup = Notes をバックアップから復元する
enable-notes-sync = 
 .label = Notes の Firefox Sync による同期を有効にする
about-notes-backup-tips = Midori Notes は、Firefox Sync を使用して、他のデバイスとノートを同期します。ノートを紛失した場合、バックアップから復元することができます。バックアップは { -brand-short-name } を起動すると作成されます。
notes-sync-description = これにより、同期時にメモが上書きされ、コンテンツが失われる問題を解決することができます。
backuped-time = バックアップ時刻
notes-backup-option = バックアップ設定
backup-option-button = バックアップ設定を開く...

restore-from-backup-prompt-title = Midori Notes 復元サービス
restore-from-this-backup = このバックアップの状態に Notes を復元しますか？

restore-button = 復元

## user.js

userjs-button =  user.js オプションを開く... 
userjs-select-option =  user.js を選択 

header-userjs = user.js
userjs-customize = user.js で { -brand-short-name } をカスタマイズする。
about-userjs-customize = user.jsは、{ -brand-short-name } をカスタマイズするための設定ファイルです。user.js はインターネットからダウンロードされ、元の user.js ファイルを上書きします。元の user.js のバックアップをとってから使用してください。ダウンロード先の user.js により発生した問題は Midori は無関係として処理します。

userjs-label = user.js リスト
userjs-prompt = Midori user.js
apply-userjs-attention = これにより、元の user.js ファイルは上書きされます。
apply-userjs-attention2 = 使用する前に、元の user.js ファイルをバックアップしてください。

apply-userjs-button = 適用する

## userjs Options

default-userjs-label = Midori Default
about-default-userjs = テレメトリー無効。様々なカスタマイズが有効なバランスの良い { -brand-short-name } 設定です。

Securefox-label = Yokoffing Securefox
about-Securefox =
  { PLATFORM() ->
     [macos] HTTPS を既定で有効に。サイト分離による Total Cookie Protection。状態やネットワークのパーティショニングを強化。その他、様々な機能強化。
    *[other] HTTPS を既定で有効に。サイト分離による Total Cookie Protection。状態やネットワークのパーティショニングを強化。その他、様々な機能強化。
  }
    
default-label = Yokoffing Default
about-default = 必要なものはすべて。壊れることはありません。これが、あなたの user.js です。

Fastfox-label = Yokoffing Fastfox
about-Fastfox = { -brand-short-name } の閲覧速度を圧倒的に向上させる。Chrome 以上の速度を！

Peskyfox-label = Yokoffing Peskyfox
about-Peskyfox = 新しいタブページの整理をする。ポケットを削除する。コンパクトモードをオプションで復活させる。ウェブページの通知、ポップアップ、その他の迷惑行為を停止する。

Smoothfox-label = Yokoffing Smoothfox
about-Smoothfox = Edge のようなスムーズなスクロールを、お気に入りのブラウザで実現することができます。

# workspaces
floorp-workspaces-title = { -brand-short-name } ワークスペース
workspaces-backup-discription = ワークスペースのバックアップと復元
workspaces-restore-service-title = ワークスペース復元サービス
workspaces-restore-warning = 警告: この操作を実行すると、現在のワークスペースが上書きされ、ブラウザーが数秒の間使えなくなり、ワークスペースが復元されます。この操作は取り消せません。

change-to-close-workspace-popup-option = 
 .label = ワークスペース選択時にワークスペースのポップアップを閉じる
pinned-tabs-exclude-workspace-option = 
 .label = ワークスペースに固定されたタブを含めない

workspaces-reset-title = ワークスペースのリセット
workspaces-reset-label =
    .label = ワークスペースのリセット
workspaces-reset-description = ワークスペースをリセットするとグループ化が解除され、初期状態に戻ります。
workspaces-reset-button = ワークスペースのリセットを実行する...

workspaces-reset-service-title = Midori ワークスペース
workspaces-reset-warning = 警告！この操作を実行すると、すべてのワークスペースが削除され、ブラウザーが数秒間使えなくなります。この操作は取り消せません。

manage-workspace-on-bms-option =
    .label = ブラウザーマネージャーサイドバーでワークスペースを管理する
show-workspace-name-option =
    .label = ワークスペース名を常にアイコンの隣に表示する
change-workspace-with-default-key-option =
    .label = ワークスペースを ↑ または、 ↓ SHIFT キーを同時押しで切り替える
workspaces-manage-title = ワークスペースの管理
workspaces-manage-description = ワークスペースの管理を開きます。アイコンの変更を行えます。
workspaces-manage-label =
    .label = ワークスペースの管理

workspaces-manage-button  = ワークスペースマネージャーを開く... 

select-workspace = ワークスペースを選択
workspace-select-icon = アイコンを選択
 .label = アイコンを選択
workspace-select-container = コンテナーを選択
 .label = コンテナーを選択
workspace-customize = 
 .title = ワークスペースのカスタマイズ

workspace-icon-briefcase =
 .label = 仕事
workspace-icon-cart =
 .label = ショッピング
workspace-icon-circle =
 .label = サークル
workspace-icon-compass =
 .label = 探求
workspace-icon-gear =
 .label = ギア
workspace-icon-dollar =
 .label = 銀行
workspace-icon-fence =
 .label = 柵
workspace-icon-fingerprint =
 .label = 個人
workspace-icon-gift =
 .label = ギフト
workspace-icon-vacation =
 .label = 休暇・旅行
workspace-icon-food =
 .label = 食べ物
workspace-icon-fruit =
 .label = フルーツ
workspace-icon-pet =
 .label = ペット
workspace-icon-tree =
 .label = 植物
workspace-icon-chill =
 .label = プライベート
workspace-icon-question =
 .label = 問題
workspace-icon-star =
 .label = 星

# CSK
floorp-CSK-title = カスタムショートカットキー
floorp-CSK-description = { -brand-short-name } のショートカットキーをカスタマイズします。80 以上のアクションでブラウザーを自由自在に操作してください！これらの設定を適用するには、{ -brand-short-name } を再起動してください。
CSK-reset-title = カスタムショートカットキーをリセットする
CSK-reset-description = カスタムショートカットキーをリセットする
CSK-reset-label = カスタムショートカットキーをリセットする
CSK-reset-button = リセットする...
CSK-manage-title = カスタムショートカットキーの管理

CSK-remove-shortcutkey = ショートカットキーの削除
CSK-remove-shortcutkey-description = 本当にこのショートカットキーを削除しますか？

CSK-restore-default = カスタムショートカットキー

CSK-restore-default-description = 
    { PLATFORM() ->
        [macos] カスタムショートカットキーの設定をデフォルトに戻します。現在の設定は失われます
       *[other] カスタムショートカットキーの設定を既定に戻します。現在の設定は失われます
    }

CSK-reboot-browser-label = カスタムショートカットキーの変更は、{ -brand-short-name } の再起動後に適用されます。
CSK-reboot-browser-button = { -brand-short-name } を再起動する...
### Exsit shortcut key: "S", "shift"
CSK-keyborad-shortcut-info = "{ $key }" と "{ $modifiers }" の組み合わせが設定されています。
CSK-keyborad-shortcut-info-with-keycode = "{ $key }" が設定されています。

CSK-keyborad-shortcut-is-changed = (変更が未適用）

disable-fx-actions =
 .label = Firefox のキーボードショートカットを無効にする
customize-Action =
 .label = このアクションをカスタマイズ
remove-Action =
 .label = このアクションを削除

floorp-custom-actions-tab-action = タブのアクション
floorp-custom-actions-page-action = ページのアクション
floorp-custom-actions-visible-action = 表示方法のアクション
floorp-custom-actions-search-action = 検索のアクション
floorp-custom-actions-tools-action = ツールのアクション
floorp-custom-actions-bookmark-action = ブックマークのアクション
floorp-custom-actions-open-page-action = ページを開くアクション
floorp-custom-actions-history-action = 履歴のアクション
floorp-custom-actions-pip-action = ピクチャーインピクチャーのアクション
floorp-custom-actions-downloads-action = ダウンロードのアクション
floorp-custom-actions-sidebar-action = サイドバーのアクション
floorp-custom-actions-bms-action = ブラウザーマネージャーサイドバーのアクション
floorp-custom-actions-workspace-action = ワークスペースのアクション

## mouse Gesture
mouse-gesture = マウスジェスチャー
mouse-gesture-description = { -brand-short-name } でマウスジェスチャを使用するには、Gesturefy がインストールされている必要があります。
Gesturefy = Gesturefy
about-Gesturefy = Gesturefy はブラウザにマウスジェスチャを追加する拡張機能です。{ -brand-short-name } がこのアドオンのインストールを検出すると、{ -brand-short-name } でしか利用できないジェスチャーコマンドを Gesturefy に追加します。また、このアドオンは新しいタブで動作可能です。

## Translate

TWS = Translate Web Page
about-TWS = Google や Yandexを使って、リアルタイムでページを翻訳します。選択したテキストやページ全体を翻訳することも可能です。新しいタブを開く必要はありません。ウェブページのテキストは、Google や Yandex などに送信されて翻訳されます。

# Privacy Hub
## BlockMoreTracker
privacy-hub-header = プライバシーハブ
block-more-tracker = 更に多くの追跡を遮断する
block-tracker = このセクションでは、ウイルスやトラッカーをブロックするために設計された拡張機能のセットの情報を提供します。これらの拡張機能は、{ -brand-short-name } によって自動的に検出され、表示されます。
view-at-AMO = このアドオンを addons.mozilla.org で見る
uBlock-Origin = uBlock Origin
about-uboori = uBlock Originは、コンテンツフィルタリングのためのブラウザ拡張機能の１つであり、効率的かつ使いやすい方法でプライバシーの保護を主な目的としています。uBlock Originは、広告ブロッカーとしても機能します。
Facebook-Container = Facebook Container
about-Facebook-Container = Facebook がウェブ上であなたを追跡するのを防ぎましょう。Mozilla によって提供される Facebook Container アドオンは、あなたのウェブ活動を Facebook から切り離すのに役立ちます。

## Fingerprint
fingerprint-header = フィンガープリント & IP アドレスの漏洩対策
block-fingerprint =
    { PLATFORM() ->
        [macos] フィンガープリンティングは、ブラウザとオペレーティングシステムの固有の機能に依存する追跡メカニズムです。このセクションでは、デフォルトのブロックを超えてこの保護をさらに強化するための設定が含まれています。
       *[other] フィンガープリンティングは、ブラウザとオペレーティングシステムの固有の機能に依存する追跡メカニズムです。このセクションでは、既定のブロックを超えてこの保護をさらに強化するための設定が含まれています。
    }
enable-firefox-fingerprint-protections = フィンガープリントに対する強力な保護を有効にする
about-firefox-fingerprint-protection = Firefox によるフィンガープリント保護を有効にした場合、強制ライトモード、一部の API を無効にするなどのデメリットがあります。一部のサイトが壊れる可能性もあります。
fingerprint-Protection =
 .label =  フィンガープリント保護
html5-canvas-prompt-settings =
 .label =  HTML5 画像データのアクセス確認プロンプトを自動承認する
canvas-prompt = キャンバス読み取りのプロンプトを自動で拒否する
disable-webgl =
 .label =  WebGL を無効にする
about-webgl = WebGL は、グラフィックを描画するための Javascript API で、GPU を識別するために使用されることがあります。
WebRTC-connection = WebRTC は、リアルタイム通話を実現する規格です。この設定を無効にすると、Discord などが使えなくなります。
WebRTC = 
 .label = WebRTC 接続を有効にする

################################################################### browser ###############################################################

rest-mode = 休憩中
rest-mode-description = 休憩中は、ブラウザーの機能が制限されます。休憩を終了するには、OK をクリックしてください。

Sidebar2 =
  .label = ブラウザーマネージャーサイドバー
  .tooltiptext = サイドバーの表示の切り替える

sidebar2-mute-and-unmute =
  .label = サイドバーの音声をミュート/ミュート解除する
 
sidebar2-unload-panel =
  .label = このパネルをアンロードする

sidebar2-change-ua-panel =
  .label = このパネルでユーザーエージェントをモバイル/デスクトップに切り替える

sidebar2-delete-panel =
  .label = このパネルをサイドバーから削除

sidebar-close-button =
  .tooltiptext = サイドバーを閉じる

sidebar-back-button =
  .tooltiptext = 戻る

sidebar-forward-button =
  .tooltiptext = 進む

sidebar-reload-button =
  .tooltiptext = リロード

sidebar-muteAndUnmute-button =
  .tooltiptext = サイドバーの音声をミュート/ミュート解除する

sidebar2-browser-manager-sidebar = ブラウザマネージャーツール

show-browser-manager-sidebar =
  .tooltiptext = { sidebar2-browser-manager-sidebar }を表示する

sidebar2-bookmark-sidebar = ブックマーク

show-bookmark-sidebar =
  .tooltiptext = { sidebar2-bookmark-sidebar }サイドバーを表示する

sidebar2-history-sidebar = 履歴

show-history-sidebar =
  .tooltiptext = { sidebar2-history-sidebar }サイドバーを表示する

sidebar2-download-sidebar = ダウンロード

show-download-sidebar =
  .tooltiptext = { sidebar2-download-sidebar }を表示する

sidebar2-notes-sidebar = Notes

show-notes-sidebar =
  .tooltiptext = { sidebar2-notes-sidebar }サイドバーを表示する

sidebar2-TST-sidebar = TST

show-TST-sidebar =
  .tooltiptext = { sidebar2-TST-sidebar } サイドバーを表示する

sidebar-add-button =
  .tooltiptext = { bsb-add }

sidebar-addons-button =
  .tooltiptext = アドオンマネージャーを開く

sidebar-passwords-button =
  .tooltiptext = パスワードマネージャーを開く

sidebar-preferences-button =
  .tooltiptext = 設定を開く

sidebar-keepWidth-button =
  .tooltiptext = このパネルで現在のサイズを記憶する

sidebar2-keep-width-for-global =
  .label = 現在のサイズをウェブパネルの幅のグローバル値として設定する

bsb-context-add =
  .label = このページをウェブパネルに追加

bsb-context-link-add =
  .label = リンク先をウェブパネルに追加


#################################################################### menu panel ############################################################

open-profile-dir =
    .label = プロファイルフォルダーを開く
appmenuitem-reboot =
    .label = 再起動

####################################################################### menu ###############################################################

css-menu =
    .label = CSS
    .accesskey = C

css-menubar =
    .label = CSS
    .accesskey = C

rebuild-css =
    .label = ブラウザー CSS を再構築する
    .accesskey = R

make-browsercss-file =
    .label = ブラウザー CSS ファイルを作成する
    .accesskey = M

open-css-folder =
    .label = ブラウザー CSS フォルダーを開く
    .accesskey = O

edit-userChromeCss-editor =
    .label = userChrome.css を編集する

edit-userContentCss-editor =
    .label = userContent.css を編集する

not-found-editor-path = テキストエディターへのパスが見つかりません！
set-pref-description = 以下のフォームに使用したいテキストエディターへのパスを入力してください。
rebuild-complete = 再構築が完了しました。
please-enter-filename = ファイル名を入力してください。

################################################################### Undo-Closed-Tab ###############################################################

undo-closed-tab = 閉じたタブを開く

################################################################### about:addons ###############################################################

# DualTheme
dual-theme-enable-addon-button = 有効化（サブテーマ）
dual-theme-disable-addon-button = 無効化 (サブテーマ)
dual-theme-enabled-heading = 有効（サブテーマ）

##################################################################### migration  ###############################################################

import-from-vivaldi =
    .label = Vivaldi
    .accesskey = V

##################################################################### toolbar ###############################################################

status-bar =
  .label = ステータスバー
  .accesskey = S

##################################################################### Gesturefly ###############################################################

gf-floorp-open-tree-style-tab-name = [Midori] ツリー型タブを開く
gf-floorp-open-tree-style-tab-description = Midoriのツリー型タブをサイドバーを開きます。

gf-floorp-open-bookmarks-sidebar-name = [Midori] サイドバーでブックマークを開く
gf-floorp-open-bookmarks-sidebar-description = Midoriのサイドバーのブックマークを開きます。

gf-floorp-open-history-sidebar-name = [Midori] サイドバーで履歴を開く
gf-floorp-open-history-sidebar-description = Midoriのサイドバーの履歴を開きます。

gf-floorp-open-synctabs-sidebar-name = [Midori] サイドバーで同期タブを開く
gf-floorp-open-synctabs-sidebar-description = Midoriのサイドバーの同期タブを開きます。

gf-floorp-close-sidebar-name = [Midori] サイドバーを閉じる
gf-floorp-close-sidebar-description =

gf-floorp-open-browser-manager-Midoriのサイドバーを閉じます。sidebar-name = [Midori] BMSを開く
gf-floorp-open-browser-manager-sidebar-description = Midoriのブラウザマネージャーサイドバーで最後に開いていたウェブパネルがロードされている場合開きます。

gf-floorp-close-browser-manager-sidebar-name = [Midori] BMSを閉じる
gf-floorp-close-browser-manager-sidebar-description = Midori のブラウザマネージャーサイドバーを閉じます。

gf-floorp-toggle-browser-manager-sidebar-name = [Midori] BMS の表示の切り替える
gf-floorp-toggle-browser-manager-sidebar-description = Midori のブラウザマネージャーサイドバーを表示または非表示にします。

gf-floorp-show-statusbar-name = [Midori] ステータスバーを表示する
gf-floorp-show-statusbar-description = Midoriのステータスバーを表示します。

gf-floorp-hide-statusbar-name = [Midori] ステータスバーを非表示にする
gf-floorp-hide-statusbar-description = Midoriのステータスバーを非表示にします。

gf-floorp-toggle-statusbar-name = [Midori] ステータスバーの表示の切り替え
gf-floorp-toggle-statusbar-description = ステータスバーを表示または非表示にします。

gf-floorp-open-extension-sidebar-name = [Midori] サイドバーで選択したアドオンを開く
gf-floorp-open-extension-sidebar-description = サイドバーで指定したアドオンを開きます。
gf-floorp-open-extension-sidebar-settings-addons-id = アドオン ID
gf-floorp-open-extension-sidebar-settings-addons-id-description = サイドバーで開くアドオンです。
gf-floorp-open-extension-sidebar-settings-list-default = アドオンを選択してください
gf-floorp-open-extension-sidebar-settings-list-unknwon = 不明なアドオン
##################################################################### Midori System Update Portable Version ###############################################################

update-portable-notification-found-title = Midoriの最新バージョンがリリースされました。
update-portable-notification-found-message = ダウンロードしています...
update-portable-notification-ready-title = アップデートする準備ができました。
update-portable-notification-ready-message = 次回ブラウザー起動時にアップデートが開始されます。
update-portable-notification-success-title = アップデートが完了しました！
update-portable-notification-success-message = アップデートが完了しました！新しいバージョンのMidoriをお楽しみください。
update-portable-notification-failed-title = アップデートに失敗しました。
update-portable-notification-failed-redirector-message = アップデートに失敗しました。ブラウザーを再起動すると、問題が解決する場合があります。
update-portable-notification-failed-prepare-message = アップデートの準備に失敗しました。

##################################################################### Open link in external ###############################################################
openInExternal-title = 外部ブラウザーで開く
open-link-in-external-enabled-option =
 .label = 「外部ブラウザーで開く」機能を有効にする
open-link-in-external-select-browser-option = 「外部ブラウザーで開く」で開くブラウザー
open-link-in-external-select-browser-option-default =
 .label =
     { PLATFORM() ->
        [macos] デフォルトブラウザー
       *[other] 既定のブラウザー
     }
open-link-in-external-tab-context-menu = 外部ブラウザーで開く
open-link-in-external-tab-dialog-title-error = エラー
open-link-in-external-tab-dialog-message-default-browser-not-found =
     { PLATFORM() ->
        [macos] デフォルトブラウザーが存在しないか、設定されていません。
       *[other] 既定のブラウザーが存在しないか、設定されていません。
     }
open-link-in-external-tab-dialog-message-selected-browser-not-found = 選択されたブラウザーは存在しません。

######################################################################### Midori Notes ###############################################################

new-memo = 新規作成
memo-title-input-placeholder = ここにタイトルを入力
memo-input-placeholder = ここにメモを入力または貼り付け
delete-memo = 削除
save-memo = 保存
memo-welcome-title = Midori Notes へようこそ !
memo-first-tip = Midori Notes へようこそ！ここでは、使い方を説明します。
memo-second-tip = Midori Notes は、メモを作成・編集・保存・削除するための機能です。メモは、ブラウザーを閉じても保存されます。また、Firefox Syncを使用して、他の端末にも同期することができます。同期を有効にするには、Midori に Firefox アカウントでログインしてください。
memo-third-tip = あなたのメモは Midori ブラウザーの設定に保存されます。Firefox Sync は、パスワードによって暗号化されているため、あなた以外の他の人に見られることはありません。もちろん Ablaze や Midori は、あなたのメモを読むことはできません。Firefox Sync はバックアップ機能ではないため、メモは必ずバックアップを取ってください。
memo-fourth-tip = Midori Notes Midori のブラウザーマネージャーサイドバーまたは、「about:notes」を URL に入力すること開くことができます。
memo-new-title = 新規メモ
chage-view-mode = 編集/表示モード切り替え

######################################################################### workspace ###############################################################

workspace-prompt-title = Midori ワークスペース
please-enter-workspace-name = 新しいワークスペース名を入力してください。
please-enter-workspace-name-2 = 記号と空白以外の文字かつ20文字以内で入力してください。
workspace-error = エラー！
workspace-error-discription = ワークスペース名が空白、長すぎるか既に存在します。

workspace-button = ワークスペース
  .label = ワークスペース
  .tooltiptext = ワークスペース

workspace-default = 
  .label =
     { PLATFORM() ->
        [macos] デフォルトブラウザー
       *[other] 既定のブラウザー
     }
workspace-add = 
 .label= ワークスペースを追加

workspace-context-menu-selected-tab =
 .label = 表示中のタブは他のワークスペースに移動できません。
move-tab-another-workspace =
 .label = 他のワークスペースに移動
workspace-rename = 
  .label = ワークスペース名を変更
workspace-delete = 
  .label = ワークスペースを削除
manage-workspace = ワークスペースを管理

######################################################################### Share mode ###############################################################

sharemode-menuitem =
  .label = 画面共有モード

######################################################################### Like Chrome Download mgr ###############################################################

floorp-delete-all-downloads = 
  .label = すべてのダウンロードを隠す
  .accesskey = D
  .tooltiptext = すべてのダウンロードを隠す

floorp-show-all-downloads =
  .label = すべてのダウンロードを表示
  .accesskey = S
  .tooltiptext = すべてのダウンロードを表示

############################################################################## Welcome page ###############################################################

welcome-login-to-firefox-account = Firefox アカウントにログイン
welcome-to-floorp = { -brand-short-name } へようこそ !
welcome-discribe-floorp = { -brand-short-name } これは、ユーザーのプライバシーとセキュリティに重点を置いた、高速で安全な軽量ブラウザです。
welcome-start-setup = セットアップを開始する
welcome-skip-to-start-browsing = 今すぐブラウジングを開始する
welcome-select-preferences-template = テンプレートを選択
welcome-minimum-template = 梅
welcome-enable-basic-features = 基本的な機能と設定を有効にして、シンプルな体験を。
welcome-medium-template = 竹 (既定)
welcome-enable-some-features = より良い体験のための追加機能と設定を有効にします。
welcome-maximum-template = 松
welcome-enable-most-of-features = 高度な機能と設定を有効にします。ギークなユーザーにお勧めします。
welcome-go-next-setup = 次へ進む
welcome-select-browser-design = ブラウザーのデザインを選択
welcome-discribe-browser-design = サードパーティによる素晴らしいデザインから { -brand-short-name } のデザインを 1 つを選ぶことができます。OS 固有のデザインも about:preferences で利用可能です。
welcome-design-lepton-name = Lepton オリジナルデザイン
welcome-design-photon-name = Lepton Photon デザイン
welcome-design-ProtonFix-name = Lepton ProtonFix デザイン
welcome-design-floorp-fluerial-name = Midori Fluerial デザイン
welcome-design-firefox-proton-name = Firefox Proton デザイン
welcome-import-data = ユーザーデータのインポート
welcome-import-data-description = 迅速なセットアップ！古いブラウザからブックマークやパスワードなどをインポートできます。Firefox ユーザーは Firefox Sync からデータをインポートできます。
welcome-import-data-button = インポートを実行する
welcome-import-data-skip = インポートをスキップする
welcome-select-button = 選択
welcome-finish-setup = セットアップを完了！
welcome-finish-setup-description = これで設定完了です！垂直タブ・アドオン等のその他の設定は、about:preferences から確認できます。{ -brand-short-name } をお楽しみください !
welcomet-finish-setup = ブラウジングを開始する

############################################################# Custom Shortcutkey ###############################################################

category-CSK =
 .label = カスタムショートカットキー
 .tooltiptext = カスタムショートカットキー
category-CSK-title = カスタムショートカットキー
shortcutkey-customize = 
 .title = カスタムショートカットキー
select-shortcutkeyAction = ショートカットキーのアクションを選択
shortcutkey-customize-key-list-placeholder = 入力されたキー
shortcut-key-label = アクションに使用するキー
start-input-button-listen = キー読み取り開始
end-input-button-listen = キー読み取り終了
shortcut-key-description = 「キー読み取り開始」をクリックし、ショートカットキーとして使用したいキーを押します。一部では複数のキーを使用することもできます。他のアクションと重複しないようにしてください。

floorp-custom-actions-open-new-tab = 新しいタブを開く
  .label = 新しいタブを開く
floorp-custom-actions-close-tab = 現在のタブを閉じる
  .label = 現在のタブを閉じる
floorp-custom-actions-open-new-window = 新しいウインドウを開く
  .label = 新しいウインドウを開く
floorp-custom-actions-open-new-private-window = 新しいプライベートウインドウを開く
  .label = 新しいプライベートウインドウを開く
floorp-custom-actions-close-window = 現在のウインドウを閉じる
  .label = 現在のウインドウを閉じる
floorp-custom-actions-restore-last-session = 最後のセッションを復元
  .label = 最後のセッションを復元
floorp-custom-actions-restore-last-window = 最後のウインドウを復元
  .label = 最後のウインドウを復元
floorp-custom-actions-show-next-tab = 次のタブを表示
  .label = 次のタブを表示
floorp-custom-actions-show-previous-tab = 前のタブを表示
  .label = 前のタブを表示
floorp-custom-actions-show-all-tabs-panel = タブ管理パネルを表示
  .label = タブ管理パネルを表示
floorp-custom-actions-send-with-mail = メールで送信・共有
  .label = メールで送信・共有
floorp-custom-actions-save-page = ページを保存
  .label = ページを保存
floorp-custom-actions-print-page = ページを印刷
  .label = ページを印刷
floorp-custom-actions-mute-current-tab = 現在のタブをミュート/ミュート解除
  .label = 現在のタブをミュート/ミュート解除
floorp-custom-actions-show-source-of-page = ページのソースを表示
  .label = ページのソースを表示
floorp-custom-actions-show-page-info = ページ情報を表示
  .label = ページ情報を表示
floorp-custom-actions-zoom-in = ページを拡大
  .label = ページを拡大
floorp-custom-actions-zoom-out = ページを縮小
  .label = ページを縮小
floorp-custom-actions-reset-zoom = ページのズームをリセット
  .label = ページのズームをリセット
floorp-custom-actions-back = ページを戻る
  .label = ページを戻る
floorp-custom-actions-forward = ページを進む
  .label = ページを進む
floorp-custom-actions-reload = ページをリロード
  .label = ページをリロード
floorp-custom-actions-stop = ページの読み込みを停止
  .label = ページの読み込みを停止
floorp-custom-actions-force-reload = 強制リロード
  .label = 強制リロード
floorp-custom-actions-search-in-this-page = このページを検索
  .label = このページを検索
floorp-custom-actions-show-next-search-result = ページ内の次の検索結果を表示
  .label = ページ内の次の検索結果を表示
floorp-custom-actions-show-previous-search-result = ページ内の前の検索結果を表示
  .label = ページ内の前の検索結果を表示
floorp-custom-actions-search-the-web = ウェブを検索
  .label = ウェブを検索
floorp-custom-actions-open-migration-wizard = 移行ウィザードを開く
  .label = 移行ウィザードを開く
floorp-custom-actions-quit-from-application = ブラウザーを終了
  .label = ブラウザーを終了
floorp-custom-actions-enter-into-customize-mode = カスタマイズモードに入る
  .label = カスタマイズモードに入る
floorp-custom-actions-enter-into-offline-mode = オフラインモードに入る
  .label = オフラインモードに入る
floorp-custom-actions-open-screen-capture = スクリーンショットツールを開く
  .label = スクリーンショットツールを開く
floorp-custom-actions-show-pip = ピクチャーインピクチャーを表示
  .label = ピクチャーインピクチャーを表示
floorp-custom-actions-bookmark-this-page = このページをブックマーク
  .label = このページをブックマーク
floorp-custom-actions-open-bookmarks-sidebar = ブックマークサイドバーを開く
  .label = ブックマークサイドバーを開く
floorp-custom-actions-open-bookmark-add-tool = ブックマーク追加ツールを開く
  .label = ブックマーク追加ツールを開く
floorp-custom-actions-open-bookmark-add-toolbar = ブックマーク追加ツールバーを開く
  .label = ブックマーク追加ツールバーを開く
floorp-custom-actions-open-bookmarks-manager = ブックマークマネージャーを開く
  .label = ブックマークマネージャーを開く
floorp-custom-actions-toggle-bookmark-toolbar = ブックマークツールバーの表示の切り替え
  .label = ブックマークツールバーの表示の切り替え
floorp-custom-actions-open-general-preferences = 一般設定を開く
  .label = 一般設定を開く
floorp-custom-actions-open-privacy-preferences = プライバシー設定を開く
  .label = プライバシー設定を開く
floorp-custom-actions-open-workspaces-preferences = ワークスペース設定を開く
  .label = ワークスペース設定を開く
floorp-custom-actions-open-containers-preferences = コンテナー設定を開く
  .label = コンテナー設定を開く
floorp-custom-actions-open-search-preferences = 検索設定を開く
  .label = 検索設定を開く
floorp-custom-actions-open-sync-preferences = 同期設定を開く
  .label = 同期設定を開く
floorp-custom-actions-open-task-manager = タスクマネージャーを開く
  .label = タスクマネージャーを開く
floorp-custom-actions-open-home-page = ホームページを開く
  .label = ホームページを開く
floorp-custom-actions-open-addons-manager = アドオンマネージャーを開く
  .label = アドオンマネージャーを開く
floorp-custom-actions-forget-history = 履歴を忘れる
  .label = 履歴を忘れる
floorp-custom-actions-quick-forget-history = 履歴のクイック削除
  .label = 履歴のクイック削除
floorp-custom-actions-clear-recent-history = 最近の履歴をクリア
  .label = 最近の履歴をクリア
floorp-custom-actions-restore-last-session = 最後のセッションを復元
  .label = 最後のセッションを復元
floorp-custom-actions-search-history = 履歴を検索
  .label = 履歴を検索
floorp-custom-actions-manage-history = 履歴を管理
  .label = 履歴を管理
floorp-custom-actions-open-downloads = ダウンロードを開く
  .label = ダウンロードを開く
floorp-custom-actions-show-bsm = ブラウザーマネージャーを開く
  .label = ブラウザーマネージャーを開く
floorp-custom-actions-show-bookmark-sidebar = ブックマークサイドバーを開く
  .label = ブックマークサイドバーを開く
floorp-custom-actions-show-history-sidebar = 履歴サイドバーを開く
  .label = 履歴サイドバーを開く
floorp-custom-actions-show-synced-tabs-sidebar = 同期タブサイドバーを開く
  .label = 同期タブサイドバーを開く
floorp-custom-actions-reverse-sidebar = サイドバーの位置の切り替え
  .label = サイドバーの位置の切り替え
floorp-custom-actions-hide-sidebar = サイドバーを隠す
  .label = サイドバーを隠す
floorp-custom-actions-toggle-sidebar = サイドバーの表示を切り替え
  .label = サイドバーの表示を切り替え
floorp-custom-actions-open-previous-workspace = 前のワークスペースを開く
  .label = 前のワークスペースを開く
floorp-custom-actions-open-next-workspace = 次のワークスペースを開く
  .label = 次のワークスペースを開く
floorp-custom-actions-show-panel-1 = パネル 1 の表示の切り替え
  .label = パネル 1 の表示の切り替え
floorp-custom-actions-show-panel-2 = パネル 2 の表示の切り替え
  .label = パネル 2 の表示の切り替え
floorp-custom-actions-show-panel-3 = パネル 3 の表示の切り替え
  .label = パネル 3 の表示の切り替え
floorp-custom-actions-show-panel-4 = パネル 4 の表示の切り替え
  .label = パネル 4 の表示の切り替え
floorp-custom-actions-show-panel-5 = パネル 5 の表示の切り替え
  .label = パネル 5 の表示の切り替え
floorp-custom-actions-show-panel-6 = パネル 6 の表示の切り替え
  .label = パネル 6 の表示の切り替え
floorp-custom-actions-show-panel-7 = パネル 7 の表示の切り替え
  .label = パネル 7 の表示の切り替え
floorp-custom-actions-show-panel-8 = パネル 8 の表示の切り替え
  .label = パネル 8 の表示の切り替え
floorp-custom-actions-show-panel-9 = パネル 9 の表示の切り替え
  .label = パネル 9 の表示の切り替え
floorp-custom-actions-show-panel-10 = パネル 10 の表示の切り替え
  .label = パネル 10 の表示の切り替え
############################################################# プロファイルスイッチャー ###############################################################

floorp-open-profile-with-new-instance = 開く
 .tooltiptext = 開く
floorp-profiles-in-use = このプロファイルは使用中です。
floorp-profiles-title = プロファイル
floorp-profiles-create = プロファイルを作成
floorp-profile-manager = プロファイルマネージャー
 .label = プロファイルマネージャー
 .tooltiptext = プロファイルマネージャーを開く
show-workspace-name-option = ワークスペース名をタブバーに表示
    .label = ワークスペース名をタブバーに表示


##################################################################### Midori Portable Preferences ###############################################################

floorp-portable-update-application-allow = { -brand-short-name } ポータブル アップデート
floorp-update-application-auto-enabled-option =
  .label = { -brand-short-name } ポータブルの自動アップデートを有効にする (推奨)

###################################################################### Private Container ##############################################################

floorp-private-container-name = プライベート
floorp-toggle-private-container =
  .label = プライベート/コンテナーなしで開き直す
  .accesskey = P
open-in_private-container =
  .label = 新しいプライベートコンテナータブで開く
