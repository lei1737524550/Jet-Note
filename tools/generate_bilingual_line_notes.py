#!/usr/bin/env python3
"""Create non-invasive Chinese/English line notes for app/src/main text files.

The Android sources remain byte-for-byte executable.  Instead of inserting
comments into JSON, minified vendor code, or Android resource files, this
script writes a mirrored, line-numbered explanation tree in
docs/BILINGUAL_LINE_NOTES.  Every source text line gets one Chinese note and
one English note.
"""

from __future__ import annotations

import argparse
import html
import re
import shutil
from pathlib import Path


TEXT_SUFFIXES = {".java", ".js", ".html", ".css", ".xml", ".svg", ".json", ".txt", ".md"}
PREVIEW_LIMIT = 240


def source_kind(path: Path) -> str:
    name = path.name.lower()
    if name.endswith(".license"):
        return "license"
    if name.endswith(".js.tmp") or path.suffix.lower() == ".js":
        return "javascript"
    suffix = path.suffix.lower()
    return {
        ".java": "java",
        ".html": "html",
        ".css": "css",
        ".xml": "xml",
        ".svg": "xml",
        ".json": "json",
        ".txt": "text",
        ".md": "text",
    }.get(suffix, "text")


def is_text_source(path: Path) -> bool:
    name = path.name.lower()
    if name.endswith(".license") or name.endswith(".js.tmp"):
        return True
    return path.suffix.lower() in TEXT_SUFFIXES


def read_text(path: Path) -> str | None:
    try:
        payload = path.read_bytes()
    except OSError:
        return None
    if b"\x00" in payload:
        return None
    try:
        return payload.decode("utf-8")
    except UnicodeDecodeError:
        return None


def pair(chinese: str, english: str) -> tuple[str, str]:
    return chinese, english


def line_note(line: str, kind: str, vendor: bool) -> tuple[str, str]:
    stripped = line.strip()
    if not stripped:
        return pair(
            "空行：用来分隔相邻的逻辑或视觉区域，不执行任何操作。",
            "Blank line: separates neighboring logic or visual sections and performs no operation.",
        )

    if vendor and len(line) > PREVIEW_LIMIT:
        return pair(
            "第三方库的压缩实现：该单行包含大量机器压缩后的逻辑；保持原样，使用时以随附许可证为准。",
            "Minified third-party implementation: this one line contains a large amount of compressed logic; it is kept intact and governed by the bundled license.",
        )

    if kind == "license":
        return pair(
            "第三方许可证文本的一行：说明该依赖的授权、版权或使用条件。",
            "A line from a third-party license: states licensing, copyright, or usage conditions for that dependency.",
        )

    if stripped.startswith(("//", "/*", "*", "*/", "<!--", "-->")):
        return pair(
            "原始注释：为开发者保留背景、约束或实现说明。",
            "Existing comment: preserves context, constraints, or implementation guidance for developers.",
        )

    if kind == "java":
        if stripped.startswith("package "):
            return pair("声明该 Java 类所属的软件包。", "Declares the package that owns this Java class.")
        if stripped.startswith("import "):
            return pair("导入后续代码需要使用的 Java 或 Android 类型。", "Imports a Java or Android type used by later code.")
        if stripped.startswith("@"):
            return pair("应用 Java/Android 注解，用于描述接口、线程或行为约束。", "Applies a Java/Android annotation that describes an interface, thread, or behavioral contract.")
        if re.search(r"\b(class|interface|enum)\b", stripped):
            return pair("声明或组织一个 Java 类型及其实现范围。", "Declares or organizes a Java type and its implementation scope.")
        if re.search(r"\b(public|private|protected)\b.*\([^;]*\)\s*\{?", stripped):
            return pair("声明一个可调用的方法、构造器或回调入口。", "Declares a callable method, constructor, or callback entry point.")
        if stripped.startswith("return ") or stripped == "return;":
            return pair("从当前方法返回结果，或结束当前方法。", "Returns a result from, or ends, the current method.")
        if stripped.startswith(("if ", "if(")):
            return pair("按条件决定是否执行下面的代码块。", "Uses a condition to decide whether the following block runs.")
        if stripped.startswith("else"):
            return pair("处理前一个条件不成立时的替代分支。", "Handles the alternative branch when the preceding condition is false.")
        if stripped.startswith(("for ", "for(", "while ", "while(")):
            return pair("开始一个循环，以重复执行相关操作。", "Starts a loop that repeats the related operation.")
        if stripped.startswith("try"):
            return pair("开始可能失败的操作，并准备配合异常处理。", "Starts an operation that may fail and is paired with exception handling.")
        if stripped.startswith("catch"):
            return pair("捕获并处理前面操作抛出的异常。", "Catches and handles an exception from the preceding operation.")
        if stripped.startswith("throw "):
            return pair("显式抛出异常，让调用方处理失败状态。", "Explicitly throws an exception so the caller can handle the failure.")
        if stripped.startswith(("}", ");", "{")):
            return pair("结束或衔接当前 Java 语句、代码块或声明。", "Closes or connects the current Java statement, block, or declaration.")
        if "new " in stripped:
            return pair("创建或配置一个新的 Java/Android 对象。", "Creates or configures a new Java/Android object.")
        return pair("执行当前 Java 实现中的一次赋值、调用或状态处理。", "Performs an assignment, call, or state-handling step in the Java implementation.")

    if kind == "javascript":
        if re.match(r"(?:async\s+)?function\s+", stripped) or "=>" in stripped:
            return pair("定义 JavaScript 函数或回调，用于封装后续行为。", "Defines a JavaScript function or callback that encapsulates subsequent behavior.")
        if re.match(r"(?:const|let|var)\s+", stripped):
            return pair("声明一个 JavaScript 变量、常量或引用。", "Declares a JavaScript variable, constant, or reference.")
        if stripped.startswith("class "):
            return pair("定义一个 JavaScript 类或状态容器。", "Defines a JavaScript class or state container.")
        if stripped.startswith(("if ", "if(")):
            return pair("按运行时条件选择是否执行下面的逻辑。", "Uses a runtime condition to choose whether the following logic runs.")
        if stripped.startswith("else"):
            return pair("处理前一个 JavaScript 条件不满足时的分支。", "Handles the branch used when the preceding JavaScript condition is not met.")
        if stripped.startswith(("for ", "for(", "while ", "while(")):
            return pair("开始循环，重复处理集合、次数或条件。", "Starts a loop that repeatedly processes a collection, count, or condition.")
        if stripped.startswith("return ") or stripped == "return;":
            return pair("从当前函数返回值，或立即结束函数。", "Returns a value from, or immediately ends, the current function.")
        if stripped.startswith("await ") or " await " in stripped:
            return pair("等待异步操作完成后再继续执行。", "Waits for an asynchronous operation to finish before continuing.")
        if stripped.startswith("try"):
            return pair("开始可能失败的 JavaScript 操作。", "Starts a JavaScript operation that may fail.")
        if stripped.startswith("catch"):
            return pair("接收并处理前面异步或同步操作的错误。", "Receives and handles an error from the preceding asynchronous or synchronous operation.")
        if stripped.startswith(("}", ");", "{")):
            return pair("结束或衔接当前 JavaScript 语句、对象或代码块。", "Closes or connects the current JavaScript statement, object, or block.")
        if "document." in stripped or "querySelector" in stripped:
            return pair("读取、创建或更新页面中的 DOM 元素。", "Reads, creates, or updates a DOM element in the page.")
        if "localStorage" in stripped or "indexedDB" in stripped:
            return pair("读取、写入或清理浏览器端的持久化数据。", "Reads, writes, or clears browser-side persistent data.")
        return pair("执行当前 JavaScript 模块中的一次状态、界面或数据操作。", "Performs a state, UI, or data operation in the current JavaScript module.")

    if kind == "css":
        if stripped.startswith("@"):
            return pair("定义 CSS 的全局规则、媒体条件或关键帧。", "Defines a global CSS rule, media condition, or keyframe.")
        if stripped.endswith("{"):
            return pair("开始一个 CSS 选择器规则，后续属性作用于匹配元素。", "Starts a CSS selector rule; following properties apply to matching elements.")
        if stripped == "}":
            return pair("结束当前 CSS 选择器或条件规则。", "Ends the current CSS selector or conditional rule.")
        if re.match(r"(?:--)?[\w-]+\s*:", stripped):
            return pair("为当前 CSS 规则设置一个样式属性及其值。", "Sets a style property and value for the current CSS rule.")
        return pair("组成当前 CSS 样式规则的选择器、属性或格式片段。", "Forms a selector, property, or formatting fragment of the current CSS rule.")

    if kind in {"html", "xml"}:
        if stripped.startswith("<?xml"):
            return pair("声明 XML 文件格式和编码。", "Declares the XML file format and encoding.")
        if stripped.lower().startswith("<!doctype"):
            return pair("声明文档使用 HTML 标准模式。", "Declares that the document uses HTML standards mode.")
        if stripped.startswith("</"):
            return pair("关闭前面打开的 HTML/XML 元素。", "Closes a previously opened HTML/XML element.")
        tag = re.search(r"<\s*([\w:-]+)", stripped)
        if tag:
            name = tag.group(1)
            return pair(f"定义或配置 HTML/XML 元素 <{name}> 及其属性。", f"Defines or configures the HTML/XML <{name}> element and its attributes.")
        return pair("组成 HTML/XML 文档结构或资源配置。", "Forms part of the HTML/XML document structure or resource configuration.")

    if kind == "json":
        prop = re.match(r'"([^\"]+)"\s*:\s*(.*)', stripped.rstrip(","))
        if prop:
            return pair(f"配置键“{prop.group(1)}”及其对应值；JSON 保持无注释以便程序解析。", f"Sets configuration key “{prop.group(1)}” and its value; JSON remains comment-free so the app can parse it.")
        if stripped.startswith(("{", "[")):
            return pair("开始一个 JSON 对象或数组。", "Begins a JSON object or array.")
        if stripped.startswith(("}", "]")):
            return pair("结束当前 JSON 对象或数组。", "Ends the current JSON object or array.")
        return pair("组成 JSON 配置数据的一部分。", "Forms part of the JSON configuration data.")

    return pair(
        "文本资源的一行：保留该文件的说明、标题或内容。",
        "A line of a text resource: preserves this file's description, heading, or content.",
    )


def source_preview(line: str) -> str:
    if not line:
        return "&nbsp;"
    shortened = line
    if len(shortened) > PREVIEW_LIMIT:
        shortened = f"{shortened[:PREVIEW_LIMIT]} … [truncated; {len(line)} characters in source]"
    safe = html.escape(shortened, quote=False).replace("|", "&#124;")
    return f"<code>{safe}</code>"


def render_note(source_relative: Path, content: str) -> str:
    kind = source_kind(source_relative)
    vendor = "assets/vendor" in source_relative.as_posix()
    source_lines = content.splitlines()
    if not source_lines and content:
        source_lines = [content]

    parts = [
        f"# {source_relative.as_posix()} — 双语逐行备注 / Bilingual line notes",
        "",
        "原文件保持不变，以下备注按原文件行号对应。JSON 和第三方压缩库不插入行内注释，以避免破坏解析或依赖完整性。",
        "",
        "The source file remains unchanged. These notes map to its original line numbers. JSON and minified third-party libraries receive sidecar notes so parsing and dependency integrity stay intact.",
        "",
        "| 行 / Line | 原始内容 / Source | 中文备注 | English note |",
        "| ---: | --- | --- | --- |",
    ]
    for number, line in enumerate(source_lines, start=1):
        chinese, english = line_note(line, kind, vendor)
        parts.append(f"| {number} | {source_preview(line)} | {chinese} | {english} |")
    if not source_lines:
        parts.extend([
            "| — | &nbsp; | 文件为空，没有可标注的文本行。 | The file is empty and has no text lines to annotate. |",
        ])
    parts.append("")
    return "\n".join(parts)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument(
        "--replace",
        action="store_true",
        help="replace only an existing note tree generated by this script",
    )
    args = parser.parse_args()

    project = args.project.resolve()
    source_root = project / "app" / "src" / "main"
    output_root = project / "docs" / "BILINGUAL_LINE_NOTES"
    if not source_root.is_dir():
        raise SystemExit(f"Source tree not found: {source_root}")
    if output_root.exists():
        index = output_root / "INDEX.md"
        marker = "Bilingual line-note index"
        if not args.replace or not index.is_file() or marker not in index.read_text(encoding="utf-8"):
            raise SystemExit(f"Refusing to overwrite existing notes: {output_root}")
        shutil.rmtree(output_root)

    entries: list[tuple[Path, int]] = []
    for path in sorted(source_root.rglob("*")):
        if not path.is_file() or not is_text_source(path):
            continue
        content = read_text(path)
        if content is None:
            continue
        relative = path.relative_to(source_root)
        note_path = output_root / relative.parent / f"{relative.name}.notes.md"
        note_path.parent.mkdir(parents=True, exist_ok=True)
        note_path.write_text(render_note(relative, content), encoding="utf-8")
        entries.append((relative, len(content.splitlines()) or (1 if content else 0)))

    index = [
        "# app/src/main 双语逐行备注 / Bilingual line-note index",
        "",
        "这些备注与 `app/src/main` 的原始文本文件一一对应。它们位于 `docs/`，不会被 Android 构建打进 APK，也不会改变应用运行行为。",
        "",
        "These notes map one-to-one to the original text files in `app/src/main`. They live in `docs/`, are not packaged into the APK, and do not change app behavior.",
        "",
        "| 原文件 / Source file | 文本行数 / Text lines | 备注文件 / Note file |",
        "| --- | ---: | --- |",
    ]
    for relative, count in entries:
        note_relative = relative.parent / f"{relative.name}.notes.md"
        index.append(f"| `{relative.as_posix()}` | {count} | `{note_relative.as_posix()}` |")
    index.append("")
    output_root.mkdir(parents=True, exist_ok=True)
    (output_root / "INDEX.md").write_text("\n".join(index), encoding="utf-8")
    print(f"Generated {len(entries)} bilingual note files in {output_root}")


if __name__ == "__main__":
    main()
