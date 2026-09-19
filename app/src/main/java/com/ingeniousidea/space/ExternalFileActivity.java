package com.ingeniousidea.space;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

/**
 * Jet Note's single external-file entry point. Android ACTION_VIEW and
 * ACTION_SEND/ACTION_SEND_MULTIPLE all converge here, while the normal launcher
 * remains MainActivity. The current tool hosted by this entry is Vector.
 */
public final class ExternalFileActivity extends Activity {
    private BidirectionalConversionController converter;
    private TextView statusView;
    private TextView detailView;
    private FrameLayout rootView;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Appearance appearance = readAppearance();
        getWindow().setStatusBarColor(appearance.background);
        getWindow().setNavigationBarColor(appearance.background);
        buildUi(appearance);
        converter = new BidirectionalConversionController(this, new BidirectionalConversionController.Callback() {
            @Override public void onConverting(String sourceName, String direction) {
                statusView.setText("Converting " + sourceName);
                detailView.setText(direction);
            }
            @Override public void onSuccess(String displayPath, String direction, int warningCount) {
                statusView.setText("Conversion successful");
                String warnings = warningCount > 0 ? "\nWarnings: " + warningCount : "";
                detailView.setText(direction + "\n\nSaved to:\n" + displayPath + warnings);
                Toast.makeText(ExternalFileActivity.this,
                        "Converted successfully\n" + displayPath + warnings, Toast.LENGTH_LONG).show();
                Intent result = new Intent();
                result.putExtra("output_path", displayPath);
                result.putExtra("conversion_direction", direction);
                result.putExtra("warning_count", warningCount);
                setResult(RESULT_OK, result);
                rootView.postDelayed(() -> finishAndRemoveTask(), 180);
            }
            @Override public void onError(String message) {
                statusView.setText("Conversion failed");
                detailView.setText(message);
            }
        });
        handleIntent(getIntent());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (BidirectionalConversionController.isConversionIntent(intent)) converter.handle(intent);
        else {
            statusView.setText("SVG ⇄ XML Converter");
            detailView.setText("Open or share an SVG or Android drawable XML file with Jet Note.\n\nSupported XML: <vector>, <shape>");
        }
    }

    private void buildUi(Appearance appearance) {
        rootView = new FrameLayout(this);
        rootView.setBackgroundColor(appearance.background);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setPadding(dp(24), dp(24), dp(24), dp(24));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(appearance.body);
        bg.setCornerRadius(dp(18));
        bg.setStroke(dp(1), appearance.border);
        card.setBackground(bg);

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.TOP;
        lp.setMargins(dp(18), dp(72), dp(18), dp(18));
        rootView.addView(card, lp);

        TextView title = text("Vector", 23, appearance.foreground);
        title.setGravity(Gravity.CENTER);
        card.addView(title, matchWrap());

        statusView = text("", 16, appearance.foreground);
        statusView.setGravity(Gravity.CENTER);
        statusView.setPadding(0, dp(20), 0, 0);
        card.addView(statusView, matchWrap());

        detailView = text("", 13, appearance.secondaryForeground);
        detailView.setGravity(Gravity.CENTER);
        detailView.setTextIsSelectable(true);
        detailView.setPadding(0, dp(14), 0, 0);
        card.addView(detailView, matchWrap());
        setContentView(rootView);
    }

    private TextView text(String value, int sp, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        return view;
    }
    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private Appearance readAppearance() {
        int background = Color.rgb(174, 209, 148);
        int body = Color.rgb(210, 233, 194);
        int border = Color.rgb(191, 193, 196);
        try {
            JSONObject config = new JSONObject(RuntimeConfigStore.readEffective(this));
            background = parseColor(config.optString("global_set_background"), background);
            body = parseColor(config.optString("global_set_body"), body);
        } catch (Exception ignored) { }
        try {
            String raw = readAsset("shared/components/jet_note_type.json");
            JSONObject type = new JSONObject(raw);
            border = parseColor(type.optJSONObject("jet_note_type_border_color")
                    .optString("settings", "#bfc1c4"), border);
        } catch (Exception ignored) { }
        double luminance = (0.2126 * Color.red(body) + 0.7152 * Color.green(body) + 0.0722 * Color.blue(body)) / 255.0;
        int foreground = luminance > 0.5 ? Color.rgb(17,17,17) : Color.rgb(245,245,245);
        int secondary = withAlphaBlend(foreground, body, 0.68f);
        return new Appearance(background, body, border, foreground, secondary);
    }

    private String readAsset(String path) throws Exception {
        try (java.io.InputStream in = getAssets().open(path);
             java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int n;
            while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
            return out.toString("UTF-8");
        }
    }
    private int parseColor(String value, int fallback) {
        try { return Color.parseColor(value); } catch (Exception ignored) { return fallback; }
    }
    private int withAlphaBlend(int fg, int bg, float alpha) {
        return Color.rgb(
                Math.round(Color.red(fg)*alpha + Color.red(bg)*(1-alpha)),
                Math.round(Color.green(fg)*alpha + Color.green(bg)*(1-alpha)),
                Math.round(Color.blue(fg)*alpha + Color.blue(bg)*(1-alpha)));
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (converter != null) converter.onPermissionResult(requestCode, grantResults);
    }
    @Override protected void onDestroy() {
        if (converter != null) converter.destroy();
        super.onDestroy();
    }

    private static final class Appearance {
        final int background, body, border, foreground, secondaryForeground;
        Appearance(int background, int body, int border, int foreground, int secondaryForeground) {
            this.background=background; this.body=body; this.border=border;
            this.foreground=foreground; this.secondaryForeground=secondaryForeground;
        }
    }
}
