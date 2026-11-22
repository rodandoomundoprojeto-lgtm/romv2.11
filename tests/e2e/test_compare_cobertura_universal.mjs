import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import * as apiNoticiasQuentes from '../../functions/api/noticias-quentes.js';
import * as apiBuscaAssunto from '../../functions/api/busca-assunto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

function readRepoFile(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
}

const INDEX_HTML = readRepoFile('index.html');
const PRECOMPILED_SCRIPTS = {
  d3: new vm.Script(readRepoFile('vendor/d3.min.js'), { filename: 'vendor/d3.min.js' }),
  topojson: new vm.Script(readRepoFile('vendor/topojson-client.min.js'), { filename: 'vendor/topojson-client.min.js' }),
  world: new vm.Script(readRepoFile('data/world.js'), { filename: 'data/world.js' }),
  data: new vm.Script(readRepoFile('data/data.js'), { filename: 'data/data.js' }),
  editorial: new vm.Script(readRepoFile('data/editorial.js'), { filename: 'data/editorial.js' }),
  app: new vm.Script(readRepoFile('app.js'), { filename: 'app.js' }),
};

const ORIGINAL_FETCH = globalThis.fetch;
let activeFetchHandler = null;

globalThis.fetch = async function patchedFetch(input, init = {}) {
  if (typeof activeFetchHandler === 'function') {
    return activeFetchHandler(input, init);
  }
  return new Response('Not mocked', { status: 502 });
};

after(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  activeFetchHandler = null;
});

function createJsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

function createRssResponse(items = []) {
  const xmlItems = items
    .map((it) => {
      const srcTag = it.source
        ? `<source${it.sourceUrl ? ` url="${it.sourceUrl}"` : ''}>${it.source}</source>`
        : '';
      const pubTag = it.pubDate ? `<pubDate>${it.pubDate}</pubDate>` : '';
      const descTag = it.description ? `<description><![CDATA[${it.description}]]></description>` : '';
      return `<item><title><![CDATA[${it.title}]]></title><link>${it.link}</link>${srcTag}${pubTag}${descTag}</item>`;
    })
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Mock RSS</title>${xmlItems}</channel></rss>`;
  return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}

// ============================================================================
// Minimal DOM shim for running real app.js in node:vm
// ============================================================================
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr', 'path', 'circle', 'rect', 'line',
  'polyline', 'polygon', 'ellipse', 'use', 'stop',
]);

function decodeEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function escapeAttr(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtmlText(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseAttributes(rawAttrs) {
  const attrs = new Map();
  const rx = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = rx.exec(rawAttrs)) !== null) {
    const val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
    attrs.set(m[1].toLowerCase(), decodeEntities(val));
  }
  return attrs;
}

function splitSelectorList(sel) {
  const parts = [];
  let cur = '', bracket = 0, paren = 0, quote = '';
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (quote) {
      cur += ch;
      if (ch === quote && sel[i - 1] !== '\\') quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '[') bracket++;
    else if (ch === ']') bracket = Math.max(0, bracket - 1);
    else if (ch === '(') paren++;
    else if (ch === ')') paren = Math.max(0, paren - 1);
    else if (ch === ',' && bracket === 0 && paren === 0) {
      if (cur.trim()) parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function matchCompoundSelector(el, compound) {
  if (!el || el.nodeType !== 1) return false;
  let i = 0;
  const len = compound.length;
  while (i < len) {
    const ch = compound[i];
    if (ch === '#') {
      i++;
      let id = '';
      while (i < len && !/[.#[:\s]/.test(compound[i])) id += compound[i++];
      if (el.getAttribute('id') !== id) return false;
    } else if (ch === '.') {
      i++;
      let cls = '';
      while (i < len && !/[.#[:\s]/.test(compound[i])) cls += compound[i++];
      if (!el.classList.contains(cls)) return false;
    } else if (ch === '[') {
      i++;
      let expr = '', q = '';
      while (i < len) {
        if (q) {
          expr += compound[i];
          if (compound[i] === q && compound[i - 1] !== '\\') q = '';
          i++;
          continue;
        }
        if (compound[i] === '"' || compound[i] === "'") { q = compound[i]; expr += compound[i++]; continue; }
        if (compound[i] === ']') { i++; break; }
        expr += compound[i++];
      }
      const m = expr.match(/^([^\s=~^$*|]+)\s*(?:([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|(.*)))?$/);
      if (!m) return false;
      const attrName = m[1].toLowerCase();
      const op = m[2] || '';
      const rawExp = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : (m[5] !== undefined ? m[5].trim() : ''));
      if (!el.hasAttribute(attrName)) return false;
      if (op) {
        const actual = String(el.getAttribute(attrName) || '');
        if (op === '=' && actual !== rawExp) return false;
        if (op === '^=' && !actual.startsWith(rawExp)) return false;
        if (op === '$=' && !actual.endsWith(rawExp)) return false;
        if (op === '*=' && !actual.includes(rawExp)) return false;
        if (op === '~=' && !actual.split(/\s+/).includes(rawExp)) return false;
      }
    } else if (ch === ':') {
      i++;
      while (i < len && /[a-zA-Z0-9_-]/.test(compound[i])) i++;
      if (i < len && compound[i] === '(') {
        i++;
        let depth = 1;
        while (i < len && depth > 0) {
          if (compound[i] === '(') depth++;
          else if (compound[i] === ')') depth--;
          i++;
        }
      }
    } else {
      let tag = '';
      while (i < len && !/[.#[:\s]/.test(compound[i])) tag += compound[i++];
      if (tag && tag !== '*' && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    }
  }
  return true;
}

function tokenizeComplex(sel) {
  const tokens = [];
  let i = 0;
  const s = sel.trim();
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      while (i < s.length && /\s/.test(s[i])) i++;
      if (i < s.length && s[i] !== '>' && tokens[tokens.length - 1] !== '>') tokens.push(' ');
      continue;
    }
    if (s[i] === '>') {
      if (tokens[tokens.length - 1] === ' ') tokens.pop();
      tokens.push('>');
      i++;
      while (i < s.length && /\s/.test(s[i])) i++;
      continue;
    }
    let comp = '', bracket = 0, quote = '';
    while (i < s.length) {
      const ch = s[i];
      if (quote) {
        comp += ch;
        if (ch === quote && s[i - 1] !== '\\') quote = '';
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; comp += ch; i++; continue; }
      if (ch === '[') bracket++;
      else if (ch === ']') bracket = Math.max(0, bracket - 1);
      else if (bracket === 0 && (/\s/.test(ch) || ch === '>')) break;
      comp += ch;
      i++;
    }
    if (comp) tokens.push(comp);
  }
  return tokens;
}

function matchComplexSelector(el, selector) {
  for (const part of splitSelectorList(selector)) {
    const tokens = tokenizeComplex(part);
    if (!tokens.length) continue;
    let ok = matchCompoundSelector(el, tokens[tokens.length - 1]);
    if (!ok) continue;
    let cur = el;
    for (let t = tokens.length - 2; t >= 0; t -= 2) {
      const comb = tokens[t];
      const prevComp = tokens[t - 1];
      if (comb === '>') {
        cur = cur.parentNode;
        if (!cur || cur.nodeType !== 1 || !matchCompoundSelector(cur, prevComp)) { ok = false; break; }
      } else {
        let p = cur.parentNode;
        let matched = false;
        while (p && p.nodeType === 1) {
          if (matchCompoundSelector(p, prevComp)) { cur = p; matched = true; break; }
          p = p.parentNode;
        }
        if (!matched) { ok = false; break; }
      }
    }
    if (ok) return true;
  }
  return false;
}

function createDomFromHtml(htmlString) {
  class DomNode {
    constructor(nodeType, ownerDocument) {
      this.nodeType = nodeType;
      this.ownerDocument = ownerDocument;
      this.parentNode = null;
      this.childNodes = [];
      this._listeners = new Map();
    }
    get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
    get nextSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return idx >= 0 ? this.parentNode.childNodes[idx + 1] || null : null;
    }
    appendChild(child) {
      if (child.nodeType === 11) {
        for (const c of child.childNodes.slice()) this.appendChild(c);
        return child;
      }
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    insertBefore(newChild, refChild) {
      if (!refChild) return this.appendChild(newChild);
      if (newChild.parentNode) newChild.parentNode.removeChild(newChild);
      const idx = this.childNodes.indexOf(refChild);
      newChild.parentNode = this;
      if (idx === -1) this.childNodes.push(newChild);
      else this.childNodes.splice(idx, 0, newChild);
      return newChild;
    }
    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx >= 0) { this.childNodes.splice(idx, 1); child.parentNode = null; }
      return child;
    }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    contains(other) {
      let cur = other;
      while (cur) { if (cur === this) return true; cur = cur.parentNode; }
      return false;
    }
    compareDocumentPosition(other) {
      if (!other || this === other) return 0;
      if (this.contains(other)) return 20;
      if (other.contains(this)) return 10;
      const root = this.ownerDocument || this;
      const order = [];
      (function walk(n) {
        order.push(n);
        for (const c of n.childNodes) walk(c);
      })(root);
      const ia = order.indexOf(this);
      const ib = order.indexOf(other);
      if (ia === -1 || ib === -1) return 1;
      return ia < ib ? 4 : 2;
    }
    addEventListener(type, fn) {
      if (typeof fn !== 'function') return;
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      const list = this._listeners.get(type);
      if (!list.includes(fn)) list.push(fn);
    }
    removeEventListener(type, fn) {
      const list = this._listeners.get(type);
      if (!list) return;
      const idx = list.indexOf(fn);
      if (idx >= 0) list.splice(idx, 1);
    }
    dispatchEvent(event) {
      const ev = typeof event === 'string' ? { type: event, bubbles: true, cancelable: true } : { ...event };
      if (!ev.target) ev.target = this;
      ev.defaultPrevented = !!ev.defaultPrevented;
      let stopped = false;
      ev.preventDefault = () => { ev.defaultPrevented = true; };
      ev.stopPropagation = () => { stopped = true; };
      let cur = this;
      while (cur) {
        ev.currentTarget = cur;
        const listeners = cur._listeners ? cur._listeners.get(ev.type) : null;
        if (listeners) {
          for (const fn of listeners.slice()) fn.call(cur, ev);
        }
        if (stopped || ev.bubbles === false) break;
        cur = cur === this.ownerDocument && this.ownerDocument.defaultView ? this.ownerDocument.defaultView : (cur.parentNode || null);
      }
      return !ev.defaultPrevented;
    }
  }

  class DomText extends DomNode {
    constructor(data, ownerDocument) {
      super(3, ownerDocument);
      this.nodeName = '#text';
      this._data = String(data ?? '');
    }
    get data() { return this._data; }
    set data(v) { this._data = String(v ?? ''); }
    get textContent() { return this._data; }
    set textContent(v) { this._data = String(v ?? ''); }
    cloneNode() { return new DomText(this._data, this.ownerDocument); }
  }

  class DomFragment extends DomNode {
    constructor(ownerDocument) {
      super(11, ownerDocument);
      this.nodeName = '#document-fragment';
    }
  }

  class DomElement extends DomNode {
    constructor(tagName, ownerDocument, namespaceURI = 'http://www.w3.org/1999/xhtml') {
      super(1, ownerDocument);
      this.tagName = tagName.toUpperCase();
      this.nodeName = this.tagName;
      this.namespaceURI = namespaceURI;
      this._attrs = new Map();
      this._value = undefined;
      const self = this;
      this.style = new Proxy({}, {
        get(t, p) {
          if (p === 'setProperty') return (k, v) => { t[k] = String(v ?? ''); };
          if (p === 'getPropertyValue') return (k) => t[k] ?? '';
          if (p === 'removeProperty') return (k) => { delete t[k]; };
          return t[p] ?? '';
        },
        set(t, p, v) { t[p] = v == null ? '' : String(v); return true; },
      });
      this.dataset = new Proxy({}, {
        get(_, prop) { return self.getAttribute('data-' + String(prop).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())) ?? undefined; },
        set(_, prop, val) { self.setAttribute('data-' + String(prop).replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), String(val)); return true; },
      });
      this.classList = {
        _classes() { const r = self.getAttribute('class') || ''; return r ? r.trim().split(/\s+/).filter(Boolean) : []; },
        _save(arr) { if (arr.length) self.setAttribute('class', arr.join(' ')); else self.removeAttribute('class'); },
        add(...tks) { const a = this._classes(); tks.forEach((t) => { if (t && !a.includes(t)) a.push(t); }); this._save(a); },
        remove(...tks) { this._save(this._classes().filter((c) => !tks.includes(c))); },
        toggle(t, force) { const h = this.contains(t); const w = force !== undefined ? !!force : !h; if (w && !h) this.add(t); else if (!w && h) this.remove(t); return w; },
        contains(t) { return this._classes().includes(t); },
      };
    }
    hasAttribute(n) { return this._attrs.has(String(n).toLowerCase()); }
    getAttribute(n) { const k = String(n).toLowerCase(); return this._attrs.has(k) ? this._attrs.get(k) : null; }
    setAttribute(n, v) { this._attrs.set(String(n).toLowerCase(), String(v ?? '')); }
    removeAttribute(n) { this._attrs.delete(String(n).toLowerCase()); }
    setAttributeNS(_, n, v) { this.setAttribute(n, v); }
    getAttributeNS(_, n) { return this.getAttribute(n); }
    removeAttributeNS(_, n) { this.removeAttribute(n); }
    get id() { return this.getAttribute('id') || ''; }
    set id(v) { this.setAttribute('id', String(v ?? '')); }
    get className() { return this.getAttribute('class') || ''; }
    set className(v) { this.setAttribute('class', String(v ?? '')); }
    get hidden() { return this.hasAttribute('hidden'); }
    set hidden(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(v) { if (v) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
    get href() { return this.getAttribute('href') || ''; }
    set href(v) { this.setAttribute('href', String(v ?? '')); }
    get src() { return this.getAttribute('src') || ''; }
    set src(v) { this.setAttribute('src', String(v ?? '')); }
    get title() { return this.getAttribute('title') || ''; }
    set title(v) { this.setAttribute('title', String(v ?? '')); }
    get type() { return this.getAttribute('type') || ''; }
    set type(v) { this.setAttribute('type', String(v ?? '')); }
    get name() { return this.getAttribute('name') || ''; }
    set name(v) { this.setAttribute('name', String(v ?? '')); }
    get value() {
      if (this._value !== undefined) return this._value;
      if (this.tagName === 'SELECT') {
        const opt = this.options.find((o) => o.selected) || this.options[0];
        return opt ? opt.value : '';
      }
      if (this.tagName === 'OPTION') {
        return this.hasAttribute('value') ? this.getAttribute('value') : this.textContent;
      }
      return this.getAttribute('value') || '';
    }
    set value(v) { this._value = String(v ?? ''); if (this.tagName === 'INPUT' || this.tagName === 'OPTION') this.setAttribute('value', this._value); }
    get options() { return this.querySelectorAll('option'); }
    get selectedIndex() { const opts = this.options; const idx = opts.findIndex((o) => o.selected || o.value === this.value); return idx >= 0 ? idx : 0; }
    get selected() { return !!this._selected || this.hasAttribute('selected'); }
    set selected(v) { this._selected = !!v; if (v) this.setAttribute('selected', ''); else this.removeAttribute('selected'); }
    get checked() { return !!this._checked || this.hasAttribute('checked'); }
    set checked(v) { this._checked = !!v; if (v) this.setAttribute('checked', ''); else this.removeAttribute('checked'); }
    get textContent() { return this.childNodes.map((c) => (c.nodeType === 3 ? c.data : c.textContent)).join(''); }
    set textContent(v) { this.childNodes = []; if (v != null && String(v) !== '') this.appendChild(new DomText(String(v), this.ownerDocument)); }
    get innerText() { return this.textContent; }
    set innerText(v) { this.textContent = v; }
    get innerHTML() { return this.childNodes.map(serializeNode).join(''); }
    set innerHTML(html) { this.childNodes = []; parseHtmlIntoParent(String(html ?? ''), this, this.ownerDocument); }
    get outerHTML() { return serializeNode(this); }
    matches(sel) { return matchComplexSelector(this, sel); }
    closest(sel) { let c = this; while (c && c.nodeType === 1) { if (matchComplexSelector(c, sel)) return c; c = c.parentNode; } return null; }
    querySelectorAll(sel) {
      const out = [];
      (function walk(n) {
        for (const c of n.childNodes) {
          if (c.nodeType === 1) { if (matchComplexSelector(c, sel)) out.push(c); walk(c); }
        }
      })(this);
      return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
    getElementsByTagName(tag) { return this.querySelectorAll(String(tag) === '*' ? '*' : tag); }
    getBoundingClientRect() { return { top: 0, left: 0, right: 900, bottom: 600, width: 900, height: 600, x: 0, y: 0 }; }
    getBBox() { return { x: 0, y: 0, width: 900, height: 500 }; }
    getScreenCTM() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) }; }
    scrollIntoView() {}
    focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
    blur() {}
    select() {}
    click() { if (!this.disabled) this.dispatchEvent({ type: 'click', bubbles: true, cancelable: true, button: 0 }); }
    cloneNode(deep) {
      const clone = new DomElement(this.tagName, this.ownerDocument, this.namespaceURI);
      for (const [k, v] of this._attrs.entries()) clone._attrs.set(k, v);
      if (deep) for (const c of this.childNodes) clone.appendChild(c.cloneNode(true));
      return clone;
    }
  }

  function serializeNode(node) {
    if (node.nodeType === 3) return escapeHtmlText(node.data);
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    let attrStr = '';
    for (const [k, v] of node._attrs.entries()) attrStr += v === '' ? ` ${k}` : ` ${k}="${escapeAttr(v)}"`;
    if (VOID_TAGS.has(tag)) return `<${tag}${attrStr}>`;
    return `<${tag}${attrStr}>${node.childNodes.map(serializeNode).join('')}</${tag}>`;
  }

  function parseHtmlIntoParent(html, parent, doc) {
    const cleaned = String(html).replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const stack = [parent];
    const tokenRx = /(<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s+[^<>]*?)?\s*\/?>)|([^<]+)/g;
    let m;
    while ((m = tokenRx.exec(cleaned)) !== null) {
      const curParent = stack[stack.length - 1];
      if (m[2] !== undefined) {
        if (m[2]) curParent.appendChild(new DomText(decodeEntities(m[2]), doc));
        continue;
      }
      const tagToken = m[1];
      if (tagToken.startsWith('</')) {
        const closeTag = tagToken.slice(2, -1).trim().toLowerCase();
        for (let k = stack.length - 1; k >= 1; k--) {
          if (stack[k].tagName.toLowerCase() === closeTag) { stack.length = k; break; }
        }
        continue;
      }
      const selfClosing = tagToken.endsWith('/>');
      const inner = tagToken.slice(1, selfClosing ? -2 : -1).trim();
      const sp = inner.search(/\s/);
      const tagName = (sp === -1 ? inner : inner.slice(0, sp)).toLowerCase();
      const rawAttrs = sp === -1 ? '' : inner.slice(sp + 1);
      const ns = (tagName === 'svg' || curParent.namespaceURI === 'http://www.w3.org/2000/svg')
        ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml';
      const el = new DomElement(tagName, doc, ns);
      for (const [k, v] of parseAttributes(rawAttrs).entries()) el.setAttribute(k, v);
      curParent.appendChild(el);
      if (!selfClosing && !VOID_TAGS.has(tagName)) stack.push(el);
    }
  }

  const doc = new DomNode(9, null);
  doc.ownerDocument = doc;
  doc.nodeName = '#document';
  doc.readyState = 'complete';
  doc.visibilityState = 'visible';
  doc.hidden = false;
  doc.title = '';
  doc.defaultView = null;

  const htmlEl = new DomElement('html', doc);
  const headEl = new DomElement('head', doc);
  const bodyEl = new DomElement('body', doc);
  htmlEl.appendChild(headEl);
  htmlEl.appendChild(bodyEl);
  doc.appendChild(htmlEl);
  doc.documentElement = htmlEl;
  doc.head = headEl;
  doc.body = bodyEl;
  doc.activeElement = bodyEl;

  const headMatch = htmlString.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  if (headMatch) parseHtmlIntoParent(headMatch[1], headEl, doc);
  const bodyMatch = htmlString.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) parseHtmlIntoParent(bodyMatch[1], bodyEl, doc);

  doc.createElement = (tag) => new DomElement(tag, doc);
  doc.createElementNS = (ns, tag) => new DomElement(tag, doc, ns);
  doc.createTextNode = (txt) => new DomText(txt, doc);
  doc.createDocumentFragment = () => new DomFragment(doc);
  doc.querySelectorAll = (sel) => htmlEl.querySelectorAll(sel);
  doc.querySelector = (sel) => htmlEl.querySelector(sel);
  doc.getElementById = (id) => {
    const s = String(id || '');
    let found = null;
    (function walk(node) {
      if (found) return;
      for (const c of node.childNodes) {
        if (c.nodeType === 1) {
          if (c.getAttribute('id') === s) { found = c; return; }
          walk(c);
          if (found) return;
        }
      }
    })(htmlEl);
    return found;
  };
  return { document: doc };
}

async function bootAppInVm(fetchRouter) {
  const { document } = createDomFromHtml(INDEX_HTML);
  const mem = new Map();
  const storage = {
    get length() { return mem.size; },
    getItem(k) { return mem.has(String(k)) ? mem.get(String(k)) : null; },
    setItem(k, v) { mem.set(String(k), String(v)); },
    removeItem(k) { mem.delete(String(k)); },
    clear() { mem.clear(); },
  };
  let currentUrl = new URL('https://www.rodandoomundo.com.br/');
  const pageErrors = [];
  const fetchCalls = [];
  const inFlight = new Set();
  const timers = new Set();

  const sandbox = {
    innerWidth: 1280,
    innerHeight: 800,
    scrollY: 0,
    pageYOffset: 0,
    location: {
      get href() { return currentUrl.href; },
      set href(v) { currentUrl = new URL(String(v), currentUrl.origin); },
      get origin() { return currentUrl.origin; },
      get protocol() { return currentUrl.protocol; },
      get host() { return currentUrl.host; },
      get hostname() { return currentUrl.hostname; },
      get pathname() { return currentUrl.pathname; },
      get search() { return currentUrl.search; },
      get hash() { return currentUrl.hash; },
      assign(v) { currentUrl = new URL(String(v), currentUrl.origin); },
      replace(v) { currentUrl = new URL(String(v), currentUrl.origin); },
    },
    history: {
      state: null,
      pushState(_st, _t, u) { if (u) currentUrl = new URL(String(u), currentUrl.origin); },
      replaceState(_st, _t, u) { if (u) currentUrl = new URL(String(u), currentUrl.origin); },
      back() {},
    },
    localStorage: storage,
    sessionStorage: storage,
    document,
    navigator: { userAgent: 'NodeVM/26', platform: 'Win32', language: 'pt-BR', languages: ['pt-BR'] },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    getSelection: () => ({ rangeCount: 0, isCollapsed: true }),
    scrollTo() {},
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
    Date,
    URL,
    URLSearchParams,
    Headers,
    Request,
    Response,
    AbortController,
    Intl,
    setTimeout(fn, ms = 0, ...args) {
      if ((Number(ms) || 0) > 500) return 0;
      const id = setTimeout(() => { timers.delete(id); try { fn(...args); } catch (e) { pageErrors.push(e); } }, Number(ms) || 0);
      if (typeof id.unref === 'function') id.unref();
      timers.add(id);
      return id;
    },
    clearTimeout(id) { clearTimeout(id); timers.delete(id); },
    setInterval() { return 0; },
    clearInterval() {},
    console: { log() {}, info() {}, warn() {}, error() {} },
  };
  document.defaultView = sandbox;

  let vmContext = null;
  sandbox.fetch = function trackedFetch(input, init = {}) {
    const rawUrl = typeof input === 'string' ? input : input.url;
    const resolved = new URL(rawUrl, currentUrl.origin).toString();
    let parsedBody = null;
    if (init && init.body) {
      try { parsedBody = JSON.parse(String(init.body)); } catch { parsedBody = String(init.body); }
    }
    fetchCalls.push({ url: rawUrl, resolved, method: (init.method || 'GET').toUpperCase(), body: parsedBody });
    const p = Promise.resolve(fetchRouter(resolved, init, parsedBody)).then(async (realRes) => {
      const text = await realRes.text();
      return {
        ok: realRes.ok,
        status: realRes.status,
        headers: new Headers(realRes.headers),
        async text() { return text; },
        async json() { return vm.runInContext('JSON.parse(' + JSON.stringify(text) + ')', vmContext); },
      };
    });
    inFlight.add(p);
    p.finally(() => inFlight.delete(p));
    return p;
  };

  vmContext = vm.createContext(sandbox);
  vmContext.window = vmContext;
  vmContext.self = vmContext;
  vmContext.global = vmContext;
  vmContext.globalThis = vmContext;

  PRECOMPILED_SCRIPTS.d3.runInContext(vmContext);
  PRECOMPILED_SCRIPTS.topojson.runInContext(vmContext);
  PRECOMPILED_SCRIPTS.world.runInContext(vmContext);
  PRECOMPILED_SCRIPTS.data.runInContext(vmContext);
  PRECOMPILED_SCRIPTS.editorial.runInContext(vmContext);
  PRECOMPILED_SCRIPTS.app.runInContext(vmContext);

  async function settle() {
    for (let i = 0; i < 8; i++) {
      if (inFlight.size) await Promise.allSettled(Array.from(inFlight));
      for (let t = 0; t < 4; t++) await new Promise((r) => setImmediate(r));
      if (!inFlight.size) break;
    }
  }

  await settle();
  return {
    window: vmContext,
    document,
    fetchCalls,
    pageErrors,
    settle,
    cleanup() {
      for (const id of timers) clearTimeout(id);
      timers.clear();
    },
  };
}

// ============================================================================
// SUÍTE DE TESTES: BUG-COMPARE-COBERTURA & BUSCA UNIVERSAL MULTILÍNGUE
// ============================================================================
describe('BUG-COMPARE-COBERTURA — Comparar cobertura & Busca Universal', () => {
  test('1. noticias-quentes.js extrai termoBusca factual curto sem nome do país e sem perder entidades legítimas', async () => {
    const nowIso = new Date().toISOString();
    activeFetchHandler = async (input) => {
      const u = new URL(typeof input === 'string' ? input : input.url);
      if (u.pathname === '/v1/noticias-quentes') {
        return createJsonResponse({
          ok: true,
          updatedAt: nowIso,
          noticias_quentes: [
            {
              slug: 'pib-chile-queda-2020',
              titulo_curto: 'PIB do Chile registra maior queda desde 2020 e Banco Central aponta recuperação lenta',
              resumo_pulso: 'Produto Interno Bruto caiu 1,8% no terceiro trimestre.',
              categoria: 'Economia',
              paises_envolvidos: ['CL'],
              palavras_chave: ['Chile', 'PIB', 'Banco Central', 'Rosanna Costa'],
              fontes_urls: ['https://www.infomoney.com.br/mercados/pib-chile'],
              veiculos_origem: ['InfoMoney Mercados'],
              urgencia_score: 92,
              data_publicacao: nowIso,
              updated_at: nowIso,
            },
            {
              slug: 'lula-petrobras-investimento',
              titulo_curto: 'Lula anuncia plano da Petrobras para refino no país',
              resumo_pulso: 'Anúncio ocorre após reunião ministerial.',
              categoria: 'Politica',
              paises_envolvidos: ['BR'],
              palavras_chave: ['Brasil', 'Lula', 'Petrobras'],
              fontes_urls: ['https://g1.globo.com/politica/noticia'],
              veiculos_origem: ['G1'],
              urgencia_score: 88,
              data_publicacao: nowIso,
              updated_at: nowIso,
            },
            {
              slug: 'faa-voos-eua',
              titulo_curto: 'FAA suspende voos nos EUA por falha de comunicação',
              resumo_pulso: 'Paralisação afeta aeroportos.',
              categoria: 'Geopolitica_Radar',
              paises_envolvidos: ['US'],
              palavras_chave: ['EUA', 'Estados Unidos'],
              fontes_urls: ['https://reuters.com/faa-outage'],
              veiculos_origem: ['Reuters'],
              urgencia_score: 90,
              data_publicacao: nowIso,
              updated_at: nowIso,
            },
          ],
        });
      }
      if (u.pathname === '/v1/atlas/pulso-continental') {
        return createJsonResponse({ paises_ativos: [] });
      }
      return createJsonResponse({});
    };

    const env = { CURADORIA_BACKEND_URL: 'https://backend.example.test' };
    const resp = await apiNoticiasQuentes.onRequestGet({
      request: new Request('https://www.rodandoomundo.com.br/api/noticias-quentes?_t=' + Date.now()),
      env,
    });
    assert.equal(resp.status, 200);
    const data = await resp.json();

    const byA2 = Object.fromEntries((data.paises_em_alta || []).map((p) => [p.a2, p]));

    // Chile
    assert.ok(byA2.CL, 'paises_em_alta deve conter CL');
    assert.notEqual(byA2.CL.termoBusca.toLowerCase(), 'chile', 'termoBusca do CL NÃO pode ser "Chile"');
    assert.ok(byA2.CL.termoBusca.includes('PIB'), `termoBusca do CL deve conter PIB, recebido: ${byA2.CL.termoBusca}`);
    assert.ok(byA2.CL.termoBusca.split(/\s+/).length <= 3, `termoBusca do CL deve ter <= 3 palavras: ${byA2.CL.termoBusca}`);
    assert.deepEqual(byA2.CL.palavras_chave, ['Chile', 'PIB', 'Banco Central', 'Rosanna Costa']);

    // Brasil: NÃO pode descartar Lula / Petrobras por causa de regex de sufixo
    assert.ok(byA2.BR, 'paises_em_alta deve conter BR');
    assert.ok(byA2.BR.termoBusca.includes('Lula') && byA2.BR.termoBusca.includes('Petrobras'), `Não deve descartar Lula/Petrobras: ${byA2.BR.termoBusca}`);

    // EUA: fallback pelo título quando keywords só têm nomes do país
    assert.ok(byA2.US, 'paises_em_alta deve conter US');
    assert.ok(byA2.US.termoBusca.includes('FAA'), `termoBusca do US deve extrair FAA do título: ${byA2.US.termoBusca}`);
    assert.ok(!/\bEUA\b/i.test(byA2.US.termoBusca), `termoBusca do US não deve incluir EUA: ${byA2.US.termoBusca}`);
  });

  test('2. busca-assunto.js — Chile (es): desacopla "do Chile", casa <source url> do Google News e aceita sigla PIB', async () => {
    const rssCalls = [];
    const recentPub = new Date(Date.now() - 2 * 3600_000).toUTCString();

    activeFetchHandler = async (input) => {
      const urlStr = typeof input === 'string' ? input : input.url;
      const u = new URL(urlStr);

      if (u.hostname === 'clients5.google.com') {
        const q = u.searchParams.get('q') || '';
        return createJsonResponse([[q]]);
      }

      if (u.hostname === 'news.google.com' || u.hostname === 'www.bing.com') {
        rssCalls.push(urlStr);
        const qParam = decodeURIComponent(u.searchParams.get('q') || '');
        // Só retorna a notícia chilena se a query NÃO tiver "do Chile" e se tiver "PIB"
        if (u.hostname === 'news.google.com' && qParam.includes('PIB') && !/\bchile\b/i.test(qParam)) {
          return createRssResponse([
            {
              title: 'PIB cae 1,8% en tercer trimestre y Banco Central advierte lenta recuperación - La Tercera',
              link: 'https://news.google.com/rss/articles/CBMi-cl-pib-1?oc=5',
              source: 'La Tercera',
              sourceUrl: 'https://www.latercera.com',
              pubDate: recentPub,
            },
          ]);
        }
        return createRssResponse([]);
      }
      return createJsonResponse({});
    };

    const req = new Request('https://www.rodandoomundo.com.br/api/busca-assunto?_t=' + Date.now(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: 'PIB do Chile',
        country: 'CL',
        countryName: 'Chile',
        lang: 'es',
        periodo: '7d',
        outlets: [{ n: 'La Tercera', u: 'https://www.latercera.com', d: 'latercera.com', b: 'D', pais: 'CL' }],
      }),
    });

    const resp = await apiBuscaAssunto.onRequestPost({ request: req });
    assert.equal(resp.status, 200);
    const data = await resp.json();

    assert.ok(rssCalls.some((c) => !/chile/i.test(new URL(c).searchParams.get('q') || '')), 'Query RSS deve desacoplar "do Chile"');
    assert.ok(data.grupos.length >= 1, `Esperado >= 1 grupo para "PIB do Chile", obtido ${data.grupos.length}`);
    assert.equal(data.grupos[0].veiculo, 'La Tercera');
    assert.ok(data.grupos[0].artigos[0].titulo.includes('PIB cae 1,8%'));
  });

  test('3. busca-assunto.js — Multilíngue universal: Japão (ja), Alemanha (de) e Egito (ar)', async () => {
    const recentPub = new Date(Date.now() - 2 * 3600_000).toUTCString();

    activeFetchHandler = async (input) => {
      const urlStr = typeof input === 'string' ? input : input.url;
      const u = new URL(urlStr);

      if (u.hostname === 'clients5.google.com') {
        const q = u.searchParams.get('q') || '';
        const tl = u.searchParams.get('tl') || 'en';
        if (tl === 'ja' && /infla/i.test(q)) return createJsonResponse([['インフレ']]);
        if (tl === 'ar' && /infla/i.test(q)) return createJsonResponse([['التضخم']]);
        return createJsonResponse([[q]]);
      }

      if (u.hostname === 'news.google.com') {
        const qParam = u.searchParams.get('q') || '';
        if (qParam.includes('インフレ') && qParam.includes('asahi.com')) {
          return createRssResponse([
            {
              title: '日本のインフレ率が3%上昇',
              link: 'https://www.asahi.com/articles/jp-1.html',
              source: 'Asahi Shimbun',
              sourceUrl: 'https://www.asahi.com',
              pubDate: recentPub,
            },
          ]);
        }
        if (qParam.includes('BIP') && qParam.includes('spiegel.de')) {
          return createRssResponse([
            {
              title: 'BIP schrumpft überraschend im dritten Quartal',
              link: 'https://www.spiegel.de/wirtschaft/de-1.html',
              source: 'Der Spiegel',
              sourceUrl: 'https://www.spiegel.de',
              pubDate: recentPub,
            },
          ]);
        }
        if (qParam.includes('التضخم') && qParam.includes('ahram.org.eg')) {
          return createRssResponse([
            {
              title: 'ارتفاع التضخم في السوق المحلية',
              link: 'https://english.ahram.org.eg/News/eg-1.aspx',
              source: 'Al-Ahram',
              sourceUrl: 'https://ahram.org.eg',
              pubDate: recentPub,
            },
          ]);
        }
      }
      return createRssResponse([]);
    };

    // Japão (ja)
    const respJp = await apiBuscaAssunto.onRequestPost({
      request: new Request('https://www.rodandoomundo.com.br/api/busca-assunto?_t=' + (Date.now() + 1), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: 'inflação no Japão',
          country: 'JP',
          countryName: 'Japão',
          lang: 'ja',
          periodo: '7d',
          outlets: [{ n: 'Asahi Shimbun', u: 'https://www.asahi.com', d: 'asahi.com', b: 'I', pais: 'JP' }],
        }),
      }),
    });
    const dataJp = await respJp.json();
    assert.ok(dataJp.grupos.length >= 1, 'Japão (ja) deve retornar artigos em script CJK');
    assert.equal(dataJp.grupos[0].artigos[0].titulo, '日本のインフレ率が3%上昇');

    // Alemanha (de)
    const respDe = await apiBuscaAssunto.onRequestPost({
      request: new Request('https://www.rodandoomundo.com.br/api/busca-assunto?_t=' + (Date.now() + 2), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: 'PIB na Alemanha',
          country: 'DE',
          countryName: 'Alemanha',
          lang: 'de',
          periodo: '7d',
          outlets: [{ n: 'Der Spiegel', u: 'https://www.spiegel.de', d: 'spiegel.de', b: 'E', pais: 'DE' }],
        }),
      }),
    });
    const dataDe = await respDe.json();
    assert.ok(dataDe.grupos.length >= 1, 'Alemanha (de) deve traduzir PIB -> BIP e retornar artigos');
    assert.ok(dataDe.grupos[0].artigos[0].titulo.includes('BIP schrumpft'));

    // Egito (ar)
    const respEg = await apiBuscaAssunto.onRequestPost({
      request: new Request('https://www.rodandoomundo.com.br/api/busca-assunto?_t=' + (Date.now() + 3), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: 'inflação no Egito',
          country: 'EG',
          countryName: 'Egito',
          lang: 'ar',
          periodo: '7d',
          outlets: [{ n: 'Al-Ahram', u: 'https://ahram.org.eg', d: 'ahram.org.eg', b: 'I', pais: 'EG' }],
        }),
      }),
    });
    const dataEg = await respEg.json();
    assert.ok(dataEg.grupos.length >= 1, 'Egito (ar) deve preservar script árabe e retornar artigos');
    assert.equal(dataEg.grupos[0].artigos[0].titulo, 'ارتفاع التضخم في السوق المحلية');
  });

  test('4. busca-assunto.js — Proteções de fronteira: país isolado não esvazia termo e sigla "IA" não dá falso match em "Economia"', async () => {
    const recentPub = new Date(Date.now() - 2 * 3600_000).toUTCString();
    const seenGoogleQueries = [];

    activeFetchHandler = async (input) => {
      const urlStr = typeof input === 'string' ? input : input.url;
      const u = new URL(urlStr);
      if (u.hostname === 'clients5.google.com') return createJsonResponse([[u.searchParams.get('q') || '']]);
      if (u.hostname === 'news.google.com') {
        const qp = u.searchParams.get('q') || '';
        seenGoogleQueries.push(qp);
        if (qp.includes('Chile') && qp.includes('latercera.com')) {
          return createRssResponse([
            { title: 'Chile avanza en acuerdo comercial', link: 'https://www.latercera.com/cl-1', source: 'La Tercera', pubDate: recentPub },
          ]);
        }
        if (qp.startsWith('IA ') && qp.includes('g1.globo.com')) {
          return createRssResponse([
            { title: 'Economia cresce no trimestre', link: 'https://g1.globo.com/eco-1', source: 'G1', pubDate: recentPub },
            { title: 'Regulação de IA avança no Senado', link: 'https://g1.globo.com/tec-1', source: 'G1', pubDate: recentPub },
          ]);
        }
      }
      return createRssResponse([]);
    };

    // 4a. Busca explícita apenas por "Chile"
    const rChile = await apiBuscaAssunto.onRequestPost({
      request: new Request('https://www.rodandoomundo.com.br/api/busca-assunto?_t=' + (Date.now() + 10), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: 'Chile',
          country: 'CL',
          countryName: 'Chile',
          lang: 'es',
          periodo: '7d',
          outlets: [{ n: 'La Tercera', u: 'https://www.latercera.com', d: 'latercera.com', b: 'D', pais: 'CL' }],
        }),
      }),
    });
    const dChile = await rChile.json();
    assert.ok(seenGoogleQueries.some((q) => q.includes('Chile')), 'Busca explícita apenas por "Chile" não pode esvaziar o termo');
    assert.ok(dChile.grupos.length >= 1);

    // 4b. Sigla "IA" exige palavra inteira e rejeita "Economia"
    const rIa = await apiBuscaAssunto.onRequestPost({
      request: new Request('https://www.rodandoomundo.com.br/api/busca-assunto?_t=' + (Date.now() + 11), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: 'IA',
          country: 'BR',
          countryName: 'Brasil',
          lang: 'pt',
          periodo: '7d',
          outlets: [{ n: 'g1', u: 'https://g1.globo.com', d: 'g1.globo.com', b: 'I', pais: 'BR' }],
        }),
      }),
    });
    const dIa = await rIa.json();
    assert.equal(dIa.grupos.length, 1);
    const titulosIa = dIa.grupos[0].artigos.map((a) => a.titulo);
    assert.ok(titulosIa.includes('Regulação de IA avança no Senado'), 'Deve aceitar "IA" como palavra inteira');
    assert.ok(!titulosIa.includes('Economia cresce no trimestre'), 'NÃO pode casar "ia" dentro de "Economia"');
  });

  test('5. Frontend (app.js) — Botão "Comparar cobertura" exibe apenas "Comparando cobertura…" no loading e nunca faz fallback para "Chile"', async () => {
    const nowIso = new Date().toISOString();
    const buscaPayloads = [];
    let pendingResolve = null;
    let captureCompareSearch = false;

    const app = await bootAppInVm((resolvedUrl, _init, parsedBody) => {
      const u = new URL(resolvedUrl);
      if (u.pathname === '/api/noticias-quentes') {
        return createJsonResponse({
          ok: true,
          identificacao_editorial: 'Síntese Rodando o Mundo · V2',
          atualizado_em: 'Atualizado agora',
          updatedAt: nowIso,
          paises_em_alta: [
            {
              a2: 'CL',
              countryName: 'Chile',
              title: 'PIB do Chile registra maior queda desde 2020 e Banco Central aponta recuperação lenta',
              source: 'Síntese Rodando o Mundo · V2',
              category: 'Radar',
              url: '',
              fontes_urls: [],
              palavras_chave: ['Chile', 'PIB', 'Banco Central'],
              termoBusca: 'Chile', // simula backend desatualizado enviando "Chile"
              summary: 'Segundo reportagem do InfoMoney Mercados, o PIB caiu 1,8%.',
              urgencia_score: 90,
              data_publicacao: nowIso,
              updated_at: nowIso,
            },
          ],
          noticias_quentes: [],
        });
      }
      if (u.pathname === '/api/vitrine-em-alta') {
        return createJsonResponse({ ok: true, temas_ativos: [], updatedAt: nowIso });
      }
      if (u.pathname === '/api/radar') {
        return createJsonResponse({ ok: true, items: [], atualizado_em: 'Agora' });
      }
      if (u.pathname === '/api/resumo') {
        return createJsonResponse({ ok: true, items: [], atualizadoEm: nowIso });
      }
      if (u.pathname === '/api/atlas-pais') {
        return createJsonResponse({ ok: true, items: [], country: 'CL' });
      }
      if (u.pathname === '/v2/sugestoes-contextuais') {
        return createJsonResponse({ ok: true, sugestoes: [] });
      }
      if (u.pathname === '/api/busca-assunto') {
        if (!captureCompareSearch || u.searchParams.get('mode') === 'trending' || (parsedBody && parsedBody.isEnrich)) {
          return createJsonResponse({ ok: true, termo: (parsedBody && parsedBody.q) || '', periodo: '24h', grupos: [], resultados: [], totalArtigos: 0, topicosEmAlta: [] });
        }
        buscaPayloads.push(parsedBody);
        if (buscaPayloads.length === 1) {
          return new Promise((resolve) => {
            pendingResolve = resolve;
          });
        }
        return createJsonResponse({
          ok: true,
          termo: parsedBody ? parsedBody.q : '',
          periodo: 'all',
          grupos: [],
          resultados: [],
          totalArtigos: 0,
        });
      }
      return createJsonResponse({});
    });

    try {
      app.window.selecionarPais('CL');
      await app.settle();

      const compareBtn = app.document.querySelector('[data-hot-compare-term]');
      assert.ok(compareBtn, 'Botão "Comparar cobertura" deve existir no painel do Chile');

      const hotTerm = compareBtn.getAttribute('data-hot-compare-term') || '';
      assert.notEqual(hotTerm.toLowerCase(), 'chile', `data-hot-compare-term NÃO pode ser "Chile" (recebido "${hotTerm}")`);
      assert.ok(hotTerm.includes('PIB'), `data-hot-compare-term deve conter PIB (recebido "${hotTerm}")`);
      assert.ok(hotTerm.split(/\s+/).length <= 3, `data-hot-compare-term deve ter <= 3 palavras (recebido "${hotTerm}")`);

      // Dispara o clique e inspeciona imediatamente o estado de loading
      captureCompareSearch = true;
      compareBtn.click();
      await new Promise((r) => setImmediate(r));

      const resultsBox = app.document.getElementById('topic-search-results');
      const searchForm = app.document.getElementById('topic-search-form');
      assert.ok(resultsBox, '#topic-search-results deve existir');
      assert.ok(resultsBox.textContent.includes('Comparando cobertura…'), `Durante loading deve exibir "Comparando cobertura…", obtido: ${resultsBox.textContent}`);
      assert.ok(!resultsBox.textContent.includes('Buscando matérias sobre'), 'Não deve exibir texto antigo "Buscando matérias sobre"');
      assert.ok(!resultsBox.querySelector('.perspective-dynamic-banner'), 'Não deve exibir dynBanner durante o loading');
      assert.ok(searchForm && searchForm.hidden, '#topic-search-form deve permanecer recolhido ao clicar em Comparar cobertura');

      // Libera a Promise pendente e deixa os retries concluírem com 0 resultados
      assert.ok(pendingResolve, 'Primeira chamada a /api/busca-assunto deve estar pendente');
      pendingResolve(createJsonResponse({
        ok: true,
        termo: hotTerm,
        periodo: '7d',
        grupos: [],
        resultados: [],
        totalArtigos: 0,
      }));
      await app.settle();

      assert.ok(buscaPayloads.length >= 1, 'Deve ter enviado ao menos 1 busca para /api/busca-assunto');
      assert.ok(
        buscaPayloads.every((p) => p && String(p.q || '').trim().toLowerCase() !== 'chile'),
        `Nenhuma requisição a /api/busca-assunto pode fazer fallback para "Chile": ${JSON.stringify(buscaPayloads.map((p) => p && p.q))}`
      );
      assert.ok(
        resultsBox.textContent.includes('Todo o período'),
        `Quando finalizar em periodo=all, o banner deve exibir "Todo o período", obtido: ${resultsBox.textContent}`
      );

      const dynTitle = app.document.getElementById('perspective-dynamic-title');
      assert.ok(dynTitle, '#perspective-dynamic-title deve existir');
      assert.equal(dynTitle.textContent.trim(), 'Como os veículos estão cobrindo', 'Título do banner dinâmico NÃO deve vazar o termo buscado internamente');
      assert.ok(!resultsBox.textContent.includes('sobre “PIB”'), 'Estado vazio não deve vazar termo interno');

      const topicInput = app.document.getElementById('topic-search-input');
      assert.equal(topicInput ? topicInput.value : '', '', 'Input de pesquisa deve permanecer limpo/interno');

      assert.equal(app.pageErrors.length, 0, `Sem erros de runtime na VM: ${app.pageErrors.map(String).join('; ')}`);
    } finally {
      app.cleanup();
    }
  });

  test('6. Frontend (app.js) — Quando há matérias encontradas via "Comparar cobertura", oculta o termo do título e do resumo', async () => {
    const nowIso = new Date().toISOString();

    const app = await bootAppInVm((resolvedUrl, _init, parsedBody) => {
      const u = new URL(resolvedUrl);

      if (u.pathname === '/api/noticias-quentes') {
        return createJsonResponse({
          ok: true,
          identificacao_editorial: 'Síntese Rodando o Mundo · V2',
          atualizado_em: 'Atualizado agora',
          updatedAt: nowIso,
          paises_em_alta: [
            {
              a2: 'CL',
              countryName: 'Chile',
              title: 'PIB do Chile registra maior queda desde 2020 e Banco Central aponta recuperação lenta',
              termoBusca: 'PIB',
              summary: 'Segundo reportagem, o PIB caiu.',
              urgencia_score: 90,
              data_publicacao: nowIso,
              updated_at: nowIso,
            },
          ],
          noticias_quentes: [],
        });
      }
      if (u.pathname === '/api/vitrine-em-alta') {
        return createJsonResponse({ ok: true, temas_ativos: [], updatedAt: nowIso });
      }
      if (u.pathname === '/api/radar') {
        return createJsonResponse({ ok: true, items: [], atualizado_em: 'Agora' });
      }
      if (u.pathname === '/api/resumo') {
        return createJsonResponse({ ok: true, items: [], atualizadoEm: nowIso });
      }
      if (u.pathname === '/api/atlas-pais') {
        return createJsonResponse({ ok: true, items: [], country: 'CL' });
      }
      if (u.pathname === '/v2/sugestoes-contextuais') {
        return createJsonResponse({ ok: true, sugestoes: [] });
      }
      if (u.pathname === '/api/busca-assunto') {
        return createJsonResponse({
          ok: true,
          termo: 'PIB',
          periodo: '7d',
          grupos: [
            {
              veiculo: 'Radio Cooperativa',
              urlVeiculo: 'https://cooperativa.cl',
              dominio: 'cooperativa.cl',
              artigos: [
                {
                  titulo: 'Economía: PIB cae 1,8% en tercer trimestre',
                  link: 'https://cooperativa.cl/noticia-1',
                  pubDate: nowIso,
                  score: 10,
                },
              ],
            },
          ],
          resultados: [],
          totalArtigos: 1,
        });
      }
      return createJsonResponse({ ok: true });
    });

    try {
      app.window.selecionarPais('CL');
      await app.settle();

      const compareBtn = app.document.querySelector('[data-hot-compare-term]');
      assert.ok(compareBtn, 'Botão Comparar cobertura deve existir');
      compareBtn.click();
      await app.settle();

      const dynTitle = app.document.getElementById('perspective-dynamic-title');
      assert.ok(dynTitle, '#perspective-dynamic-title deve existir');
      assert.equal(dynTitle.textContent.trim(), 'Como os veículos estão cobrindo', 'Título do banner deve ser "Como os veículos estão cobrindo" sem expor o termo interno');

      const summaryEl = app.document.querySelector('.topic-search-summary');
      assert.ok(summaryEl, '.topic-search-summary deve existir');
      assert.ok(summaryEl.textContent.includes('Resultados em Chile'), `Resumo deve conter "Resultados em Chile", recebido: ${summaryEl.textContent}`);
      assert.ok(!summaryEl.textContent.includes('para “PIB”') && !summaryEl.textContent.includes('para "PIB"'), `Resumo NÃO deve expor termo interno "para PIB", recebido: ${summaryEl.textContent}`);

      assert.equal(app.pageErrors.length, 0, `Sem erros de runtime na VM: ${app.pageErrors.map(String).join('; ')}`);
    } finally {
      app.cleanup();
    }
  });
});
