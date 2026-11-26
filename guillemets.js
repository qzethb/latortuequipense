/* Guillemets français dans les champs de rédaction de l'administration.
 * - À la frappe, " (ou les guillemets anglais produits par le clavier) devient « ou » selon le contexte,
 *   accompagné d'une espace insécable.
 * - Après un collage ou un glisser-déposer, les guillemets droits ou anglais du texte
 *   inséré sont convertis de la même façon.
 * Les champs techniques (slug, formule LaTeX, jeton, recherche…) ne sont pas concernés.
 */
(() => {
  "use strict";

  const NBSP = "\u00a0";
  const QUOTES = new Set(["\"", "\u201c", "\u201d", "\u201e", "\u201f"]);
  const SPACES = new Set([" ", NBSP, "\u202f", "\t"]);
  // Après ces caractères (ou en début de bloc), un guillemet est ouvrant.
  const OPENING_CONTEXT = /^$|[\s\u00a0\u202f([{\u2014\u2013\-/'\u2019«]$/;
  const BLOCK_TAGS = new Set([
    "P", "DIV", "LI", "UL", "OL", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6",
    "TD", "TH", "TR", "TABLE", "FIGURE", "FIGCAPTION", "SECTION", "ARTICLE", "PRE",
  ]);

  const isTextField = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    if (element.closest("[data-guillemets='non']")) return false;
    if (element instanceof HTMLTextAreaElement) return true;
    if (element instanceof HTMLInputElement) {
      if (element.type !== "text") return false;
      if (element.hasAttribute("pattern") || element.getAttribute("spellcheck") === "false") return false;
      return !/latex/i.test(element.id);
    }
    return false;
  };
  const editableRoot = (node) => {
    const element = node instanceof HTMLElement ? node : node?.parentElement;
    if (!element || element.closest("[data-guillemets='non']")) return null;
    let root = null;
    for (let current = element; current; current = current.parentElement) {
      const state = current.getAttribute("contenteditable");
      if (state === "false") return null;
      if (state === "" || state === "true") root = current;
    }
    return root;
  };

  // Un guillemet est ouvrant après une espace ou un début de bloc, sauf si un « reste ouvert.
  const isOpening = (before) => {
    const previous = before.slice(-1);
    if (!OPENING_CONTEXT.test(previous) || previous === "«") return false;
    const open = before.lastIndexOf("«");
    return open === -1 || before.lastIndexOf("»") > open;
  };

  /* Convertit une chaîne. `before` est le texte qui la précède dans le même bloc.
   * Renvoie le texte converti et la correspondance des positions (pour le curseur). */
  const convert = (text, before = "") => {
    let output = "";
    const map = new Array(text.length + 1);
    for (let index = 0; index < text.length; index += 1) {
      map[index] = output.length;
      const char = text[index];
      if (QUOTES.has(char)) {
        if (isOpening(before + output)) {
          output += `«${NBSP}`;
          while (SPACES.has(text[index + 1])) { index += 1; map[index] = output.length; }
          continue;
        }
        output = output.replace(/[ \u00a0\u202f\t]+$/, "");
        output += `${NBSP}»`;
        continue;
      }
      if (char === "«" && text[index + 1] === " ") {
        output += `«${NBSP}`;
        index += 1;
        map[index] = output.length;
        continue;
      }
      if (char === " " && text[index + 1] === "»") {
        output += NBSP;
        continue;
      }
      output += char;
    }
    map[text.length] = output.length;
    return { text: output, map };
  };

  /* ---------- Frappe ---------- */
  const typedQuote = (before) => {
    if (isOpening(before)) return { text: `«${NBSP}`, remove: 0 };
    const trailing = before.match(/[ \u00a0\u202f\t]+$/);
    return { text: `${NBSP}»`, remove: trailing ? trailing[0].length : 0 };
  };

  const textBeforeCaret = (root, range) => {
    const probe = document.createRange();
    probe.selectNodeContents(root);
    probe.setEnd(range.startContainer, range.startOffset);
    // Seul le bloc courant compte : on remonte jusqu'au dernier saut de bloc.
    const fragment = probe.cloneContents();
    const holder = document.createElement("div");
    holder.append(fragment);
    let text = "";
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) { text += node.nodeValue; return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.tagName === "BR" || BLOCK_TAGS.has(node.tagName)) text = "";
      node.childNodes.forEach(walk);
    };
    holder.childNodes.forEach(walk);
    return text;
  };

  document.addEventListener("beforeinput", (event) => {
    if (event.inputType !== "insertText" || !QUOTES.has(event.data) || event.isComposing) return;
    const target = event.target;

    if (isTextField(target)) {
      event.preventDefault();
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? start;
      const { text, remove } = typedQuote(target.value.slice(0, start));
      target.setRangeText(text, start - remove, end, "end");
      target.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    const root = editableRoot(target);
    if (!root) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer)) return;
    event.preventDefault();
    const { text, remove } = typedQuote(textBeforeCaret(root, range));
    if (remove && range.collapsed && range.startContainer.nodeType === Node.TEXT_NODE
      && range.startOffset >= remove) {
      range.setStart(range.startContainer, range.startOffset - remove);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    document.execCommand("insertText", false, text);
  }, true);

  /* ---------- Collage et dépôt ---------- */
  const normalizeField = (field) => {
    const caret = field.selectionEnd ?? field.value.length;
    const { text, map } = convert(field.value);
    if (text === field.value) return;
    field.value = text;
    const position = map[caret] ?? text.length;
    field.setSelectionRange(position, position);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const normalizeEditable = (root) => {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const caret = range && root.contains(range.endContainer)
      ? { node: range.endContainer, offset: range.endOffset } : null;
    let before = "";
    let changed = false;
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const original = node.nodeValue;
        const { text, map } = convert(original, before);
        if (text !== original) {
          node.nodeValue = text;
          changed = true;
          if (caret?.node === node) caret.offset = map[caret.offset] ?? text.length;
        }
        before += text;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.getAttribute("contenteditable") === "false") { before += "x"; return; }
      if (node.tagName === "BR" || BLOCK_TAGS.has(node.tagName)) before = "";
      node.childNodes.forEach(walk);
      if (BLOCK_TAGS.has(node.tagName)) before = "";
    };
    root.childNodes.forEach(walk);
    if (!changed) return;
    if (caret?.node.nodeType === Node.TEXT_NODE && root.contains(caret.node)) {
      const restored = document.createRange();
      restored.setStart(caret.node, Math.min(caret.offset, caret.node.nodeValue.length));
      restored.collapse(true);
      selection.removeAllRanges();
      selection.addRange(restored);
    }
    root.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const afterInsertion = (event) => {
    const target = event.target;
    // Laisse les gestionnaires de collage des pages insérer leur contenu nettoyé d'abord.
    setTimeout(() => {
      if (isTextField(target)) { normalizeField(target); return; }
      const root = editableRoot(target);
      if (root) normalizeEditable(root);
    }, 0);
  };
  document.addEventListener("paste", afterInsertion, true);
  document.addEventListener("drop", afterInsertion, true);
})();
