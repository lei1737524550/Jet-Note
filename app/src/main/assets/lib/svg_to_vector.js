"use strict";

const { getAttribute, parseXml } = require("./xml");

const PRESENTATION_PROPERTIES = Object.freeze([
  "fill", "stroke", "color",
  "fill-opacity", "stroke-opacity",
  "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
  "fill-rule"
]);

const NAMED_COLORS = Object.freeze({
  black: "#000000", silver: "#C0C0C0", gray: "#808080", grey: "#808080", white: "#FFFFFF",
  maroon: "#800000", red: "#FF0000", purple: "#800080", fuchsia: "#FF00FF", magenta: "#FF00FF",
  green: "#008000", lime: "#00FF00", olive: "#808000", yellow: "#FFFF00",
  navy: "#000080", blue: "#0000FF", teal: "#008080", aqua: "#00FFFF", cyan: "#00FFFF",
  orange: "#FFA500", transparent: "#00000000"
});

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function num(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function format(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(6)));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, num(value, 1)));
}

function styleMap(node) {
  const result = Object.create(null);
  const raw = getAttribute(node, "style") || "";
  for (const declaration of raw.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon <= 0) continue;
    const key = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

function localProperty(node, name, styles = styleMap(node)) {
  // Presentation attributes override inherited values; inline style overrides presentation attributes per CSS.
  const styleValue = styles[name];
  if (styleValue !== undefined) return styleValue;
  return getAttribute(node, name);
}

function computedPresentation(node, inherited = {}) {
  const styles = styleMap(node);
  const result = { ...inherited };
  for (const name of PRESENTATION_PROPERTIES) {
    const value = localProperty(node, name, styles);
    if (value !== undefined) result[name] = value;
  }
  return result;
}

function hexByte(value) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0").toUpperCase();
}

function normalizeCssColor(value, currentColor, warnings, label) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  let raw = String(value).trim();
  const lower = raw.toLowerCase();
  if (lower === "none") return null;
  if (lower === "currentcolor") raw = currentColor || "#000000";
  else if (NAMED_COLORS[lower]) raw = NAMED_COLORS[lower];

  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    const rgb = raw.slice(1).split("").map((c) => c + c).join("").toUpperCase();
    return { a: 255, rgb };
  }
  if (/^#[0-9a-f]{4}$/i.test(raw)) {
    const rgba = raw.slice(1).split("").map((c) => c + c).join("").toUpperCase();
    return { a: parseInt(rgba.slice(6, 8), 16), rgb: rgba.slice(0, 6) };
  }
  if (/^#[0-9a-f]{6}$/i.test(raw)) return { a: 255, rgb: raw.slice(1).toUpperCase() };
  if (/^#[0-9a-f]{8}$/i.test(raw)) {
    // SVG/CSS: #RRGGBBAA
    const rgba = raw.slice(1).toUpperCase();
    return { a: parseInt(rgba.slice(6, 8), 16), rgb: rgba.slice(0, 6) };
  }

  const match = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (match) {
    const parts = match[1].split(/[\s,\/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const channel = (text) => text.endsWith("%")
        ? Math.max(0, Math.min(255, num(text.slice(0, -1), 0) * 2.55))
        : Math.max(0, Math.min(255, num(text, 0)));
      const r = channel(parts[0]), g = channel(parts[1]), b = channel(parts[2]);
      const alphaText = parts[3];
      const alpha = alphaText === undefined ? 1 : alphaText.endsWith("%")
        ? clamp01(num(alphaText.slice(0, -1), 100) / 100)
        : clamp01(alphaText);
      return { a: Math.round(alpha * 255), rgb: `${hexByte(r)}${hexByte(g)}${hexByte(b)}` };
    }
  }

  warnings.push(`${label}: unsupported SVG color '${raw}' was replaced with black.`);
  return { a: 255, rgb: "000000" };
}

function androidColor(value, currentColor, warnings, label) {
  const color = normalizeCssColor(value, currentColor, warnings, label);
  if (!color) return "#00000000";
  return `#${hexByte(color.a)}${color.rgb}`; // Android VectorDrawable: #AARRGGBB
}

function shapePath(node) {
  const type = node.localName;
  if (type === "path") return getAttribute(node, "d") || "";
  if (type === "rect") {
    const x = num(getAttribute(node, "x"), 0), y = num(getAttribute(node, "y"), 0);
    const w = num(getAttribute(node, "width"), 0), h = num(getAttribute(node, "height"), 0);
    const rx = Math.max(0, num(getAttribute(node, "rx"), 0));
    const ry = Math.max(0, num(getAttribute(node, "ry"), rx));
    if (rx || ry) {
      const ax = Math.min(rx, w / 2), ay = Math.min(ry, h / 2);
      return `M${format(x + ax)},${format(y)} H${format(x + w - ax)} Q${format(x + w)},${format(y)} ${format(x + w)},${format(y + ay)} V${format(y + h - ay)} Q${format(x + w)},${format(y + h)} ${format(x + w - ax)},${format(y + h)} H${format(x + ax)} Q${format(x)},${format(y + h)} ${format(x)},${format(y + h - ay)} V${format(y + ay)} Q${format(x)},${format(y)} ${format(x + ax)},${format(y)} Z`;
    }
    return `M${format(x)},${format(y)} H${format(x + w)} V${format(y + h)} H${format(x)} Z`;
  }
  if (type === "circle") {
    const cx = num(getAttribute(node, "cx"), 0), cy = num(getAttribute(node, "cy"), 0), r = num(getAttribute(node, "r"), 0);
    return `M${format(cx - r)},${format(cy)} A${format(r)},${format(r)} 0 1 0 ${format(cx + r)},${format(cy)} A${format(r)},${format(r)} 0 1 0 ${format(cx - r)},${format(cy)} Z`;
  }
  if (type === "ellipse") {
    const cx = num(getAttribute(node, "cx"), 0), cy = num(getAttribute(node, "cy"), 0);
    const rx = num(getAttribute(node, "rx"), 0), ry = num(getAttribute(node, "ry"), 0);
    return `M${format(cx - rx)},${format(cy)} A${format(rx)},${format(ry)} 0 1 0 ${format(cx + rx)},${format(cy)} A${format(rx)},${format(ry)} 0 1 0 ${format(cx - rx)},${format(cy)} Z`;
  }
  if (type === "line") {
    return `M${format(num(getAttribute(node, "x1"), 0))},${format(num(getAttribute(node, "y1"), 0))} L${format(num(getAttribute(node, "x2"), 0))},${format(num(getAttribute(node, "y2"), 0))}`;
  }
  if (type === "polyline" || type === "polygon") {
    const coords = (getAttribute(node, "points") || "").trim().match(/-?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) || [];
    if (coords.length < 2) return "";
    const pairs = [];
    for (let i = 0; i + 1 < coords.length; i += 2) pairs.push(`${coords[i]},${coords[i + 1]}`);
    return `M${pairs.join(" L")}${type === "polygon" ? " Z" : ""}`;
  }
  return "";
}

function transformAttributes(transform, warnings) {
  if (!transform) return "";
  let attrs = "";
  const regex = /(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g;
  let match;
  while ((match = regex.exec(transform))) {
    const values = match[2].split(/[ ,]+/).filter(Boolean).map(Number);
    if (match[1] === "translate") {
      attrs += ` android:translateX="${format(values[0] || 0)}" android:translateY="${format(values[1] || 0)}"`;
    } else if (match[1] === "scale") {
      const sx = Number.isFinite(values[0]) ? values[0] : 1;
      const sy = Number.isFinite(values[1]) ? values[1] : sx;
      attrs += ` android:scaleX="${format(sx)}" android:scaleY="${format(sy)}"`;
    } else if (match[1] === "rotate") {
      attrs += ` android:rotation="${format(values[0] || 0)}"`;
      if (Number.isFinite(values[1])) attrs += ` android:pivotX="${format(values[1])}"`;
      if (Number.isFinite(values[2])) attrs += ` android:pivotY="${format(values[2])}"`;
    } else {
      warnings.push("SVG matrix() transform is not directly representable by VectorDrawable and was skipped.");
    }
  }
  return attrs;
}

function renderPath(node, indent, warnings, inherited, inheritedOpacity) {
  const d = shapePath(node);
  if (!d) {
    warnings.push(`Unsupported SVG element <${node.localName}> was skipped.`);
    return "";
  }

  const styles = styleMap(node);
  const presentation = computedPresentation(node, inherited);
  const currentColor = presentation.color || "#000000";
  const localOpacity = clamp01(localProperty(node, "opacity", styles));
  const effectiveOpacity = inheritedOpacity * localOpacity;

  // SVG defaults: fill=black, stroke=none. Explicit/inherited fill="none" must stay transparent.
  const fillValue = presentation.fill === undefined ? "#000000" : presentation.fill;
  const strokeValue = presentation.stroke === undefined ? "none" : presentation.stroke;
  const fillEnabled = String(fillValue).trim().toLowerCase() !== "none";
  const strokeEnabled = String(strokeValue).trim().toLowerCase() !== "none";

  let line = `${indent}<path android:pathData="${esc(d)}"`;
  line += ` android:fillColor="${fillEnabled ? androidColor(fillValue, currentColor, warnings, "fill") : "#00000000"}"`;

  if (strokeEnabled) {
    line += ` android:strokeColor="${androidColor(strokeValue, currentColor, warnings, "stroke")}"`;
    line += ` android:strokeWidth="${format(num(presentation["stroke-width"], 1))}"`;
    const cap = presentation["stroke-linecap"];
    const join = presentation["stroke-linejoin"];
    const miter = presentation["stroke-miterlimit"];
    if (cap) line += ` android:strokeLineCap="${esc(cap)}"`;
    if (join) line += ` android:strokeLineJoin="${esc(join)}"`;
    if (miter !== undefined) line += ` android:strokeMiterLimit="${format(num(miter, 4))}"`;
  }

  const fillAlpha = effectiveOpacity * clamp01(presentation["fill-opacity"] === undefined ? 1 : presentation["fill-opacity"]);
  const strokeAlpha = effectiveOpacity * clamp01(presentation["stroke-opacity"] === undefined ? 1 : presentation["stroke-opacity"]);
  if (fillEnabled && fillAlpha < 1) line += ` android:fillAlpha="${format(fillAlpha)}"`;
  if (strokeEnabled && strokeAlpha < 1) line += ` android:strokeAlpha="${format(strokeAlpha)}"`;

  const fillRule = String(presentation["fill-rule"] || "").toLowerCase();
  if (fillRule === "evenodd" || fillRule === "even-odd") line += ` android:fillType="evenOdd"`;
  else if (fillRule === "nonzero") line += ` android:fillType="nonZero"`;

  return `${line} />\n`;
}

function renderChildren(parent, indent, warnings, inherited = {}, inheritedOpacity = 1) {
  const parentStyles = styleMap(parent);
  const presentation = computedPresentation(parent, inherited);
  const localOpacityRaw = localProperty(parent, "opacity", parentStyles);
  const localOpacity = localOpacityRaw === undefined ? 1 : clamp01(localOpacityRaw);
  const accumulatedOpacity = inheritedOpacity * localOpacity;
  let output = "";

  for (const node of parent.children || []) {
    if (["defs", "title", "desc", "metadata"].includes(node.localName)) continue;
    if (node.localName === "g") {
      output += `${indent}<group${transformAttributes(getAttribute(node, "transform"), warnings)}>\n`;
      output += renderChildren(node, `${indent}    `, warnings, presentation, accumulatedOpacity);
      output += `${indent}</group>\n`;
    } else if (["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"].includes(node.localName)) {
      output += renderPath(node, indent, warnings, presentation, accumulatedOpacity);
    } else {
      warnings.push(`Unsupported SVG element <${node.localName}> was skipped.`);
    }
  }
  return output;
}

function dimension(value, fallback) {
  const parsed = num(value, NaN);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function convertSvgToVectorDrawable(source) {
  const root = parseXml(String(source));
  if (!root || root.localName !== "svg") throw new Error("Input root must be <svg>.");

  const warnings = [];
  const rawViewBox = (getAttribute(root, "viewBox") || "").trim().split(/[ ,]+/).map(Number);
  let minX = 0, minY = 0;
  let viewportWidth, viewportHeight;

  if (rawViewBox.length === 4 && rawViewBox.every(Number.isFinite)) {
    [minX, minY, viewportWidth, viewportHeight] = rawViewBox;
  } else {
    viewportWidth = dimension(getAttribute(root, "width"), 24);
    viewportHeight = dimension(getAttribute(root, "height"), 24);
  }
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) throw new Error("SVG viewBox width and height must be positive.");

  // Display size and viewport size are different concepts. Preserve explicit SVG width/height.
  const width = dimension(getAttribute(root, "width"), viewportWidth);
  const height = dimension(getAttribute(root, "height"), viewportHeight);

  let body = renderChildren(root, "    ", warnings);
  if (!body.trim()) throw new Error("No convertible SVG shapes were found.");
  if (minX !== 0 || minY !== 0) {
    body = `    <group android:translateX="${format(-minX)}" android:translateY="${format(-minY)}">\n${body.replace(/^/gm, "    ")}    </group>\n`;
  }

  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
    `    android:width="${format(width)}dp"`,
    `    android:height="${format(height)}dp"`,
    `    android:viewportWidth="${format(viewportWidth)}"`,
    `    android:viewportHeight="${format(viewportHeight)}">`,
    body.trimEnd(),
    '</vector>',
    ''
  ].join("\n");

  return { xml, warnings };
}

module.exports = { convertSvgToVectorDrawable };
