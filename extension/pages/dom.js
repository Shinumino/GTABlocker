// Building the add-on's own pages without innerHTML: every word is set as text, so nothing a
// page or a stored setting holds can ever become markup here (and Mozilla's linter, a gate in
// check.cmd, refuses innerHTML).
(function (root) {
  'use strict';
  const ns = (root.GtaBlocker = root.GtaBlocker || {});
  const SVG = 'http://www.w3.org/2000/svg';

  // el('button', { class: 'btn', 'data-act': 'x', onclick }, 'text', child, ...)
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs)) {
      if (value === false || value === null || value === undefined) continue;
      if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
      else node.setAttribute(name, value === true ? '' : String(value));
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  // The small line icons (24 x 24, drawn with the text colour).
  const ICONS = {
    bin: ['M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'],
    copy: ['M5 15V5a2 2 0 0 1 2-2h10', 'M11 9h9v11h-9z'],
  };
  function icon(name) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of ICONS[name]) {
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    return svg;
  }

  ns.dom = Object.freeze({ el, icon });
})(globalThis);
