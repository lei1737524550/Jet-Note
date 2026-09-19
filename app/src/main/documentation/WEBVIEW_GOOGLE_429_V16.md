# V16 Google/WebView browser identity change

`ToolPageController` now derives a normal Mobile Chrome User-Agent from the installed Android System WebView UA. It removes only the WebView markers (`; wv` and `Version/4.0`) and keeps the installed Chromium version/device Android information.

For builds that include AndroidX WebKit 1.9.0 or newer, the controller also detects `WebViewFeature.USER_AGENT_METADATA` and re-applies WebView's own `UserAgentMetadata` through `WebSettingsCompat`, so UA Client Hints remain based on the installed WebView engine after the UA override. Reflection is used because this source snapshot contains no Gradle dependency files; therefore the Java source still compiles when AndroidX WebKit is not packaged.

Recommended host dependency when a Gradle project is available:

    implementation("androidx.webkit:webkit:1.15.0")

V16 does not intercept Google `/search`, does not retry 429 responses, and does not redirect Google searches to Baidu. Cookies, third-party cookies, DOM storage and JavaScript remain enabled. Cookie state is flushed after successful page loads.
