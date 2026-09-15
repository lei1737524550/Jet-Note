package com.ingeniousidea.space;

/**
 * Semantic Android UI Z-axis heights.
 *
 * Keep native layer ordering in one place. Values are intentionally small and
 * meaningful; no feature should compete by inventing Integer.MAX_VALUE-style
 * heights. Web/CSS stacking is a separate coordinate system.
 */
final class UiLayerHeights {
    private UiLayerHeights() {}

    static final float CONTENT_Z_AXIS_HEIGHT = 0f;
    static final float MEDIA_Z_AXIS_HEIGHT = 100f;
    static final float TOOL_Z_AXIS_HEIGHT = 200f;
    static final float APP_OVERLAY_Z_AXIS_HEIGHT = 300f;
    static final float TRANSITION_Z_AXIS_HEIGHT = 1000f;
}
