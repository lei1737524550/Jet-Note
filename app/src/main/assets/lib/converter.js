"use strict";

const { childElements, getAttribute } = require("./xml");
const { trimPathData } = require("./path");

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatNumber(value) {
  return String(Number(Number(value).toFixed(4)));
}

function dimensionNumber(value, fallback, registry) {
  let resolved = value;
  if (registry && typeof value === "string" && value.startsWith("@")) resolved = registry.resolve(value, "dimen");
  if (resolved === undefined || resolved === null) return String(fallback);
  const match = String(resolved).match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/);
  return match ? match[0] : String(fallback);
}

function sanitizeId(value, fallback) {
  const cleaned = String(value || fallback).replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^[^A-Za-z_]+/, "");
  return cleaned || fallback;
}

class IdFactory {
  constructor() {
    this.used = new Set();
    this.counter = 0;
  }

  create(preferred, prefix = "item") {
    const base = sanitizeId(preferred, `${prefix}-${++this.counter}`);
    let id = base;
    let suffix = 2;
    while (this.used.has(id)) id = `${base}-${suffix++}`;
    this.used.add(id);
    return id;
  }
}

class ResourceRegistry {
  constructor() {
    this.values = new Map();
  }

  register(root, fileBaseName = "resource") {
    if (root.localName === "resources") {
      for (const child of childElements(root)) {
        const name = getAttribute(child, "name");
        const type = child.localName === "item" ? getAttribute(child, "type") : child.localName;
        if (name && type) this.values.set(`${type}/${name}`, child);
      }
    } else if (["selector", "gradient"].includes(root.localName)) {
      this.values.set(`color/${fileBaseName}`, root);
    }
  }

  resolve(reference, expectedType = "color", seen = new Set()) {
    if (typeof reference !== "string" || !reference.startsWith("@")) return reference;
    const normalized = reference.replace(/^@\+?/, "");
    const withoutPackage = normalized.includes(":") ? normalized.slice(normalized.indexOf(":") + 1) : normalized;
    const key = withoutPackage.includes("/") ? withoutPackage : `${expectedType}/${withoutPackage}`;
    if (seen.has(key)) return undefined;
    seen.add(key);

    const builtins = {
      "color/transparent": "#00000000",
      "color/black": "#FF000000",
      "color/white": "#FFFFFFFF",
      "color/darker_gray": "#FF444444",
      "color/darkgray": "#FF444444",
      "color/gray": "#FF888888",
      "color/light_gray": "#FFCCCCCC",
      "color/lightgray": "#FFCCCCCC",
      "color/red": "#FFFF0000",
      "color/green": "#FF00FF00",
      "color/blue": "#FF0000FF",
      "color/yellow": "#FFFFFF00",
      "color/cyan": "#FF00FFFF",
      "color/magenta": "#FFFF00FF",
    };
    if (normalized.startsWith("android:") && builtins[key]) return builtins[key];

    const node = this.values.get(key);
    if (!node) return undefined;
    if (["gradient", "selector"].includes(node.localName)) return node;
    const text = node.text.trim();
    return text.startsWith("@") ? this.resolve(text, expectedType, seen) : text;
  }
}

function parseLiteralColor(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (normalized.toLowerCase() === "transparent") return { color: "#000000", opacity: 0, rgba: [0, 0, 0, 0] };
  if (!normalized.startsWith("#")) return { color: normalized };
  const hex = normalized.slice(1);
  let alpha = 255;
  let red;
  let green;
  let blue;
  if (hex.length === 3) {
    [red, green, blue] = [...hex].map((digit) => parseInt(digit + digit, 16));
  } else if (hex.length === 4) {
    alpha = parseInt(hex[0] + hex[0], 16);
    [red, green, blue] = [...hex.slice(1)].map((digit) => parseInt(digit + digit, 16));
  } else if (hex.length === 6) {
    red = parseInt(hex.slice(0, 2), 16);
    green = parseInt(hex.slice(2, 4), 16);
    blue = parseInt(hex.slice(4, 6), 16);
  } else if (hex.length === 8) {
    alpha = parseInt(hex.slice(0, 2), 16);
    red = parseInt(hex.slice(2, 4), 16);
    green = parseInt(hex.slice(4, 6), 16);
    blue = parseInt(hex.slice(6, 8), 16);
  } else {
    return { color: normalized };
  }
  const color = `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  return { color, opacity: alpha / 255, rgba: [red, green, blue, alpha / 255] };
}

function opacityProduct(...values) {
  const opacity = values.reduce((result, value) => result * (value === undefined ? 1 : number(value, 1)), 1);
  return opacity < 1 ? formatNumber(Math.max(0, opacity)) : undefined;
}

function selectorDefault(node) {
  const items = childElements(node, "item");
  return items.find((item) => !Object.keys(item.attributes).some((name) => name.includes("state_"))) || items[0];
}

function convertVectorDrawable(root, options = {}) {
  if (!root || root.localName !== "vector") throw new Error("Root element must be <vector>");
  const registry = options.registry || new ResourceRegistry();
  const warnings = [];
  const ids = new IdFactory();
  const defs = [];
  const viewportWidth = dimensionNumber(getAttribute(root, "viewportWidth"), 24, registry);
  const viewportHeight = dimensionNumber(getAttribute(root, "viewportHeight"), 24, registry);
  const width = dimensionNumber(getAttribute(root, "width"), viewportWidth, registry);
  const height = dimensionNumber(getAttribute(root, "height"), viewportHeight, registry);

  const warn = (message) => {
    if (!warnings.includes(message)) warnings.push(message);
  };

  function resolvePaint(value, label) {
    let resolved = value;
    if (resolved === "@null") return { color: "none" };
    if (typeof resolved === "string" && resolved.startsWith("@")) {
      resolved = registry.resolve(resolved, "color");
      if (resolved === undefined) {
        warn(`${label}: unresolved color resource ${value}; currentColor was used`);
        return { color: "currentColor" };
      }
    }
    if (resolved && typeof resolved === "object") {
      if (resolved.localName === "selector") {
        const item = selectorDefault(resolved);
        if (!item) return { color: "none" };
        const selected = getAttribute(item, "color") || item.text.trim();
        warn(`${label}: ColorStateList was reduced to its default state`);
        return resolvePaint(selected, label);
      }
      if (resolved.localName === "gradient") return { gradient: resolved };
    }
    if (typeof resolved === "string" && resolved.startsWith("?")) {
      const variable = resolved.replace(/^\?/, "").replace(/^android:/, "android-").replace(/[^A-Za-z0-9_-]/g, "-");
      warn(`${label}: theme attribute ${resolved} is emitted as a CSS custom property with currentColor fallback`);
      return { color: `var(--${variable}, currentColor)` };
    }
    return parseLiteralColor(resolved) || { color: "none" };
  }

  function nestedPaint(node, attributeName) {
    const direct = getAttribute(node, attributeName);
    if (direct !== undefined) return direct;
    const wrapper = childElements(node).find((child) => {
      const name = getAttribute(child, "name");
      return child.localName === "attr" && (name === attributeName || name?.endsWith(`:${attributeName}`));
    });
    return wrapper ? childElements(wrapper)[0] : undefined;
  }

  function gradientStops(node, label) {
    const itemNodes = childElements(node, "item");
    const rawStops = itemNodes.length > 0 ? itemNodes.map((item, index) => ({
      offset: number(getAttribute(item, "offset"), itemNodes.length === 1 ? 0 : index / (itemNodes.length - 1)),
      value: getAttribute(item, "color"),
    })) : [
      { offset: 0, value: getAttribute(node, "startColor") },
      ...(getAttribute(node, "centerColor") !== undefined ? [{ offset: 0.5, value: getAttribute(node, "centerColor") }] : []),
      { offset: 1, value: getAttribute(node, "endColor") },
    ];
    return rawStops.filter((stop) => stop.value !== undefined).map((stop) => ({
      offset: Math.max(0, Math.min(1, stop.offset)),
      paint: resolvePaint(stop.value, label),
    })).sort((a, b) => a.offset - b.offset);
  }

  function stopMarkup(stop) {
    const opacity = stop.paint.opacity === undefined ? "" : ` stop-opacity="${formatNumber(stop.paint.opacity)}"`;
    return `<stop offset="${formatNumber(stop.offset)}" stop-color="${escapeXml(stop.paint.color || "currentColor")}"${opacity} />`;
  }

  function interpolatedColor(stops, position) {
    const usable = stops.map((stop) => ({ ...stop, rgba: stop.paint.rgba })).filter((stop) => stop.rgba);
    if (usable.length === 0) return { color: "#000000", opacity: 1 };
    const before = [...usable].reverse().find((stop) => stop.offset <= position) || usable[0];
    const after = usable.find((stop) => stop.offset >= position) || usable[usable.length - 1];
    const span = after.offset - before.offset;
    const ratio = span === 0 ? 0 : (position - before.offset) / span;
    const rgba = before.rgba.map((channel, index) => channel + (after.rgba[index] - channel) * ratio);
    return {
      color: `#${rgba.slice(0, 3).map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("").toUpperCase()}`,
      opacity: rgba[3],
    };
  }

  function createGradient(node, label) {
    const type = (getAttribute(node, "type") || "linear").toLowerCase();
    const id = ids.create(getAttribute(node, "name"), `${type}-gradient`);
    const stops = gradientStops(node, label);
    if (stops.length === 0) {
      warn(`${label}: gradient has no colors; currentColor was used`);
      stops.push({ offset: 0, paint: { color: "currentColor" } }, { offset: 1, paint: { color: "currentColor" } });
    }
    const spread = { clamp: "pad", repeat: "repeat", mirror: "reflect" }[(getAttribute(node, "tileMode") || "clamp").toLowerCase()] || "pad";

    if (type === "radial") {
      defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${escapeXml(getAttribute(node, "centerX") || 0)}" cy="${escapeXml(getAttribute(node, "centerY") || 0)}" r="${escapeXml(getAttribute(node, "gradientRadius") || 0)}" spreadMethod="${spread}">${stops.map(stopMarkup).join("")}</radialGradient>`);
    } else if (type === "sweep") {
      if (stops.some((stop) => !stop.paint.rgba)) warn(`${label}: non-literal colors in a sweep gradient were approximated`);
      const centerX = number(getAttribute(node, "centerX"), number(viewportWidth) / 2);
      const centerY = number(getAttribute(node, "centerY"), number(viewportHeight) / 2);
      const radius = Math.hypot(number(viewportWidth), number(viewportHeight)) * 1.5;
      const wedges = [];
      const steps = 180;
      for (let step = 0; step < steps; step += 1) {
        const angle1 = step / steps * Math.PI * 2;
        const angle2 = (step + 1.05) / steps * Math.PI * 2;
        const paint = interpolatedColor(stops, (step + 0.5) / steps);
        wedges.push(`<path d="M${formatNumber(centerX)},${formatNumber(centerY)} L${formatNumber(centerX + Math.cos(angle1) * radius)},${formatNumber(centerY + Math.sin(angle1) * radius)} L${formatNumber(centerX + Math.cos(angle2) * radius)},${formatNumber(centerY + Math.sin(angle2) * radius)} Z" fill="${paint.color}"${paint.opacity < 1 ? ` fill-opacity="${formatNumber(paint.opacity)}"` : ""} />`);
      }
      defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" x="0" y="0" width="${viewportWidth}" height="${viewportHeight}">${wedges.join("")}</pattern>`);
    } else {
      defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${escapeXml(getAttribute(node, "startX") || 0)}" y1="${escapeXml(getAttribute(node, "startY") || 0)}" x2="${escapeXml(getAttribute(node, "endX") || 0)}" y2="${escapeXml(getAttribute(node, "endY") || 0)}" spreadMethod="${spread}">${stops.map(stopMarkup).join("")}</linearGradient>`);
    }
    return `url(#${id})`;
  }

  function paintAttributes(node, kind, label) {
    const value = nestedPaint(node, `${kind}Color`);
    if (value === undefined) return { paint: "none", opacity: undefined };
    const resolved = resolvePaint(value, label);
    const fullyTransparent = !resolved.gradient && resolved.opacity === 0;
    const paint = fullyTransparent ? "none" : resolved.gradient ? createGradient(resolved.gradient, label) : resolved.color;
    return {
      paint,
      opacity: fullyTransparent ? undefined : opacityProduct(resolved.opacity, getAttribute(node, `${kind}Alpha`)),
    };
  }

  function groupTransform(node) {
    const pivotX = number(getAttribute(node, "pivotX"));
    const pivotY = number(getAttribute(node, "pivotY"));
    const scaleX = number(getAttribute(node, "scaleX"), 1);
    const scaleY = number(getAttribute(node, "scaleY"), 1);
    const rotation = number(getAttribute(node, "rotation"));
    const translateX = number(getAttribute(node, "translateX"));
    const translateY = number(getAttribute(node, "translateY"));
    const transforms = [];
    if (translateX !== 0 || translateY !== 0) transforms.push(`translate(${formatNumber(translateX)} ${formatNumber(translateY)})`);
    if (rotation !== 0) transforms.push(`rotate(${formatNumber(rotation)} ${formatNumber(pivotX)} ${formatNumber(pivotY)})`);
    if (scaleX !== 1 || scaleY !== 1) {
      transforms.push(`translate(${formatNumber(pivotX)} ${formatNumber(pivotY)}) scale(${formatNumber(scaleX)} ${formatNumber(scaleY)}) translate(${formatNumber(-pivotX)} ${formatNumber(-pivotY)})`);
    }
    return transforms.join(" ");
  }

  function renderPath(node, indent) {
    const label = `path ${getAttribute(node, "name") || "(unnamed)"}`;
    let data = getAttribute(node, "pathData");
    if (!data) {
      warn(`${label}: missing pathData; path was skipped`);
      return "";
    }
    const trimStart = getAttribute(node, "trimPathStart");
    const trimEnd = getAttribute(node, "trimPathEnd");
    const trimOffset = getAttribute(node, "trimPathOffset");
    if (trimStart !== undefined || trimEnd !== undefined || trimOffset !== undefined) {
      data = trimPathData(data, trimStart, trimEnd, trimOffset);
    }
    const fill = paintAttributes(node, "fill", `${label} fill`);
    const stroke = paintAttributes(node, "stroke", `${label} stroke`);
    const attributes = [];
    const name = getAttribute(node, "name");
    if (name) attributes.push(`id="${ids.create(name, "path")}"`);
    attributes.push(`fill="${escapeXml(fill.paint)}"`);
    if (fill.opacity !== undefined) attributes.push(`fill-opacity="${fill.opacity}"`);
    const fillType = getAttribute(node, "fillType");
    if (fillType) {
      const rule = fillType.toLowerCase() === "evenodd" ? "evenodd" : "nonzero";
      attributes.push(`fill-rule="${rule}"`, `clip-rule="${rule}"`);
    }
    if (stroke.paint !== "none") {
      attributes.push(`stroke="${escapeXml(stroke.paint)}"`);
      if (stroke.opacity !== undefined) attributes.push(`stroke-opacity="${stroke.opacity}"`);
      attributes.push(`stroke-width="${escapeXml(getAttribute(node, "strokeWidth") || 0)}"`);
      const lineCap = getAttribute(node, "strokeLineCap");
      const lineJoin = getAttribute(node, "strokeLineJoin");
      const miterLimit = getAttribute(node, "strokeMiterLimit");
      if (lineCap) attributes.push(`stroke-linecap="${escapeXml(lineCap)}"`);
      if (lineJoin) attributes.push(`stroke-linejoin="${escapeXml(lineJoin)}"`);
      if (miterLimit) attributes.push(`stroke-miterlimit="${escapeXml(miterLimit)}"`);
    }
    attributes.push(`d="${escapeXml(data)}"`);
    return `${indent}<path ${attributes.join(" ")} />`;
  }

  function renderChildren(node, indent) {
    const lines = [];
    let clipDepth = 0;
    for (const child of childElements(node)) {
      if (child.localName === "clip-path") {
        const data = getAttribute(child, "pathData");
        if (!data) continue;
        const clipId = ids.create(getAttribute(child, "name"), "clip");
        defs.push(`<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><path d="${escapeXml(data)}" /></clipPath>`);
        lines.push(`${indent}<g clip-path="url(#${clipId})">`);
        indent += "  ";
        clipDepth += 1;
      } else if (child.localName === "path") {
        const rendered = renderPath(child, indent);
        if (rendered) lines.push(rendered);
      } else if (child.localName === "group") {
        lines.push(renderGroup(child, indent));
      }
    }
    while (clipDepth-- > 0) {
      indent = indent.slice(0, -2);
      lines.push(`${indent}</g>`);
    }
    return lines.join("\n");
  }

  function renderGroup(node, indent) {
    const attributes = [];
    const name = getAttribute(node, "name");
    if (name) attributes.push(`id="${ids.create(name, "group")}"`);
    const transform = groupTransform(node);
    if (transform) attributes.push(`transform="${escapeXml(transform)}"`);
    const opening = attributes.length ? `${indent}<g ${attributes.join(" ")}>` : `${indent}<g>`;
    const content = renderChildren(node, `${indent}  `);
    return `${opening}${content ? `\n${content}\n` : ""}${indent}</g>`;
  }

  function createTintFilter(value, mode) {
    const tint = resolvePaint(value, "vector tint");
    if (tint.gradient) {
      warn("vector tint: gradients are not supported as Android tint colors; tint was skipped");
      return null;
    }
    const id = ids.create(null, "tint");
    const flood = `<feFlood flood-color="${escapeXml(tint.color)}"${tint.opacity !== undefined ? ` flood-opacity="${formatNumber(tint.opacity)}"` : ""} result="tint" />`;
    const masked = `<feComposite in="tint" in2="SourceGraphic" operator="in" result="maskedTint" />`;
    let operation;
    switch ((mode || "src_in").toLowerCase()) {
      case "multiply": operation = `<feBlend in="SourceGraphic" in2="maskedTint" mode="multiply" />`; break;
      case "screen": operation = `<feBlend in="SourceGraphic" in2="maskedTint" mode="screen" />`; break;
      case "add": operation = `<feComposite in="SourceGraphic" in2="maskedTint" operator="arithmetic" k2="1" k3="1" />`; break;
      case "src_over": operation = `<feComposite in="maskedTint" in2="SourceGraphic" operator="over" />`; break;
      case "src_atop": operation = `<feComposite in="maskedTint" in2="SourceGraphic" operator="atop" />`; break;
      default: operation = `<feComposite in="tint" in2="SourceGraphic" operator="in" />`; break;
    }
    defs.push(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">${flood}${masked}${operation}</filter>`);
    return id;
  }

  const vectorName = getAttribute(root, "name");
  const rootId = vectorName ? ids.create(vectorName, "vector") : null;
  const rootAttributes = [];
  if (rootId) rootAttributes.push(`id="${rootId}"`);
  const rootAlpha = getAttribute(root, "alpha");
  if (rootAlpha !== undefined) rootAttributes.push(`opacity="${escapeXml(rootAlpha)}"`);
  const tint = getAttribute(root, "tint");
  if (tint !== undefined) {
    const filter = createTintFilter(tint, getAttribute(root, "tintMode") || getAttribute(root, "tintBlendMode"));
    if (filter) rootAttributes.push(`filter="url(#${filter})"`);
  }
  if (getAttribute(root, "autoMirrored") === "true") {
    if (options.rtl) rootAttributes.push(`transform="translate(${viewportWidth} 0) scale(-1 1)"`);
    else warn("autoMirrored=true is layout-direction dependent; use --rtl to emit the mirrored form");
  }

  const body = renderChildren(root, "    ");
  const rootGroup = `  <g${rootAttributes.length ? ` ${rootAttributes.join(" ")}` : ""}>${body ? `\n${body}\n  ` : ""}</g>`;
  const svg = [
    `<svg width="${escapeXml(width)}" height="${escapeXml(height)}" viewBox="0 0 ${escapeXml(viewportWidth)} ${escapeXml(viewportHeight)}" xmlns="http://www.w3.org/2000/svg">`,
    ...(defs.length ? [`  <defs>\n    ${defs.join("\n    ")}\n  </defs>`] : []),
    rootGroup,
    "</svg>",
    "",
  ].join("\n");

  return { svg, warnings };
}

module.exports = { ResourceRegistry, convertVectorDrawable, parseLiteralColor };
