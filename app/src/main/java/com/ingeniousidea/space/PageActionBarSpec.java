package com.ingeniousidea.space;

import android.content.Context;
import android.graphics.Color;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Native reader for assets/shared/components/page_action_bar.json.
 * The WebView reads the same component file, keeping native tool pages and
 * Web page headers aligned without exposing structural UI data in config.json.
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
        try (InputStream input = context.getAssets().open("shared/components/page_action_bar.json");
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            JSONObject root = new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
            JSONObject appearance = root.optJSONObject("appearance");
            return new PageActionBarSpec(appearance == null ? new JSONObject() : appearance);
        } catch (Exception ignored) {
            return new PageActionBarSpec(new JSONObject());
        }
    }

    private static int color(String value, int fallback) {
        try { return Color.parseColor(value); }
        catch (Exception ignored) { return fallback; }
    }
}
