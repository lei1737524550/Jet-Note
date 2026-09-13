package com.ingeniousidea.space;

import android.content.Context;
import android.graphics.Color;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Single native view of config.json -> page_action_bar.
 * The bundled Web UI reads the same object in page_action_bar.js, so New Post and
 * native tool pages share one geometry/visual specification instead of copied constants.
 */
final class PageActionBarSpec {
    final int height;
    final int controlHeight;
    final int titleSize;
    final int controlTextSize;
    final int leftAxis;
    final int rightAxis;
    final int iconButtonWidth;
    final int textButtonMinWidth;
    final int controlRadius;
    final int backgroundColor;
    final int borderColor;
    final int dividerColor;
    final int titleColor;
    final int normalTextColor;
    final int primaryTextColor;
    final int toolActionTextColor;
    final int shadowElevation;

    private PageActionBarSpec(JSONObject value) {
        height = value.optInt("height", 50);
        controlHeight = value.optInt("controlHeight", 36);
        titleSize = value.optInt("titleSize", 16);
        controlTextSize = value.optInt("controlTextSize", 14);
        leftAxis = value.optInt("leftAxis", 44);
        rightAxis = value.optInt("rightAxis", 44);
        iconButtonWidth = value.optInt("iconButtonWidth", 48);
        textButtonMinWidth = value.optInt("textButtonMinWidth", 48);
        controlRadius = value.optInt("controlRadius", 14);
        backgroundColor = color(value.optString("background", "#f8f9fa"), 0xfff8f9fa);
        borderColor = color(value.optString("borderColor", "#bfc1c4"), 0xffbfc1c4);
        dividerColor = color(value.optString("dividerColor", "#eceef1"), 0xffeceef1);
        titleColor = color(value.optString("titleColor", "#202124"), 0xff202124);
        normalTextColor = color(value.optString("normalTextColor", "#222222"), 0xff222222);
        primaryTextColor = color(value.optString("primaryTextColor", "#1599e8"), 0xff1599e8);
        toolActionTextColor = color(value.optString("toolActionTextColor", "#168a45"), 0xff168a45);
        shadowElevation = value.optInt("shadowElevation", 2);
    }

    static PageActionBarSpec load(Context context) {
        try {
            // Debug config is a runtime override of the same config.json used by the
            // Web UI. Native tool pages must read the same source or the two sides
            // drift after a Debug Post save.
            String source = context.getSharedPreferences("jet_note_debug_config", Context.MODE_PRIVATE)
                    .getString("current", null);

            if (source == null) {
                try (InputStream in = context.getAssets().open("config.json")) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buffer = new byte[4096];
                    int count;
                    while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
                    source = out.toString(StandardCharsets.UTF_8.name());
                }
            }

            JSONObject root = new JSONObject(source);
            JSONObject pageActionBar = root.optJSONObject("page_action_bar");
            return new PageActionBarSpec(pageActionBar == null ? new JSONObject() : pageActionBar);
        } catch (Exception ignored) {
            return new PageActionBarSpec(new JSONObject());
        }
    }

    private static int color(String value, int fallback) {
        try { return Color.parseColor(value); }
        catch (Exception ignored) { return fallback; }
    }
}
