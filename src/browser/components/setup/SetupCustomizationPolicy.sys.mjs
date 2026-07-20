const VALID_LAYOUTS = new Set([
  'horizontal-top',
  'horizontal-bottom',
  'vertical-left',
  'vertical-right',
]);

export function normalizeSide(side) {
  return side === 'right' ? 'right' : 'left';
}

export function normalizeTabLayout(layout) {
  return VALID_LAYOUTS.has(layout) ? layout : 'horizontal-top';
}

export function isVerticalTabLayout(layout) {
  return normalizeTabLayout(layout).startsWith('vertical-');
}

export function getTabLayoutFromPrefs({
  verticalTabsEnabled,
  arcModeEnabled,
  verticalTabsSide,
  horizontalTabsPosition,
}) {
  if (verticalTabsEnabled || arcModeEnabled) {
    return normalizeSide(verticalTabsSide) === 'right'
      ? 'vertical-right'
      : 'vertical-left';
  }
  return horizontalTabsPosition === 'bottom'
    ? 'horizontal-bottom'
    : 'horizontal-top';
}

export function getSidebarSideForLayout({ storedSidebarSide }) {
  return normalizeSide(storedSidebarSide);
}

export function getSidebarArrangement({ sidebarSide }) {
  return {
    sidebarSide: normalizeSide(sidebarSide),
  };
}

export function getAutohideAvailability({
  tabLayout,
  sidebarEnabled,
  sidebarAutohideEnabled,
  horizontalTabsAutohideEnabled,
}) {
  const layout = normalizeTabLayout(tabLayout);
  const horizontalTabs = layout === 'horizontal-top';
  return {
    sidebar: !!sidebarEnabled,
    sidebarMode: !!sidebarEnabled && !!sidebarAutohideEnabled,
    horizontalTabs,
    inactiveWindowTabs:
      horizontalTabs && !!horizontalTabsAutohideEnabled,
    verticalTabs: isVerticalTabLayout(layout),
  };
}

export function isSidebarAtLogicalStart({ side, isRTL }) {
  return normalizeSide(side) === (isRTL ? 'right' : 'left');
}
