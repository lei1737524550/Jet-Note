"use strict";

const NUMBER = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/y;
const COMMAND = /^[AaCcHhLlMmQqSsTtVvZz]$/;

function tokenize(pathData) {
  const tokens = [];
  let index = 0;
  while (index < pathData.length) {
    const character = pathData[index];
    if (/[\s,]/.test(character)) {
      index += 1;
    } else if (COMMAND.test(character)) {
      tokens.push(character);
      index += 1;
    } else {
      NUMBER.lastIndex = index;
      const match = NUMBER.exec(pathData);
      if (!match) throw new Error(`Invalid pathData near: ${pathData.slice(index, index + 24)}`);
      tokens.push(Number(match[0]));
      index = NUMBER.lastIndex;
    }
  }
  return tokens;
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointOnCubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: u ** 3 * p0.x + 3 * u ** 2 * t * p1.x + 3 * u * t ** 2 * p2.x + t ** 3 * p3.x,
    y: u ** 3 * p0.y + 3 * u ** 2 * t * p1.y + 3 * u * t ** 2 * p2.y + t ** 3 * p3.y,
  };
}

function pointOnQuadratic(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: u ** 2 * p0.x + 2 * u * t * p1.x + t ** 2 * p2.x,
    y: u ** 2 * p0.y + 2 * u * t * p1.y + t ** 2 * p2.y,
  };
}

function vectorAngle(ux, uy, vx, vy) {
  const dot = ux * vx + uy * vy;
  const length = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot / length)));
  return ux * vy - uy * vx < 0 ? -angle : angle;
}

function sampleArc(from, rxValue, ryValue, rotation, largeArc, sweep, to) {
  let rx = Math.abs(rxValue);
  let ry = Math.abs(ryValue);
  if (rx === 0 || ry === 0 || (from.x === to.x && from.y === to.y)) return [to];

  const phi = rotation * Math.PI / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const xPrime = cosPhi * dx + sinPhi * dy;
  const yPrime = -sinPhi * dx + cosPhi * dy;
  const scale = xPrime ** 2 / rx ** 2 + yPrime ** 2 / ry ** 2;
  if (scale > 1) {
    const factor = Math.sqrt(scale);
    rx *= factor;
    ry *= factor;
  }

  const numerator = Math.max(0, rx ** 2 * ry ** 2 - rx ** 2 * yPrime ** 2 - ry ** 2 * xPrime ** 2);
  const denominator = rx ** 2 * yPrime ** 2 + ry ** 2 * xPrime ** 2;
  const sign = Boolean(largeArc) === Boolean(sweep) ? -1 : 1;
  const coefficient = denominator === 0 ? 0 : sign * Math.sqrt(numerator / denominator);
  const cxPrime = coefficient * (rx * yPrime / ry);
  const cyPrime = coefficient * (-ry * xPrime / rx);
  const cx = cosPhi * cxPrime - sinPhi * cyPrime + (from.x + to.x) / 2;
  const cy = sinPhi * cxPrime + cosPhi * cyPrime + (from.y + to.y) / 2;

  const ux = (xPrime - cxPrime) / rx;
  const uy = (yPrime - cyPrime) / ry;
  const vx = (-xPrime - cxPrime) / rx;
  const vy = (-yPrime - cyPrime) / ry;
  const startAngle = vectorAngle(1, 0, ux, uy);
  let deltaAngle = vectorAngle(ux, uy, vx, vy);
  if (!sweep && deltaAngle > 0) deltaAngle -= Math.PI * 2;
  if (sweep && deltaAngle < 0) deltaAngle += Math.PI * 2;

  const steps = Math.max(4, Math.min(512, Math.ceil(Math.abs(deltaAngle) * Math.max(rx, ry) / 0.35)));
  const points = [];
  for (let step = 1; step <= steps; step += 1) {
    const angle = startAngle + deltaAngle * step / steps;
    const x = rx * Math.cos(angle);
    const y = ry * Math.sin(angle);
    points.push({ x: cosPhi * x - sinPhi * y + cx, y: sinPhi * x + cosPhi * y + cy });
  }
  points[points.length - 1] = to;
  return points;
}

function samplePath(pathData) {
  const tokens = tokenize(pathData);
  const contours = [];
  let contour = null;
  let index = 0;
  let command = null;
  let current = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  let cubicControl = null;
  let quadraticControl = null;

  const number = () => {
    if (typeof tokens[index] !== "number") throw new Error(`Missing parameters for path command ${command}`);
    return tokens[index++];
  };
  const hasNumbers = () => typeof tokens[index] === "number";
  const absolutePoint = (x, y, relative) => relative ? { x: current.x + x, y: current.y + y } : { x, y };
  const beginContour = (point) => {
    contour = [point];
    contours.push(contour);
    current = point;
    start = point;
  };
  const addPoint = (point) => {
    if (!contour) beginContour(current);
    if (distance(contour[contour.length - 1], point) > 1e-12) contour.push(point);
    current = point;
  };
  const resetControls = () => {
    cubicControl = null;
    quadraticControl = null;
  };

  while (index < tokens.length) {
    if (typeof tokens[index] === "string") command = tokens[index++];
    if (!command) throw new Error("pathData must begin with a command");
    const lower = command.toLowerCase();
    const relative = command === lower;

    if (lower === "z") {
      addPoint({ ...start });
      resetControls();
      command = null;
      continue;
    }

    if (!hasNumbers()) throw new Error(`Missing parameters for path command ${command}`);
    let firstMove = true;
    do {
      if (lower === "m") {
        const point = absolutePoint(number(), number(), relative);
        if (firstMove) beginContour(point);
        else addPoint(point);
        firstMove = false;
      } else if (lower === "l") {
        addPoint(absolutePoint(number(), number(), relative));
      } else if (lower === "h") {
        const x = number();
        addPoint({ x: relative ? current.x + x : x, y: current.y });
      } else if (lower === "v") {
        const y = number();
        addPoint({ x: current.x, y: relative ? current.y + y : y });
      } else if (lower === "c") {
        const control1 = absolutePoint(number(), number(), relative);
        const control2 = absolutePoint(number(), number(), relative);
        const point = absolutePoint(number(), number(), relative);
        const estimate = distance(current, control1) + distance(control1, control2) + distance(control2, point);
        const steps = Math.max(8, Math.min(256, Math.ceil(estimate / 0.35)));
        const origin = current;
        for (let step = 1; step <= steps; step += 1) addPoint(pointOnCubic(origin, control1, control2, point, step / steps));
        cubicControl = control2;
        quadraticControl = null;
      } else if (lower === "s") {
        const control1 = cubicControl ? { x: 2 * current.x - cubicControl.x, y: 2 * current.y - cubicControl.y } : { ...current };
        const control2 = absolutePoint(number(), number(), relative);
        const point = absolutePoint(number(), number(), relative);
        const estimate = distance(current, control1) + distance(control1, control2) + distance(control2, point);
        const steps = Math.max(8, Math.min(256, Math.ceil(estimate / 0.35)));
        const origin = current;
        for (let step = 1; step <= steps; step += 1) addPoint(pointOnCubic(origin, control1, control2, point, step / steps));
        cubicControl = control2;
        quadraticControl = null;
      } else if (lower === "q") {
        const control = absolutePoint(number(), number(), relative);
        const point = absolutePoint(number(), number(), relative);
        const estimate = distance(current, control) + distance(control, point);
        const steps = Math.max(8, Math.min(256, Math.ceil(estimate / 0.35)));
        const origin = current;
        for (let step = 1; step <= steps; step += 1) addPoint(pointOnQuadratic(origin, control, point, step / steps));
        quadraticControl = control;
        cubicControl = null;
      } else if (lower === "t") {
        const control = quadraticControl ? { x: 2 * current.x - quadraticControl.x, y: 2 * current.y - quadraticControl.y } : { ...current };
        const point = absolutePoint(number(), number(), relative);
        const estimate = distance(current, control) + distance(control, point);
        const steps = Math.max(8, Math.min(256, Math.ceil(estimate / 0.35)));
        const origin = current;
        for (let step = 1; step <= steps; step += 1) addPoint(pointOnQuadratic(origin, control, point, step / steps));
        quadraticControl = control;
        cubicControl = null;
      } else if (lower === "a") {
        const rx = number();
        const ry = number();
        const rotation = number();
        const largeArc = number();
        const sweep = number();
        const point = absolutePoint(number(), number(), relative);
        const origin = current;
        for (const sampled of sampleArc(origin, rx, ry, rotation, largeArc, sweep, point)) addPoint(sampled);
        resetControls();
      } else {
        throw new Error(`Unsupported path command ${command}`);
      }

      if (!["c", "s", "q", "t"].includes(lower)) resetControls();
      if (typeof tokens[index] === "string") break;
    } while (hasNumbers());
  }

  return contours.filter((points) => points.length > 1);
}

function formatNumber(value) {
  const rounded = Math.abs(value) < 1e-9 ? 0 : Number(value.toFixed(4));
  return String(rounded);
}

function trimPathData(pathData, startValue, endValue, offsetValue) {
  const startRaw = Number(startValue ?? 0);
  const endRaw = Number(endValue ?? 1);
  const offset = Number(offsetValue ?? 0);
  if (![startRaw, endRaw, offset].every(Number.isFinite)) throw new Error("Trim path values must be numeric");
  if (startRaw === 0 && endRaw === 1 && offset === 0) return pathData;

  const contours = samplePath(pathData);
  const segments = [];
  let total = 0;
  contours.forEach((points, contourIndex) => {
    for (let index = 1; index < points.length; index += 1) {
      const length = distance(points[index - 1], points[index]);
      if (length > 0) {
        segments.push({ from: points[index - 1], to: points[index], start: total, end: total + length, contourIndex });
        total += length;
      }
    }
  });
  if (total === 0) return "";

  const normalize = (value) => ((value % 1) + 1) % 1;
  const start = normalize(startRaw + offset);
  const end = normalize(endRaw + offset);
  const full = Math.abs(endRaw - startRaw) >= 1;
  if (!full && Math.abs(start - end) < 1e-12) return "";
  const intervals = full ? [[0, total]] : start < end
    ? [[start * total, end * total]]
    : [[start * total, total], [0, end * total]];

  const pieces = [];
  for (const [intervalStart, intervalEnd] of intervals) {
    let currentPiece = null;
    for (const segment of segments) {
      const fromLength = Math.max(segment.start, intervalStart);
      const toLength = Math.min(segment.end, intervalEnd);
      if (toLength <= fromLength) continue;
      const segmentLength = segment.end - segment.start;
      const interpolate = (position) => {
        const ratio = (position - segment.start) / segmentLength;
        return {
          x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
          y: segment.from.y + (segment.to.y - segment.from.y) * ratio,
        };
      };
      const from = interpolate(fromLength);
      const to = interpolate(toLength);
      if (!currentPiece || currentPiece.contourIndex !== segment.contourIndex || distance(currentPiece.points[currentPiece.points.length - 1], from) > 1e-5) {
        currentPiece = { contourIndex: segment.contourIndex, points: [from, to] };
        pieces.push(currentPiece);
      } else {
        currentPiece.points.push(to);
      }
    }
  }

  return pieces.map(({ points }) => points.map((point, index) =>
    `${index === 0 ? "M" : "L"}${formatNumber(point.x)},${formatNumber(point.y)}`).join(" ")).join(" ");
}

module.exports = { samplePath, trimPathData };
