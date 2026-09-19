"use strict";

function decodeEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, body) => {
    if (body[0] === "#") {
      const radix = body[1].toLowerCase() === "x" ? 16 : 10;
      const digits = radix === 16 ? body.slice(2) : body.slice(1);
      return String.fromCodePoint(parseInt(digits, radix));
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[body.toLowerCase()];
  });
}

function localName(name) {
  const separator = name.indexOf(":");
  return separator === -1 ? name : name.slice(separator + 1);
}

function findTagEnd(xml, start) {
  let quote = null;
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  throw new Error("Unterminated XML tag");
}

function parseAttributes(source) {
  const attributes = {};
  let index = 0;

  while (index < source.length) {
    while (/\s/.test(source[index] || "")) index += 1;
    if (index >= source.length) break;

    const nameMatch = source.slice(index).match(/^([^\s=/>]+)/);
    if (!nameMatch) throw new Error(`Invalid XML attribute near: ${source.slice(index, index + 30)}`);
    const name = nameMatch[1];
    index += name.length;
    while (/\s/.test(source[index] || "")) index += 1;
    if (source[index] !== "=") throw new Error(`Missing '=' after XML attribute ${name}`);
    index += 1;
    while (/\s/.test(source[index] || "")) index += 1;

    const quote = source[index];
    if (quote !== '"' && quote !== "'") throw new Error(`Attribute ${name} must be quoted`);
    index += 1;
    const end = source.indexOf(quote, index);
    if (end === -1) throw new Error(`Unterminated XML attribute ${name}`);
    attributes[name] = decodeEntities(source.slice(index, end));
    index = end + 1;
  }

  return attributes;
}

function parseXml(xml) {
  const source = xml.replace(/^\uFEFF/, "");
  const document = { name: "#document", localName: "#document", attributes: {}, children: [], text: "" };
  const stack = [document];
  let index = 0;

  while (index < source.length) {
    const open = source.indexOf("<", index);
    if (open === -1) {
      stack[stack.length - 1].text += decodeEntities(source.slice(index));
      break;
    }
    if (open > index) stack[stack.length - 1].text += decodeEntities(source.slice(index, open));

    if (source.startsWith("<!--", open)) {
      const end = source.indexOf("-->", open + 4);
      if (end === -1) throw new Error("Unterminated XML comment");
      index = end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", open)) {
      const end = source.indexOf("]]>", open + 9);
      if (end === -1) throw new Error("Unterminated CDATA section");
      stack[stack.length - 1].text += source.slice(open + 9, end);
      index = end + 3;
      continue;
    }
    if (source.startsWith("<?", open)) {
      const end = source.indexOf("?>", open + 2);
      if (end === -1) throw new Error("Unterminated XML processing instruction");
      index = end + 2;
      continue;
    }
    if (/^<!DOCTYPE\b/i.test(source.slice(open))) {
      throw new Error("DOCTYPE declarations are not supported");
    }

    const close = findTagEnd(source, open + 1);
    let tag = source.slice(open + 1, close).trim();
    index = close + 1;

    if (tag.startsWith("/")) {
      const closingName = tag.slice(1).trim();
      if (stack.length === 1 || stack[stack.length - 1].name !== closingName) {
        throw new Error(`Unexpected closing tag </${closingName}>`);
      }
      stack.pop();
      continue;
    }

    const selfClosing = tag.endsWith("/");
    if (selfClosing) tag = tag.slice(0, -1).trimEnd();
    const nameMatch = tag.match(/^([^\s/>]+)/);
    if (!nameMatch) throw new Error("Invalid XML element");
    const name = nameMatch[1];
    const node = {
      name,
      localName: localName(name),
      attributes: parseAttributes(tag.slice(name.length)),
      children: [],
      text: "",
    };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }

  if (stack.length !== 1) throw new Error(`Unclosed XML element <${stack[stack.length - 1].name}>`);
  const roots = document.children.filter((child) => child.name !== "#text");
  if (roots.length !== 1) throw new Error("XML must contain exactly one root element");
  return roots[0];
}

function getAttribute(node, name) {
  if (Object.prototype.hasOwnProperty.call(node.attributes, name)) return node.attributes[name];
  const namespaced = `android:${name}`;
  if (Object.prototype.hasOwnProperty.call(node.attributes, namespaced)) return node.attributes[namespaced];
  const matchingName = Object.keys(node.attributes).find((key) => localName(key) === name);
  return matchingName === undefined ? undefined : node.attributes[matchingName];
}

function childElements(node, name) {
  return name ? node.children.filter((child) => child.localName === name) : node.children.slice();
}

module.exports = { childElements, getAttribute, localName, parseXml };
