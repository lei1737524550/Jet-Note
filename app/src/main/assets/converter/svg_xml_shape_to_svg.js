"use strict";

const { childElements, getAttribute } = require("./xml");

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function numberFromDimension(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const match = String(value).trim().match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/);
  if (!match) return fallback;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : fallback;
}

function formatNumber(value) {
  return String(Number(Number(value).toFixed(4)));
}

function colorToSvg(value, warnings, label) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (text.startsWith("@") || text.startsWith("?")) {
    warnings.push(`${label}: Android resource/theme color ${text} cannot be resolved in a standalone SVG; currentColor was used.`);
    return { color: "currentColor", opacity: 1 };
  }
  if (text.toLowerCase() === "transparent") return { color: "#000000", opacity: 0 };
  if (!text.startsWith("#")) return { color: text, opacity: 1 };

  const hex = text.slice(1);
  let a = 255, r, g, b;
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16); g = parseInt(hex[1] + hex[1], 16); b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 4) {
    a = parseInt(hex[0] + hex[0], 16); r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 6) {
    r = parseInt(hex.slice(0,2), 16); g = parseInt(hex.slice(2,4), 16); b = parseInt(hex.slice(4,6), 16);
  } else if (hex.length === 8) {
    a = parseInt(hex.slice(0,2), 16); r = parseInt(hex.slice(2,4), 16); g = parseInt(hex.slice(4,6), 16); b = parseInt(hex.slice(6,8), 16);
  } else {
    return { color: text, opacity: 1 };
  }
  const color = `#${[r,g,b].map(v => v.toString(16).padStart(2,"0")).join("").toUpperCase()}`;
  return { color, opacity: a / 255 };
}

function child(node, localName) {
  return childElements(node).find((item) => item.localName === localName) || null;
}

function paintAttrs(paint, kind) {
  if (!paint) return `${kind}="none"`;
  const opacity = paint.opacity < 1 ? ` ${kind}-opacity="${formatNumber(paint.opacity)}"` : "";
  return `${kind}="${escapeXml(paint.color)}"${opacity}`;
}

function cornerPath(width, height, radii) {
  const tl = Math.max(0, Math.min(radii.tl, width / 2, height / 2));
  const tr = Math.max(0, Math.min(radii.tr, width / 2, height / 2));
  const br = Math.max(0, Math.min(radii.br, width / 2, height / 2));
  const bl = Math.max(0, Math.min(radii.bl, width / 2, height / 2));
  return [
    `M${formatNumber(tl)},0`,
    `H${formatNumber(width - tr)}`,
    tr ? `A${formatNumber(tr)},${formatNumber(tr)} 0 0 1 ${formatNumber(width)},${formatNumber(tr)}` : `L${formatNumber(width)},0`,
    `V${formatNumber(height - br)}`,
    br ? `A${formatNumber(br)},${formatNumber(br)} 0 0 1 ${formatNumber(width - br)},${formatNumber(height)}` : `L${formatNumber(width)},${formatNumber(height)}`,
    `H${formatNumber(bl)}`,
    bl ? `A${formatNumber(bl)},${formatNumber(bl)} 0 0 1 0,${formatNumber(height - bl)}` : `L0,${formatNumber(height)}`,
    `V${formatNumber(tl)}`,
    tl ? `A${formatNumber(tl)},${formatNumber(tl)} 0 0 1 ${formatNumber(tl)},0` : "L0,0",
    "Z"
  ].join(" ");
}

function gradientDefinition(gradient, width, height, warnings) {
  if (!gradient) return null;
  const start = colorToSvg(getAttribute(gradient, "startColor"), warnings, "gradient startColor") || { color: "currentColor", opacity: 1 };
  const centerValue = getAttribute(gradient, "centerColor");
  const end = colorToSvg(getAttribute(gradient, "endColor"), warnings, "gradient endColor") || start;
  const center = centerValue !== undefined ? colorToSvg(centerValue, warnings, "gradient centerColor") : null;
  const type = String(getAttribute(gradient, "type") || "linear").toLowerCase();

  function stop(offset, paint) {
    return `<stop offset="${offset}" stop-color="${escapeXml(paint.color)}"${paint.opacity < 1 ? ` stop-opacity="${formatNumber(paint.opacity)}"` : ""} />`;
  }
  const stops = [stop("0", start), ...(center ? [stop("0.5", center)] : []), stop("1", end)].join("");

  if (type === "radial") {
    const cxRaw = getAttribute(gradient, "centerX");
    const cyRaw = getAttribute(gradient, "centerY");
    const cx = cxRaw === undefined ? width / 2 : Number(cxRaw) <= 1 ? Number(cxRaw) * width : Number(cxRaw);
    const cy = cyRaw === undefined ? height / 2 : Number(cyRaw) <= 1 ? Number(cyRaw) * height : Number(cyRaw);
    const r = numberFromDimension(getAttribute(gradient, "gradientRadius"), Math.max(width, height) / 2);
    return `<radialGradient id="shapeGradient" gradientUnits="userSpaceOnUse" cx="${formatNumber(cx)}" cy="${formatNumber(cy)}" r="${formatNumber(r)}">${stops}</radialGradient>`;
  }

  if (type === "sweep") {
    warnings.push("shape gradient: Android sweep gradients are not directly representable by a basic SVG gradient; a linear approximation was used.");
  }

  let angle = Number(getAttribute(gradient, "angle") || 0);
  if (!Number.isFinite(angle)) angle = 0;
  angle = ((angle % 360) + 360) % 360;
  const radians = angle * Math.PI / 180;
  const dx = Math.cos(radians), dy = -Math.sin(radians);
  const cx = width / 2, cy = height / 2;
  const scale = Math.abs(dx) * width / 2 + Math.abs(dy) * height / 2;
  const x1 = cx - dx * scale, y1 = cy - dy * scale, x2 = cx + dx * scale, y2 = cy + dy * scale;
  return `<linearGradient id="shapeGradient" gradientUnits="userSpaceOnUse" x1="${formatNumber(x1)}" y1="${formatNumber(y1)}" x2="${formatNumber(x2)}" y2="${formatNumber(y2)}">${stops}</linearGradient>`;
}

function convertShapeDrawable(root) {
  if (!root || root.localName !== "shape") throw new Error("Input XML root must be <shape>.");
  const warnings = [];
  const shapeType = String(getAttribute(root, "shape") || "rectangle").toLowerCase();
  const size = child(root, "size");
  const solid = child(root, "solid");
  const stroke = child(root, "stroke");
  const corners = child(root, "corners");
  const gradient = child(root, "gradient");
  const padding = child(root, "padding");

  let width = size ? numberFromDimension(getAttribute(size, "width"), NaN) : NaN;
  let height = size ? numberFromDimension(getAttribute(size, "height"), NaN) : NaN;
  if (!Number.isFinite(width) || width <= 0) {
    width = 24;
    warnings.push("shape size: width is missing or invalid; 24 was used for the standalone SVG viewport.");
  }
  if (!Number.isFinite(height) || height <= 0) {
    height = 24;
    warnings.push("shape size: height is missing or invalid; 24 was used for the standalone SVG viewport.");
  }

  if (padding) warnings.push("shape padding affects Android layout/bounds rather than pixels in a standalone SVG and was omitted.");
  const solidPaint = solid ? colorToSvg(getAttribute(solid, "color"), warnings, "solid color") : null;
  const gradientDef = gradientDefinition(gradient, width, height, warnings);
  const fillAttr = gradientDef ? `fill="url(#shapeGradient)"` : paintAttrs(solidPaint, "fill");

  const strokePaint = stroke ? colorToSvg(getAttribute(stroke, "color"), warnings, "stroke color") : null;
  const strokeWidth = stroke ? Math.max(0, numberFromDimension(getAttribute(stroke, "width"), 0)) : 0;
  let strokeAttrs = "";
  if (stroke && strokePaint && strokeWidth > 0) {
    strokeAttrs = ` ${paintAttrs(strokePaint, "stroke")} stroke-width="${formatNumber(strokeWidth)}"`;
    const dashWidth = numberFromDimension(getAttribute(stroke, "dashWidth"), 0);
    const dashGap = numberFromDimension(getAttribute(stroke, "dashGap"), 0);
    if (dashWidth > 0) strokeAttrs += ` stroke-dasharray="${formatNumber(dashWidth)} ${formatNumber(Math.max(0, dashGap))}"`;
  }

  let body = "";
  if (shapeType === "rectangle") {
    const radius = corners ? Math.max(0, numberFromDimension(getAttribute(corners, "radius"), 0)) : 0;
    const radii = {
      tl: corners ? Math.max(0, numberFromDimension(getAttribute(corners, "topLeftRadius"), radius)) : 0,
      tr: corners ? Math.max(0, numberFromDimension(getAttribute(corners, "topRightRadius"), radius)) : 0,
      br: corners ? Math.max(0, numberFromDimension(getAttribute(corners, "bottomRightRadius"), radius)) : 0,
      bl: corners ? Math.max(0, numberFromDimension(getAttribute(corners, "bottomLeftRadius"), radius)) : 0,
    };
    const same = radii.tl === radii.tr && radii.tr === radii.br && radii.br === radii.bl;
    if (same) body = `<rect x="0" y="0" width="${formatNumber(width)}" height="${formatNumber(height)}"${radii.tl ? ` rx="${formatNumber(radii.tl)}" ry="${formatNumber(radii.tl)}"` : ""} ${fillAttr}${strokeAttrs} />`;
    else body = `<path d="${cornerPath(width, height, radii)}" ${fillAttr}${strokeAttrs} />`;
  } else if (shapeType === "oval") {
    body = `<ellipse cx="${formatNumber(width/2)}" cy="${formatNumber(height/2)}" rx="${formatNumber(width/2)}" ry="${formatNumber(height/2)}" ${fillAttr}${strokeAttrs} />`;
  } else if (shapeType === "line") {
    const linePaint = strokePaint || solidPaint || { color: "currentColor", opacity: 1 };
    const lineWidth = strokeWidth > 0 ? strokeWidth : 1;
    if (!strokePaint) warnings.push("line shape: Android normally uses <stroke>; fallback paint was used.");
    body = `<line x1="0" y1="${formatNumber(height/2)}" x2="${formatNumber(width)}" y2="${formatNumber(height/2)}" ${paintAttrs(linePaint, "stroke")} stroke-width="${formatNumber(lineWidth)}" />`;
  } else if (shapeType === "ring") {
    const outer = Math.min(width, height) / 2;
    const thickness = Math.max(1, numberFromDimension(getAttribute(root, "thickness"), outer / 4));
    const inner = Math.max(0, numberFromDimension(getAttribute(root, "innerRadius"), outer - thickness));
    const cx = width/2, cy = height/2;
    const d = `M${formatNumber(cx + outer)},${formatNumber(cy)} A${formatNumber(outer)},${formatNumber(outer)} 0 1 1 ${formatNumber(cx - outer)},${formatNumber(cy)} A${formatNumber(outer)},${formatNumber(outer)} 0 1 1 ${formatNumber(cx + outer)},${formatNumber(cy)} M${formatNumber(cx + inner)},${formatNumber(cy)} A${formatNumber(inner)},${formatNumber(inner)} 0 1 0 ${formatNumber(cx - inner)},${formatNumber(cy)} A${formatNumber(inner)},${formatNumber(inner)} 0 1 0 ${formatNumber(cx + inner)},${formatNumber(cy)}`;
    body = `<path d="${d}" fill-rule="evenodd" ${fillAttr}${strokeAttrs} />`;
    if (getAttribute(root, "useLevel") === "true") warnings.push("ring useLevel=true is state/level dependent and cannot be represented in a static SVG.");
  } else {
    throw new Error(`Unsupported Android <shape> type: ${shapeType}`);
  }

  const defs = gradientDef ? `<defs>${gradientDef}</defs>` : "";
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(width)}" height="${formatNumber(height)}" viewBox="0 0 ${formatNumber(width)} ${formatNumber(height)}">${defs}${body}</svg>\n`;
  return { svg, warnings };
}

module.exports = { convertShapeDrawable };
