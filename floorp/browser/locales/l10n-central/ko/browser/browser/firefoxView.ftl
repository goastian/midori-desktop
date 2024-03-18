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
    .title = 닫기
    .aria-label = 닫기
# Used instead of the localized relative time when a timestamp is within a minute or so of now
firefoxview-just-now-timestamp = 방금 전
# This is a headline for an area in the product where users can resume and re-open tabs they have previously viewed on other devices.
firefoxview-tabpickup-header = 탭 받기
firefoxview-tabpickup-description = 다른 기기의 페이지를 엽니다.
# Variables:
#  $percentValue (Number): the percentage value for setup completion
firefoxview-tabpickup-progress-label = { $percentValue }% 완료
firefoxview-tabpickup-step-signin-header = 기기 간 원활한 전환
firefoxview-tabpickup-step-signin-description = 여기에서 휴대폰 탭을 보려면, 먼저 로그인하거나 계정을 만드세요.
firefoxview-tabpickup-step-signin-primarybutton = 계속
firefoxview-tabpickup-adddevice-header = 휴대폰 또는 태블릿에서 { -brand-product-name } 동기화
firefoxview-tabpickup-adddevice-description = 모바일용 { -brand-product-name }를 다운로드하고 로그인하세요.
firefoxview-tabpickup-adddevice-learn-how = 방법 알아보기
firefoxview-tabpickup-adddevice-primarybutton = 모바일용 { -brand-product-name } 받기
firefoxview-tabpickup-synctabs-header = 탭 동기화 켜기
firefoxview-tabpickup-synctabs-description = { -brand-short-name }가 기기 간에 탭을 공유하도록 허용합니다.
firefoxview-tabpickup-synctabs-learn-how = 방법 알아보기
firefoxview-tabpickup-synctabs-primarybutton = 열린 탭 동기화
firefoxview-tabpickup-fxa-admin-disabled-header = 조직에서 동기화를 사용하지 않도록 설정함
firefoxview-tabpickup-fxa-admin-disabled-description = { -brand-short-name }는 관리자가 동기화를 비활성화했기 때문에 기기 간에 탭을 동기화할 수 없습니다.
firefoxview-tabpickup-network-offline-header = 인터넷 연결 확인
firefoxview-tabpickup-network-offline-description = 방화벽이나 프록시를 사용하는 경우, { -brand-short-name }에 웹 액세스 권한이 있는지 확인하세요.
firefoxview-tabpickup-network-offline-primarybutton = 다시 시도
firefoxview-tabpickup-sync-error-header = 동기화에 문제 있음
firefoxview-tabpickup-generic-sync-error-description = { -brand-short-name }는 지금 동기화 서비스에 연결할 수 없습니다. 잠시 후 다시 시도하세요.
firefoxview-tabpickup-sync-error-primarybutton = 다시 시도
firefoxview-tabpickup-sync-disconnected-header = 계속하려면 동기화를 켜세요
firefoxview-tabpickup-sync-disconnected-description = 탭을 가져오려면 { -brand-short-name }에서 동기화를 허용해야 합니다.
firefoxview-tabpickup-sync-disconnected-primarybutton = 설정에서 동기화 켜기
firefoxview-tabpickup-password-locked-header = 탭을 보려면 기본 비밀번호를 입력하세요
firefoxview-tabpickup-password-locked-description = 탭을 가져오려면 { -brand-short-name }의 기본 비밀번호를 입력해야 합니다.
firefoxview-tabpickup-password-locked-link = 더 알아보기
firefoxview-tabpickup-password-locked-primarybutton = 기본 비밀번호 입력
firefoxview-tabpickup-signed-out-header = 다시 연결하려면 로그인하세요
firefoxview-tabpickup-signed-out-description = 다시 연결하고 탭을 가져오려면 { -fxaccount-brand-name }에 로그인하세요.
firefoxview-tabpickup-signed-out-primarybutton = 로그인
firefoxview-tabpickup-syncing = 잠깐이면 탭이 동기화됩니다.
firefoxview-mobile-promo-header = 휴대폰 또는 태블릿에서 탭 가져오기
firefoxview-mobile-promo-description = 최신 모바일 탭을 보려면, iOS 또는 Android에서 { -brand-product-name }에 로그인하세요.
firefoxview-mobile-promo-primarybutton = 모바일용 { -brand-product-name } 받기
firefoxview-mobile-confirmation-header = 계속 진행!
firefoxview-mobile-confirmation-description = 이제 태블릿이나 휴대폰에서 { -brand-product-name } 탭을 가져올 수 있습니다.
firefoxview-closed-tabs-title = 최근에 닫음
firefoxview-closed-tabs-description2 = 이 창에서 닫은 페이지를 다시 엽니다.
firefoxview-closed-tabs-placeholder-header = 최근에 닫은 탭 없음
firefoxview-closed-tabs-placeholder-body = 이 창에서 탭을 닫으면 여기에서 가져올 수 있습니다.
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
firefoxview-closed-tabs-dismiss-tab =
    .title = { $tabTitle } 닫기
# refers to the last tab that was used
firefoxview-pickup-tabs-badge = 마지막 활동
# Variables:
#   $targetURI (string) - URL that will be opened in the new tab
firefoxview-tabs-list-tab-button =
    .title = 새 탭에서 { $targetURI } 열기
firefoxview-try-colorways-button = 컬러웨이 체험
firefoxview-change-colorway-button = 컬러웨이 변경
# Variables:
#  $intensity (String): Colorway intensity
#  $collection (String): Colorway Collection name
firefoxview-colorway-description = { $intensity } · { $collection }
firefoxview-synced-tabs-placeholder-header = 아직 볼 것이 없음
firefoxview-synced-tabs-placeholder-body = 다음에 다른 기기의 { -brand-product-name }에서 페이지를 열 때 마법처럼 여기로 가져옵니다.
firefoxview-collapse-button-show =
    .title = 목록 표시
firefoxview-collapse-button-hide =
    .title = 목록 숨기기
firefoxview-overview-nav = 최근 탐색
    .title = 최근 탐색

## History in this context refers to browser history

firefoxview-history-nav = 기록
    .title = 기록
firefoxview-history-header = 기록

## Open Tabs in this context refers to all open tabs in the browser

firefoxview-opentabs-nav = 열린 탭
    .title = 열린 탭
firefoxview-opentabs-header = 열린 탭

## Recently closed tabs in this context refers to recently closed tabs from all windows

firefoxview-recently-closed-nav = 최근에 닫은 탭
    .title = 최근에 닫은 탭
firefoxview-recently-closed-header = 최근에 닫은 탭

## Tabs from other devices refers in this context refers to synced tabs from other devices

firefoxview-synced-tabs-nav = 다른 기기의 탭
    .title = 다른 기기의 탭
firefoxview-synced-tabs-header = 다른 기기의 탭

##

# Used for a link in collapsible cards, in the 'Recent browsing' page of Firefox View
firefoxview-view-all-link = 모두 보기
# Variables:
#   $winID (Number) - The index of the owner window for this set of tabs
firefoxview-opentabs-window-header =
    .title = 창 { $winID }
# Variables:
#   $winID (Number) - The index of the owner window (which is currently focused) for this set of tabs
firefoxview-opentabs-current-window-header =
    .title = 창 { $winID } (현재)
firefoxview-opentabs-focus-tab =
    .title = 이 탭으로 전환
firefoxview-show-more = 자세히 보기
firefoxview-show-less = 간단히 보기
