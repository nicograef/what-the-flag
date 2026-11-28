// A minimal stand-in for the design canvas runtime, so the prototypes in ../prototypes render
// in any browser. It supports what the prototypes use: {{holes}} (dotted lookups only),
// <sc-if value>, <sc-for list as>, on* event attributes bound to functions, and a
// `class Component extends DCLogic` with state, setState and lifecycle hooks.
// It is documentation tooling, not app code.

(function () {
  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  const WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

  function lookup(scope, path) {
    if (path === "true") return true;
    if (path === "false") return false;
    if (path === "null") return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^'.*'$|^".*"$/.test(path)) return path.slice(1, -1);
    let v = scope;
    for (const part of path.split(".")) {
      if (v == null) return undefined;
      v = v[part];
    }
    return v;
  }

  function interpolate(scope, text) {
    return text.replace(HOLE, (_, p) => {
      const v = lookup(scope, p);
      return v == null ? "" : String(v);
    });
  }

  function renderInto(tpl, scope, out) {
    for (const node of tpl.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        out.appendChild(document.createTextNode(interpolate(scope, node.nodeValue)));
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = node.localName;
      if (tag === "sc-if") {
        const m = (node.getAttribute("value") || "").match(WHOLE);
        if (m && lookup(scope, m[1])) renderInto(node, scope, out);
        continue;
      }
      if (tag === "sc-for") {
        const m = (node.getAttribute("list") || "").match(WHOLE);
        const list = (m && lookup(scope, m[1])) || [];
        const as = node.getAttribute("as") || "item";
        list.forEach((item, i) => {
          const inner = Object.create(scope);
          inner[as] = item;
          inner.$index = i;
          renderInto(node, inner, out);
        });
        continue;
      }
      const el = node.namespaceURI === "http://www.w3.org/1999/xhtml"
        ? document.createElement(tag)
        : document.createElementNS(node.namespaceURI, node.tagName);
      for (const attr of node.attributes) {
        if (attr.name.startsWith("hint-")) continue;
        const whole = attr.value.match(WHOLE);
        if (attr.name.startsWith("on")) {
          const fn = whole ? lookup(scope, whole[1]) : null;
          if (typeof fn === "function") el.addEventListener(attr.name.slice(2), fn);
          continue;
        }
        if (whole) {
          const v = lookup(scope, whole[1]);
          if (v === false || v == null) continue;
          el.setAttribute(attr.name, v === true ? "" : String(v));
        } else {
          el.setAttribute(attr.name, interpolate(scope, attr.value));
        }
      }
      renderInto(node, scope, el);
      out.appendChild(el);
    }
  }

  /** Renders the source of one .dc.html file into `mount`; returns the component instance. */
  window.renderDC = function renderDC(source, mount) {
    const doc = new DOMParser().parseFromString(source, "text/html");
    const xdc = doc.querySelector("x-dc");
    const helmet = xdc.querySelector("helmet");
    if (helmet) {
      for (const child of [...helmet.children]) document.head.appendChild(document.importNode(child, true));
      helmet.remove();
    }
    const lang = doc.documentElement.getAttribute("lang");
    if (lang) document.documentElement.setAttribute("lang", lang);
    const title = doc.querySelector("title");
    if (title) document.title = title.textContent;

    const tpl = document.createElement("template");
    tpl.innerHTML = xdc.innerHTML;

    const code = doc.querySelector("script[data-dc-script]").textContent;
    class DCLogic {
      constructor(props) {
        this.props = props || {};
        this.state = {};
      }
      setState(patch) {
        Object.assign(this.state, typeof patch === "function" ? patch(this.state) : patch);
        draw();
      }
      forceUpdate() {
        draw();
      }
    }
    const Component = new Function("DCLogic", code + "\nreturn Component;")(DCLogic);
    const instance = new Component({});
    function draw() {
      const frag = document.createDocumentFragment();
      renderInto(tpl.content, instance.renderVals() || {}, frag);
      mount.replaceChildren(frag);
    }
    draw();
    if (instance.componentDidMount) instance.componentDidMount();
    return instance;
  };
})();
