# java/com/ingeniousidea/space/EdgeToEdgeController.java — 双语逐行备注 / Bilingual line notes

原文件保持不变，以下备注按原文件行号对应。JSON 和第三方压缩库不插入行内注释，以避免破坏解析或依赖完整性。

The source file remains unchanged. These notes map to its original line numbers. JSON and minified third-party libraries receive sidecar notes so parsing and dependency integrity stay intact.

| 行 / Line | 原始内容 / Source | 中文备注 | English note |
| ---: | --- | --- | --- |
| 1 | <code>package com.ingeniousidea.space;</code> | 声明该 Java 类所属的软件包。 | Declares the package that owns this Java class. |
| 2 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 3 | <code>import android.app.Activity;</code> | 导入后续代码需要使用的 Java 或 Android 类型。 | Imports a Java or Android type used by later code. |
| 4 | <code>import android.graphics.Color;</code> | 导入后续代码需要使用的 Java 或 Android 类型。 | Imports a Java or Android type used by later code. |
| 5 | <code>import android.graphics.Insets;</code> | 导入后续代码需要使用的 Java 或 Android 类型。 | Imports a Java or Android type used by later code. |
| 6 | <code>import android.os.Build;</code> | 导入后续代码需要使用的 Java 或 Android 类型。 | Imports a Java or Android type used by later code. |
| 7 | <code>import android.view.View;</code> | 导入后续代码需要使用的 Java 或 Android 类型。 | Imports a Java or Android type used by later code. |
| 8 | <code>import android.view.Window;</code> | 导入后续代码需要使用的 Java 或 Android 类型。 | Imports a Java or Android type used by later code. |
| 9 | <code>import android.view.WindowInsets;</code> | 导入后续代码需要使用的 Java 或 Android 类型。 | Imports a Java or Android type used by later code. |
| 10 | <code>import android.view.WindowManager;</code> | 导入后续代码需要使用的 Java 或 Android 类型。 | Imports a Java or Android type used by later code. |
| 11 | <code>import android.webkit.WebView;</code> | 导入后续代码需要使用的 Java 或 Android 类型。 | Imports a Java or Android type used by later code. |
| 12 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 13 | <code>/** Extends the surface behind system bars; forwards safe content edges to CSS. */</code> | 原始注释：为开发者保留背景、约束或实现说明。 | Existing comment: preserves context, constraints, or implementation guidance for developers. |
| 14 | <code>final class EdgeToEdgeController {</code> | 声明或组织一个 Java 类型及其实现范围。 | Declares or organizes a Java type and its implementation scope. |
| 15 | <code>    private final Activity activity;</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 16 | <code>    private final WebView webView;</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 17 | <code>    private int top, right, bottom, left, keyboardViewportHeight;</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 18 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 19 | <code>    EdgeToEdgeController(Activity activity, WebView webView) {</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 20 | <code>        this.activity = activity;</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 21 | <code>        this.webView = webView;</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 22 | <code>    }</code> | 结束或衔接当前 Java 语句、代码块或声明。 | Closes or connects the current Java statement, block, or declaration. |
| 23 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 24 | <code>    @SuppressWarnings("deprecation")</code> | 应用 Java/Android 注解，用于描述接口、线程或行为约束。 | Applies a Java/Android annotation that describes an interface, thread, or behavioral contract. |
| 25 | <code>    void install() {</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 26 | <code>        Window window = activity.getWindow();</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 27 | <code>        window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 28 | <code>                &#124; WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 29 | <code>                &#124; WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 30 | <code>        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 31 | <code>        window.setStatusBarColor(Color.TRANSPARENT);</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 32 | <code>        window.setNavigationBarColor(Build.VERSION.SDK_INT &gt;= 26 ? Color.TRANSPARENT : 0x66000000);</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 33 | <code>        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 34 | <code>                &#124; View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 35 | <code>                &#124; View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 36 | <code>                &#124; View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 37 | <code>        if (Build.VERSION.SDK_INT &gt;= 26) flags &#124;= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;</code> | 按条件决定是否执行下面的代码块。 | Uses a condition to decide whether the following block runs. |
| 38 | <code>        window.getDecorView().setSystemUiVisibility(flags);</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 39 | <code>        if (Build.VERSION.SDK_INT &gt;= 28) {</code> | 按条件决定是否执行下面的代码块。 | Uses a condition to decide whether the following block runs. |
| 40 | <code>            WindowManager.LayoutParams params = window.getAttributes();</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 41 | <code>            params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 42 | <code>            window.setAttributes(params);</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 43 | <code>            window.setNavigationBarDividerColor(Color.TRANSPARENT);</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 44 | <code>        }</code> | 结束或衔接当前 Java 语句、代码块或声明。 | Closes or connects the current Java statement, block, or declaration. |
| 45 | <code>        if (Build.VERSION.SDK_INT &gt;= 29) {</code> | 按条件决定是否执行下面的代码块。 | Uses a condition to decide whether the following block runs. |
| 46 | <code>            window.setStatusBarContrastEnforced(false);</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 47 | <code>            window.setNavigationBarContrastEnforced(false);</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 48 | <code>        }</code> | 结束或衔接当前 Java 语句、代码块或声明。 | Closes or connects the current Java statement, block, or declaration. |
| 49 | <code>        if (Build.VERSION.SDK_INT &gt;= 30) window.setDecorFitsSystemWindows(false);</code> | 按条件决定是否执行下面的代码块。 | Uses a condition to decide whether the following block runs. |
| 50 | <code>        webView.setOnApplyWindowInsetsListener((view, insets) -&gt; {</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 51 | <code>            if (Build.VERSION.SDK_INT &gt;= 30) {</code> | 按条件决定是否执行下面的代码块。 | Uses a condition to decide whether the following block runs. |
| 52 | <code>                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() &#124; WindowInsets.Type.displayCutout());</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 53 | <code>                top = bars.top; right = bars.right; bottom = bars.bottom; left = bars.left;</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 54 | <code>                if (insets.isVisible(WindowInsets.Type.ime())) {</code> | 按条件决定是否执行下面的代码块。 | Uses a condition to decide whether the following block runs. |
| 55 | <code>                    int imeBottom = insets.getInsets(WindowInsets.Type.ime()).bottom;</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 56 | <code>                    int windowHeight = activity.getWindowManager().getCurrentWindowMetrics().getBounds().height();</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 57 | <code>                    keyboardViewportHeight = Math.max(1, Math.min(webView.getHeight(), windowHeight - imeBottom));</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 58 | <code>                } else {</code> | 结束或衔接当前 Java 语句、代码块或声明。 | Closes or connects the current Java statement, block, or declaration. |
| 59 | <code>                    keyboardViewportHeight = 0;</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 60 | <code>                }</code> | 结束或衔接当前 Java 语句、代码块或声明。 | Closes or connects the current Java statement, block, or declaration. |
| 61 | <code>            } else {</code> | 结束或衔接当前 Java 语句、代码块或声明。 | Closes or connects the current Java statement, block, or declaration. |
| 62 | <code>                top = insets.getSystemWindowInsetTop();</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 63 | <code>                right = insets.getSystemWindowInsetRight();</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 64 | <code>                // Stable bottom excludes the keyboard on API 23–29.</code> | 原始注释：为开发者保留背景、约束或实现说明。 | Existing comment: preserves context, constraints, or implementation guidance for developers. |
| 65 | <code>                bottom = insets.getStableInsetBottom();</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 66 | <code>                left = insets.getSystemWindowInsetLeft();</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 67 | <code>                if (Build.VERSION.SDK_INT &gt;= 28 &amp;&amp; insets.getDisplayCutout() != null) {</code> | 按条件决定是否执行下面的代码块。 | Uses a condition to decide whether the following block runs. |
| 68 | <code>                    top = Math.max(top, insets.getDisplayCutout().getSafeInsetTop());</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 69 | <code>                    left = Math.max(left, insets.getDisplayCutout().getSafeInsetLeft());</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 70 | <code>                    right = Math.max(right, insets.getDisplayCutout().getSafeInsetRight());</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 71 | <code>                    bottom = Math.max(bottom, insets.getDisplayCutout().getSafeInsetBottom());</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 72 | <code>                }</code> | 结束或衔接当前 Java 语句、代码块或声明。 | Closes or connects the current Java statement, block, or declaration. |
| 73 | <code>            }</code> | 结束或衔接当前 Java 语句、代码块或声明。 | Closes or connects the current Java statement, block, or declaration. |
| 74 | <code>            dispatchInsets();</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 75 | <code>            return insets;</code> | 从当前方法返回结果，或结束当前方法。 | Returns a result from, or ends, the current method. |
| 76 | <code>        });</code> | 结束或衔接当前 Java 语句、代码块或声明。 | Closes or connects the current Java statement, block, or declaration. |
| 77 | <code>        webView.requestApplyInsets();</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 78 | <code>    }</code> | 结束或衔接当前 Java 语句、代码块或声明。 | Closes or connects the current Java statement, block, or declaration. |
| 79 | &nbsp; | 空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。 | Blank line: separates neighboring logic or visual sections and performs no operation. |
| 80 | <code>    void dispatchInsets() {</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 81 | <code>        webView.evaluateJavascript("window.applySystemInsets &amp;&amp; window.applySystemInsets("</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 82 | <code>                + top + "," + right + "," + bottom + "," + left + "," + keyboardViewportHeight + ")", null);</code> | 执行当前 Java 实现中的一次赋值、调用或状态处理。 | Performs an assignment, call, or state-handling step in the Java implementation. |
| 83 | <code>    }</code> | 结束或衔接当前 Java 语句、代码块或声明。 | Closes or connects the current Java statement, block, or declaration. |
| 84 | <code>}</code> | 结束或衔接当前 Java 语句、代码块或声明。 | Closes or connects the current Java statement, block, or declaration. |
