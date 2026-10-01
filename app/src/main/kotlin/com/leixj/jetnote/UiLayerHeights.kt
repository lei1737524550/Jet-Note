package com.leixj.jetnote

/**
 * Android 界面的语义化 Z 轴高度。
 *
 * 集中管理原生界面的层级顺序。数值刻意保持较小且含义明确，
 * 各功能不应通过设置类似 Integer.MAX_VALUE 的高度来争抢层级。
 * Web/CSS 的堆叠顺序属于独立的坐标系统。
 */
internal object UiLayerHeights {
    const val CONTENT = 0f
    const val MEDIA = 100f
    const val TOOL = 200f
    const val APP_OVERLAY = 300f
    const val TRANSITION = 1000f
}