package com.ingeniousidea.space;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Tiny native startup-routing store.
 *
 * Browser Mode must be known before the WebView chooses its first document;
 * keeping this flag only in WebView localStorage would require loading Home
 * just to discover that Home should not have been loaded.
 */
final class BrowserModeStore {
    private static final String PREFS = "jet_note_startup_route_v1";
    private static final String ENABLED = "browser_mode_enabled";

    private BrowserModeStore() {}

    static boolean isEnabled(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getBoolean(ENABLED, false);
    }

    static void setEnabled(Context context, boolean enabled) {
        SharedPreferences.Editor editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean(ENABLED, enabled);
        // commit() is intentional: Relaunch may immediately recreate the process,
        // so the startup route must be durable before the setting action returns.
        editor.commit();
    }
}
