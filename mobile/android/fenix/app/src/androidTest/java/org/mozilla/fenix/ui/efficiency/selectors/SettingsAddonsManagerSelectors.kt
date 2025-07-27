package org.mozilla.fenix.ui.efficiency.selectors

import org.mozilla.fenix.ui.efficiency.helpers.Selector
import org.mozilla.fenix.ui.efficiency.helpers.SelectorStrategy

object SettingsAddonsManagerSelectors {

    val NAVIGATE_BACK_TOOLBAR_BUTTON = Selector(
        strategy = SelectorStrategy.ESPRESSO_BY_CONTENT_DESC,
        value = "Navigate up",
        description = "Navigate back toolbar button",
        groups = listOf("requiredForPage"),
    )

    val ENABLE_OR_DISABLE_EXTENSION_TOGGLE = Selector(
        strategy = SelectorStrategy.UIAUTOMATOR_WITH_RES_ID,
        value = "enable_switch",
        description = "Enable or disable an extension toggle",
        groups = listOf("extensionDetails"),
    )

    val all = listOf(
        NAVIGATE_BACK_TOOLBAR_BUTTON,
        ENABLE_OR_DISABLE_EXTENSION_TOGGLE,
    )
}
