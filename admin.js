(() => {
  "use strict";

  /* ======================================================================
     Configuration
     ====================================================================== */
  const OWNER = "qzethb";
  const REPOSITORY = "latortuequipense";
  const BRANCH = "main";
  const API_ROOT = `https://api.github.com/repos/${OWNER}/${REPOSITORY}/contents/`;
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const IMAGE_EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  const ALLOWED_TAGS = new Set([
    "A", "BLOCKQUOTE", "BR", "CAPTION", "DIV", "EM", "FIGCAPTION", "FIGURE",
    "H2", "H3", "H4", "HR", "IMG", "LI", "OL", "P", "STRONG", "SUB", "SUP",
    "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "UL",
  ]);
  // Balises renommées au nettoyage (execCommand produit <b>/<i>, la charte style <strong>/<em>).
  const RENAMED_TAGS = new Map([
    ["B", "strong"], ["I", "em"],
    ["H1", "h2"], ["H5", "h4"], ["H6", "h4"],
  ]);
  const DROPPED_TAGS = new Set([
    "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "TEMPLATE",
    "NOSCRIPT", "HEAD", "META", "LINK", "TITLE", "FORM", "INPUT", "BUTTON",
    "SELECT", "TEXTAREA",
  ]);
  const BLOCK_TAGS = new Set([
    "BLOCKQUOTE", "DIV", "FIGURE", "H2", "H3", "H4", "HR", "OL", "P", "TABLE", "UL",
  ]);
  const BLOCK_SELECTOR = "p,div,h1,h2,h3,h4,h5,h6,ul,ol,table,blockquote,figure,hr";
  const ALLOWED_CLASSES = new Set([
    "footnote-back", "footnote-ref", "formule", "large", "numerotee",
    "tableau-defile", "texte", "total",
  ]);
  const MATH_DELIMITERS = [
    { left: "$$", right: "$$", display: true },
    { left: "\\[", right: "\\]", display: true },
    { left: "\\(", right: "\\)", display: false },
  ];
  const NOTE_PLACEHOLDER = "Référence à compléter.";

  const DATA_FOLDER = "articles-data";
  const AVENIR_FOLDER = "articles-data-avenir";
  const EDITO_PATH = "site-data/edito.json";
  const MODE_LABELS = {
    nouveau:  { titre: "Nouvel article",       bouton: "Publier l’article" },
    avenir:   { titre: "Article à venir",      bouton: "Programmer l’article" },
    modifier: { titre: "Modifier ou supprimer", bouton: "Enregistrer les modifications" },
    edito:    { titre: "Modifier l’édito",     bouton: "Enregistrer l’édito" },
  };
  /* ======================================================================
     Éléments et état
     ====================================================================== */
  const $ = (id) => document.getElementById(id);
  const editor = $("corps");
  const notesEditor = $("notes");
  const form = $("formulaire-article");
    form.addEventListener("input", () => { dirty = true; });
    form.addEventListener("change", () => { dirty = true; });
  const tokenInput = $("jeton");
  const imageInput = $("fichiers-images");
  const imageList = $("liste-images");
  const status = $("statut-publication");
  const publishButton = $("publier");
  const preview = $("apercu-corps");
  const notesPreview = $("apercu-notes");
  const latexInput = $("latex-formule");
  const menuLatexInput = $("menu-latex-formule");
  const heading = document.querySelector(".admin-entete h1");
  const tabButtons = Array.from(document.querySelectorAll(".admin-onglets [role='tab']"));
  const picker = $("panneau-modifier");
  const listContainer = $("liste-articles-admin");
  const listStatus = $("statut-liste");

  const images = []; // { id, file, url, alt, caption, width, height }
  let imageCounter = 0;
  const ranges = new Map(); // dernière sélection connue de chaque éditeur
  let activeEditor = editor;
  let slugEdited = false;
  let publishing = false;
  let previewTimer = 0;
  let mode = "nouveau";
  let editing = null;
  let articleList = [];
  let listLoading = false;
  let dirty = false;

  const setStatus = (message, type = "") => {
    status.textContent = message;
    if (type) status.dataset.type = type;
    else delete status.dataset.type;
  };
  const markDirty = () => { dirty = true; };
  const clearDirty = () => { dirty = false; };
  // Un article ou l'édito chargé depuis GitHub n'est « en cours » qu'une fois modifié (dirty).
  const hasUnsavedWork = () => dirty || (editing === null && (
    images.length > 0
    || Boolean(editor.textContent.trim())
    || Boolean(notesEditor.textContent.trim())
    || Boolean($("titre").value.trim())
  ));

  /* ======================================================================
     Date et slug
     ====================================================================== */
  const setToday = () => {
    const now = new Date();
    $("date").value = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
  };
  setToday();

  const slugify = (value) => value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  $("titre").addEventListener("input", (event) => {
    if (slugEdited) return;
    $("slug").value = slugify(event.target.value).slice(0, 80).replace(/-+$/, "");
  });
  $("slug").addEventListener("input", () => {
    slugEdited = true;
  });

  /* ======================================================================
     Sélection (mémorisée pour les boutons, la souris quittant l'éditeur)
     ====================================================================== */
  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    const target = [editor, notesEditor].find((element) => element.contains(selection.anchorNode));
    if (!target) return;
    activeEditor = target;
    ranges.set(target, selection.getRangeAt(0).cloneRange());
  });

  const focusEditor = (target = activeEditor) => {
    target.focus({ preventScroll: true });
    const saved = ranges.get(target);
    const selection = window.getSelection();
    if (saved && selection && target.contains(saved.startContainer)) {
      selection.removeAllRanges();
      selection.addRange(saved);
    }
  };

  const setCaret = (target, range) => {
    const selection = window.getSelection();
    target.focus({ preventScroll: true });
    selection?.removeAllRanges();
    selection?.addRange(range);
    ranges.set(target, range.cloneRange());
    activeEditor = target;
  };

  const caretIn = (target, element, selectAll = false) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    if (!selectAll) range.collapse(true);
    setCaret(target, range);
  };

  const emptyParagraph = () => {
    const paragraph = document.createElement("p");
    paragraph.append(document.createElement("br"));
    return paragraph;
  };

  // Insère un bloc à l'endroit du curseur (après le bloc courant), jamais au milieu d'un paragraphe.
  const insertBlock = (node) => {
    let reference = null;
    let replace = null;
    const saved = ranges.get(editor);
    if (saved && editor.contains(saved.startContainer)) {
      let current = saved.startContainer;
      if (current === editor) {
        reference = editor.childNodes[saved.startOffset] || null;
      } else {
        while (current.parentNode !== editor) current = current.parentNode;
        const isEmpty = current.nodeName === "P"
          && !current.textContent.trim()
          && !current.querySelector("img, figure");
        if (isEmpty) replace = current;
        reference = current.nextSibling;
      }
    }
    if (replace) replace.remove();
    editor.insertBefore(node, reference);
    const after = emptyParagraph();
    editor.insertBefore(after, node.nextSibling);
    caretIn(editor, after); 
    schedulePreview();
  };

  const insertInline = (node) => {
    const saved = ranges.get(editor);
    if (!saved || !editor.contains(saved.startContainer)) return false;
    const selection = window.getSelection();
    editor.focus({ preventScroll: true });
    selection.removeAllRanges();
    selection.addRange(saved);
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    ranges.set(editor, range.cloneRange());
    activeEditor = editor;
    return true;
  };

  /* ======================================================================
     Aperçu (différé pour ne pas recalculer à chaque frappe)
     ====================================================================== */
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 120);
  }

  editor.addEventListener("input", schedulePreview);
  notesEditor.addEventListener("input", schedulePreview);

  const renderMath = (element) => {
    if (typeof window.renderMathInElement !== "function") return;
    try {
      window.renderMathInElement(element, { delimiters: MATH_DELIMITERS, throwOnError: false });
    } catch (error) { /* une formule invalide ne doit pas bloquer l'aperçu */ }
  };

  function updatePreview() {
    clearTimeout(previewTimer);
    const body = sanitizeElement(editor);
    const notes = sanitizeElement(notesEditor);
    renumberNotes(body, notes);

    body.querySelectorAll("img[data-upload-id]").forEach((img) => {
      const image = images.find((item) => item.id === img.getAttribute("data-upload-id"));
      if (!image) {
        img.remove();
        return;
      }
      img.setAttribute("src", image.url);
      img.setAttribute("alt", image.alt);
      const figure = img.closest("figure");
      const caption = figure?.querySelector("figcaption");
      if (image.caption) {
        if (caption) caption.textContent = image.caption;
      } else {
        caption?.remove();
      }
    });
    // Évite les identifiants en double avec l'éditeur ; les liens d'aperçu restent inertes.
    [body, notes].forEach((root) => {
      root.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
      root.querySelectorAll("a[href^='#']").forEach((anchor) => anchor.removeAttribute("href"));
    });
    preview.replaceChildren(body);
    notesPreview.replaceChildren(notes);
    renderMath(preview);
    renderMath(notesPreview);
    refreshImageStates();
  }

  /* ======================================================================
     Boutons de mise en forme
     ====================================================================== */
  document.querySelectorAll(".admin-outils button, .admin-options-avancees button").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
  });

  const normalizeUrl = (value) => {
    const url = value.trim();
    if (!url) return "";
    if (/^(?:https?:|mailto:|#|\/|\.\.?\/)/i.test(url)) return url;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) return `mailto:${url}`;
    return `https://${url}`;
  };

  document.querySelectorAll("[data-commande]").forEach((button) => {
    button.addEventListener("click", () => {
      focusEditor();
      const command = button.dataset.commande;
      if (command === "createLink") {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
          setStatus("Sélectionnez d’abord le texte à transformer en lien.", "erreur");
          return;
        }
        const href = normalizeUrl(window.prompt("Adresse du lien (https://…)") || "");
        if (!href) return;
        focusEditor();
        document.execCommand("createLink", false, href);
      } else {
        document.execCommand(command, false);
      }
      setStatus("");
      schedulePreview();
    });
  });

  document.querySelectorAll("[data-bloc]").forEach((button) => {
    button.addEventListener("click", () => {
      focusEditor();
      const tag = button.dataset.bloc;
      const current = String(document.queryCommandValue("formatBlock") || "")
        .toLowerCase().replace(/[<>]/g, "");
      // Un second clic revient au paragraphe normal.
      document.execCommand("formatBlock", false, current === tag ? "p" : tag);
      schedulePreview();
    });
  });

  $("ajouter-image").addEventListener("click", () => imageInput.click());

  /* ======================================================================
     Annexe, bibliographie, tableau, formule
     ====================================================================== */
  $("ajouter-annexe").addEventListener("click", () => {
    if (editor.querySelector("#annexe")) {
      setStatus("Une annexe existe déjà dans le corps de l’article.", "erreur");
      return;
    }
    const heading = document.createElement("h2");
    heading.id = "annexe";
    heading.textContent = "Annexe";
    const paragraph = emptyParagraph();
    editor.append(heading, paragraph);
    caretIn(editor, paragraph);
    schedulePreview();
    setStatus("");
  });

  $("ajouter-sources").addEventListener("click", () => {
    if (editor.querySelector("#sources")) {
      setStatus("Une bibliographie existe déjà dans le corps de l’article.", "erreur");
      return;
    }
    const heading = document.createElement("h2");
    heading.id = "sources";
    heading.textContent = "Sources";
    const list = document.createElement("ul");
    const item = document.createElement("li");
    item.textContent = "Ajoutez une référence.";
    list.append(item);
    editor.append(heading, list);
    caretIn(editor, item, true);
    schedulePreview();
    setStatus("");
  });

  const askCount = (question, fallback, max) => {
    const answer = window.prompt(question, String(fallback));
    if (answer === null) return null;
    const value = Number.parseInt(answer, 10);
    return Number.isInteger(value) && value >= 1 && value <= max ? value : fallback;
  };

  $("ajouter-tableau").addEventListener("click", () => {
    const columns = askCount("Nombre de colonnes (1 à 8) :", 3, 8);
    if (columns === null) return;
    const rows = askCount("Nombre de lignes de données (1 à 30) :", 3, 30);
    if (rows === null) return;
    const wrapper = document.createElement("div");
    wrapper.className = "tableau-defile";
    const table = document.createElement("table");
    table.className = "texte";
    const caption = document.createElement("caption");
    caption.textContent = "Titre du tableau";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (let column = 1; column <= columns; column += 1) {
      const cell = document.createElement("th");
      cell.textContent = `Colonne ${column}`;
      headRow.append(cell);
    }
    head.append(headRow);
    const body = document.createElement("tbody");
    for (let row = 0; row < rows; row += 1) {
      const line = document.createElement("tr");
      for (let column = 0; column < columns; column += 1) {
        const cell = document.createElement("td");
        cell.textContent = "Valeur";
        line.append(cell);
      }
      body.append(line);
    }
    table.append(caption, head, body);
    wrapper.append(table);
    insertBlock(wrapper);
    setStatus("");
  });

  const insertFormula = (latex, className) => {
    const expression = latex.trim();
    if (!expression) {
      setStatus("Saisissez d’abord une formule LaTeX.", "erreur");
      return false;
    }
    const formula = document.createElement("div");
    formula.className = className;
    formula.textContent = `\\[ ${expression} \\]`;
    insertBlock(formula);
    setStatus("");
    return true;
  };

  document.querySelectorAll("[data-formule]").forEach((button) => {
    button.addEventListener("click", () => {
      if (insertFormula(latexInput.value, button.dataset.formule)) latexInput.value = "";
      else latexInput.focus();
    });
  });

  /* ======================================================================
     Notes de bas de page
     ====================================================================== */
  const noteNumberOf = (value, prefix) => {
    const match = new RegExp(`^${prefix}([1-9]\\d*)$`).exec(value || "");
    return match ? Number(match[1]) : null;
  };

  const createNoteRef = (number) => {
    const reference = document.createElement("a");
    reference.href = `#fn${number}`;
    reference.className = "footnote-ref";
    reference.id = `fnref${number}`;
    reference.setAttribute("role", "doc-noteref");
    const superscript = document.createElement("sup");
    superscript.textContent = String(number);
    reference.append(superscript);
    return reference;
  };

  const createBacklink = (number) => {
    const backlink = document.createElement("a");
    backlink.href = `#fnref${number}`;
    backlink.className = "footnote-back";
    backlink.setAttribute("role", "doc-backlink");
    backlink.setAttribute("aria-label", "Revenir à l’appel de note");
    backlink.title = "Revenir à l’appel de note";
    backlink.textContent = "↩";
    return backlink;
  };

  // Renumérote les notes dans l'ordre d'apparition des appels, relie chaque note
  // à son appel (et recrée le lien de retour). Renvoie les anomalies détectées.
  function renumberNotes(bodyRoot, notesRoot, live = false) {
    const result = { count: 0, orphans: 0, unmatched: 0, duplicates: 0 };
    const list = notesRoot.querySelector("ol");
    const itemsByOld = new Map();
    const orphanItems = [];
    if (list) {
      Array.from(list.children).filter((child) => child.tagName === "LI").forEach((item) => {
        const number = noteNumberOf(item.id, "fn");
        if (number && !itemsByOld.has(number)) {
          itemsByOld.set(number, item);
          return;
        }
        const clone = item.cloneNode(true);
        clone.querySelectorAll("a.footnote-back").forEach((anchor) => anchor.remove());
        if (!clone.textContent.trim()) item.remove(); // ligne vide laissée par la touche Entrée
        else orphanItems.push(item);
      });
    }

    const assignments = [];
    const mapping = new Map();
    bodyRoot.querySelectorAll("a.footnote-ref").forEach((reference) => {
      const old = noteNumberOf((reference.getAttribute("href") || "").replace(/^#/, ""), "fn");
      if (!old || !itemsByOld.has(old)) {
        result.unmatched += 1;
        return;
      }
      if (mapping.has(old)) {
        result.duplicates += 1;
        return;
      }
      mapping.set(old, mapping.size + 1);
      assignments.push({ reference, old, number: mapping.size });
    });
    result.count = assignments.length;

    const ordered = [];
    assignments.forEach(({ reference, old, number }) => {
      reference.setAttribute("href", `#fn${number}`);
      reference.id = `fnref${number}`;
      const superscript = reference.querySelector("sup") || reference.appendChild(document.createElement("sup"));
      superscript.textContent = String(number);
      if (live) reference.setAttribute("contenteditable", "false");
      const item = itemsByOld.get(old);
      item.id = `fn${number}`;
      item.querySelectorAll("a.footnote-back").forEach((anchor) => anchor.remove());
      const backlink = createBacklink(number);
      if (live) backlink.setAttribute("contenteditable", "false");
      item.append(backlink);
      ordered.push(item);
    });
    itemsByOld.forEach((item, old) => {
      if (mapping.has(old)) return;
      item.removeAttribute("id");
      item.querySelectorAll("a.footnote-back").forEach((anchor) => anchor.remove());
      orphanItems.push(item);
    });
    result.orphans = orphanItems.length;
    if (list) list.append(...ordered, ...orphanItems);
    return result;
  }

  const renumberLive = () => renumberNotes(editor, notesEditor, true);

  const selectText = (target, element) => {
    const node = element.firstChild;
    if (!node) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    setCaret(target, range);
  };

  const addNote = (referenceText = "") => {
    const saved = ranges.get(editor);
    if (!saved || !editor.contains(saved.startContainer)) {
      setStatus("Placez d’abord le curseur dans le corps de l’article, à l’endroit de l’appel de note.", "erreur");
      return false;
    }
    const used = [
      ...Array.from(editor.querySelectorAll("a.footnote-ref")).map((a) => noteNumberOf(a.id, "fnref")),
      ...Array.from(notesEditor.querySelectorAll("li[id]")).map((li) => noteNumberOf(li.id, "fn")),
    ].filter(Boolean);
    const number = Math.max(0, ...used) + 1;
    const reference = createNoteRef(number);
    reference.setAttribute("contenteditable", "false");
    if (!insertInline(reference)) {
      setStatus("Le curseur n’est plus disponible dans le corps de l’article. Cliquez à nouveau à son emplacement.", "erreur");
      return false;
    }

    let list = notesEditor.querySelector("ol");
    if (!list) {
      list = document.createElement("ol");
      notesEditor.replaceChildren(list);
    }
    const item = document.createElement("li");
    item.id = `fn${number}`;
    const hasText = Boolean(referenceText.trim());
    item.append(document.createTextNode(hasText ? referenceText.trim() : NOTE_PLACEHOLDER));
    list.append(item);
    renumberLive();
    schedulePreview();

    if (hasText) {
      focusEditor(editor); // le curseur reste dans le texte, juste après l'appel
      setStatus("Appel et référence de note ajoutés.", "succes");
    } else {
      selectText(notesEditor, item); // la phrase à remplacer est déjà sélectionnée
      setStatus("Appel de note ajouté : saisissez la référence dans la zone des notes.", "succes");
    }
    return true;
  };
  $("ajouter-note").addEventListener("mousedown", (event) => event.preventDefault());
  $("ajouter-note").addEventListener("click", () => addNote());

  /* ======================================================================
     Menu contextuel de l'éditeur
     ====================================================================== */
  const contextMenu = $("menu-contextuel");
  const advancedContextMenu = $("menu-contextuel-avance");
  const advancedContextToggle = $("menu-options-avancees");

  const closeAdvancedMenu = () => {
    advancedContextMenu.hidden = true;
    advancedContextMenu.classList.remove("admin-menu-contextuel-avance--gauche");
    advancedContextToggle.setAttribute("aria-expanded", "false");
    advancedContextToggle.textContent = "Options avancées ▸";
  };
  const closeContextMenu = () => {
    contextMenu.hidden = true;
    closeAdvancedMenu();
  };

  const caretRangeAt = (x, y) => {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    const position = document.caretPositionFromPoint?.(x, y);
    if (!position) return null;
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  };

  editor.addEventListener("contextmenu", (event) => {
    const selection = window.getSelection();
    const selectionInside = selection?.rangeCount
      && !selection.isCollapsed
      && editor.contains(selection.anchorNode)
      && editor.contains(selection.focusNode);
    if (selectionInside) {
      ranges.set(editor, selection.getRangeAt(0).cloneRange());
    } else {
      const point = caretRangeAt(event.clientX, event.clientY);
      if (point && editor.contains(point.startContainer)) {
        point.collapse(true);
        ranges.set(editor, point.cloneRange());
      }
    }
    activeEditor = editor;
    event.preventDefault();
    closeAdvancedMenu();
    contextMenu.hidden = false;
    const bounds = contextMenu.getBoundingClientRect();
    contextMenu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - bounds.width - 8))}px`;
    contextMenu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - bounds.height - 8))}px`;
    contextMenu.querySelector("button[role='menuitem']").focus({ preventScroll: true });
  });

  contextMenu.addEventListener("mousedown", (event) => {
    if (event.target instanceof HTMLInputElement) return;
    event.preventDefault();
  });

  const toggleAdvancedMenu = () => {
    const expanded = advancedContextToggle.getAttribute("aria-expanded") !== "true";
    if (!expanded) {
      closeAdvancedMenu();
      return;
    }
    advancedContextToggle.setAttribute("aria-expanded", "true");
    advancedContextToggle.textContent = "Options avancées ▾";
    advancedContextMenu.hidden = false;
    advancedContextMenu.style.top = `${advancedContextToggle.offsetTop}px`;
    let rect = advancedContextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      advancedContextMenu.classList.add("admin-menu-contextuel-avance--gauche");
      rect = advancedContextMenu.getBoundingClientRect();
    }
    if (rect.bottom > window.innerHeight - 8) {
      const overflow = rect.bottom - window.innerHeight + 8;
      advancedContextMenu.style.top = `${advancedContextToggle.offsetTop - overflow}px`;
    }
    advancedContextMenu.querySelector("button")?.focus({ preventScroll: true });
  };

  contextMenu.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("button") : null;
    if (!target) return;
    if (target === advancedContextToggle) {
      toggleAdvancedMenu();
      return;
    }
    if (target.id === "menu-contextuel-note") {
      const reference = window.prompt("Référence de la note de bas de page :");
      if (reference === null) return;
      if (!reference.trim()) {
        setStatus("Saisissez la référence de la note pour l’ajouter.", "erreur");
        return;
      }
      if (addNote(reference)) closeContextMenu();
      return;
    }
    if (target.dataset.contextFormule) {
      if (insertFormula(menuLatexInput.value, target.dataset.contextFormule)) {
        menuLatexInput.value = "";
        closeContextMenu();
      }
      return;
    }
    if (target.dataset.contextTarget) {
      const action = document.querySelector(target.dataset.contextTarget);
      closeContextMenu();
      action?.click();
    }
  });

  contextMenu.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement && event.key !== "Escape") return;
    const items = Array.from(contextMenu.querySelectorAll("button[role='menuitem']"))
      .filter((item) => item.getClientRects().length > 0);
    const currentIndex = items.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeContextMenu();
      focusEditor(editor);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      items[(currentIndex + direction + items.length) % items.length]?.focus();
    } else if (event.key === "ArrowRight" && document.activeElement === advancedContextToggle) {
      event.preventDefault();
      if (advancedContextMenu.hidden) toggleAdvancedMenu();
    } else if (event.key === "ArrowLeft" && !advancedContextMenu.hidden) {
      event.preventDefault();
      closeAdvancedMenu();
      advancedContextToggle.focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!contextMenu.hidden && !contextMenu.contains(event.target)) closeContextMenu();
  });
  window.addEventListener("resize", closeContextMenu);
  window.addEventListener("scroll", (event) => {
    if (contextMenu.contains(event.target)) return;
    closeContextMenu();
  }, true);

  /* Entrée dans un champ simple ne doit pas envoyer le formulaire par accident. */
  form.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target === tokenInput) return;
    event.preventDefault();
    if (target === latexInput) document.querySelector("[data-formule='formule']").click();
    else if (target === menuLatexInput) document.querySelector("[data-context-formule='formule']").click();
  });

  /* ======================================================================
     Images
     ====================================================================== */
  const formatSize = (bytes) => (bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} Mo`
    : `${(bytes / 1024).toFixed(1)} Ko`);

  const readDimensions = (url) => new Promise((resolve) => {
    const probe = new Image();
    probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
    probe.onerror = () => resolve(null);
    probe.src = url;
  });

  const syncImageToEditor = (image) => {
    editor.querySelectorAll(`img[data-upload-id="${image.id}"]`).forEach((img) => {
      img.alt = image.alt;
      const caption = img.closest("figure")?.querySelector("figcaption");
      if (caption) caption.textContent = image.caption;
    });
  };

  const isImageUsed = (image) => Boolean(editor.querySelector(`img[data-upload-id="${image.id}"]`));

  function refreshImageStates() {
    imageList.querySelectorAll(".admin-image").forEach((row) => {
      const image = images.find((item) => item.id === row.dataset.imageId);
      const state = row.querySelector(".admin-image-etat");
      if (image && state) {
        state.textContent = isImageUsed(image)
          ? ""
          : "Cette image n’est plus dans le texte : elle ne sera pas envoyée.";
      }
    });
  }

  const renderImageList = () => {
    imageList.replaceChildren();
    images.forEach((image) => {
      const row = document.createElement("div");
      row.className = "admin-image";
      row.dataset.imageId = image.id;

      const name = document.createElement("span");
      name.textContent = `${image.file.name} (${formatSize(image.file.size)})`;
      const state = document.createElement("small");
      state.className = "admin-image-etat";
      name.append(document.createElement("br"), state);

      const fields = document.createElement("div");
      fields.className = "admin-image-fields";
      const descriptionLabel = document.createElement("label");
      descriptionLabel.textContent = "Description de l’image (obligatoire)";
      const description = document.createElement("input");
      description.type = "text";
      description.maxLength = 500;
      description.value = image.alt;
      description.addEventListener("input", () => {
        image.alt = description.value.trim();
        syncImageToEditor(image);
        schedulePreview();
      });
      descriptionLabel.append(description);

      const captionLabel = document.createElement("label");
      captionLabel.textContent = "Légende (facultative)";
      const caption = document.createElement("input");
      caption.type = "text";
      caption.maxLength = 300;
      caption.value = image.caption;
      caption.addEventListener("input", () => {
        image.caption = caption.value.trim();
        syncImageToEditor(image);
        schedulePreview();
      });
      captionLabel.append(caption);
      fields.append(descriptionLabel, captionLabel);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Retirer";
      remove.setAttribute("aria-label", `Retirer ${image.file.name}`);
      remove.addEventListener("click", () => {
        editor.querySelectorAll(`img[data-upload-id="${image.id}"]`).forEach((img) => {
          img.closest("figure")?.remove();
        });
        URL.revokeObjectURL(image.url);
        images.splice(images.indexOf(image), 1);
        renderImageList();
        schedulePreview();
      });

      row.append(name, fields, remove);
      imageList.append(row);
    });
    refreshImageStates();
  };

  imageInput.addEventListener("change", async () => {
    const files = Array.from(imageInput.files || []);
    imageInput.value = "";
    const rejected = [];
    const added = [];
    for (const file of files) {
      if (!IMAGE_EXTENSIONS[file.type]) {
        rejected.push(`Format non pris en charge pour « ${file.name} ». Utilisez PNG, JPEG, GIF ou WebP.`);
      } else if (file.size > MAX_IMAGE_BYTES) {
        rejected.push(`« ${file.name} » dépasse la limite de 10 Mo.`);
      } else {
        imageCounter += 1;
        const url = URL.createObjectURL(file);
        const dimensions = await readDimensions(url);
        added.push({
          id: `img${imageCounter}`,
          file,
          url,
          alt: "",
          caption: "",
          width: dimensions?.width || 0,
          height: dimensions?.height || 0,
        });
      }
    }
    if (!added.length) {
      if (rejected.length) setStatus(rejected.join(" "), "erreur");
      return;
    }
    added.forEach((image) => {
      images.push(image);
      const figure = document.createElement("figure");
      figure.setAttribute("contenteditable", "false");
      const img = document.createElement("img");
      img.src = image.url;
      img.alt = "";
      img.setAttribute("data-upload-id", image.id);
      figure.append(img, document.createElement("figcaption"));
      insertBlock(figure);
    });
    renderImageList();
    schedulePreview();
    setStatus(rejected.length
      ? `${rejected.join(" ")} Les autres images ont été ajoutées.`
      : "Image ajoutée : renseignez sa description dans la liste ci-dessous.");
  });

  /* ======================================================================
     Nettoyage du HTML (le même code sert pour l'aperçu et la publication)
     ====================================================================== */
  const safeHref = (value) => {
    const href = value.trim();
    return /^(?:https?:\/\/[^\s]+|mailto:[^\s]+|#[^\s]*|\/(?!\/)[^\s]*|\.\.?\/[^\s]*)$/i.test(href) ? href : "";
  };

  const safeImageSrc = (value) => {
    const src = value.trim();
    return /^(?:https?:\/\/[^\s]+|\/(?!\/)[^\s]*|\.\.?\/[^\s]*)$/i.test(src) ? src : "";
  };

  const cleanClasses = (value) => value.split(/\s+/)
    .filter((name) => ALLOWED_CLASSES.has(name)).join(" ");

  function cleanNode(node, destination) {
    if (node.nodeType === Node.TEXT_NODE) {
      destination.append(document.createTextNode(node.nodeValue || ""));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.localName.toUpperCase();
    if (DROPPED_TAGS.has(tag)) return;
    const unwrap = () => node.childNodes.forEach((child) => cleanNode(child, destination));
    const classes = cleanClasses(node.getAttribute("class") || "");

    let outTag = RENAMED_TAGS.get(tag) || tag.toLowerCase();
    if (tag === "DIV" && !classes) {
      // <div> sans classe : un simple paragraphe (ou rien s'il contient déjà des blocs).
      if (node.querySelector(BLOCK_SELECTOR)) {
        unwrap();
        return;
      }
      outTag = "p";
    } else if (!ALLOWED_TAGS.has(tag) && !RENAMED_TAGS.has(tag)) {
      unwrap();
      return;
    }

    const clean = document.createElement(outTag);
    if (tag === "A") {
      const href = safeHref(node.getAttribute("href") || "");
      if (!href) {
        unwrap();
        return;
      }
      clean.setAttribute("href", href);
      if (/^https?:/i.test(href)) clean.setAttribute("rel", "noopener noreferrer");
      if (classes.includes("footnote-ref") && noteNumberOf(node.id, "fnref")) {
        clean.id = node.id;
        clean.className = "footnote-ref";
        clean.setAttribute("role", "doc-noteref");
      } else if (classes.includes("footnote-back")) {
        clean.className = "footnote-back";
        clean.setAttribute("role", "doc-backlink");
        clean.setAttribute("aria-label", "Revenir à l’appel de note");
        clean.title = "Revenir à l’appel de note";
      }
    } else if (tag === "IMG") {
      const uploadId = node.getAttribute("data-upload-id") || "";
      if (/^img\d+$/.test(uploadId)) {
        clean.setAttribute("data-upload-id", uploadId);
      } else {
        const src = safeImageSrc(node.getAttribute("src") || "");
        if (!src) return; // image sans chemin exploitable (collée depuis un autre document)
        clean.setAttribute("src", src);
        ["width", "height"].forEach((name) => {
          const value = node.getAttribute(name) || "";
          if (/^\d+$/.test(value)) clean.setAttribute(name, value);
        });
      }
      clean.setAttribute("alt", node.getAttribute("alt") || "");
      clean.setAttribute("loading", "lazy");
    } else {
      if (tag === "LI" && noteNumberOf(node.id, "fn")) clean.id = node.id;
      if (tag === "H2" && (node.id === "annexe" || node.id === "sources")) clean.id = node.id;
      if (classes) clean.className = classes;
    }
    if (!["IMG", "BR", "HR"].includes(tag)) {
      node.childNodes.forEach((child) => cleanNode(child, clean));
    }
    destination.append(clean);
  }

  function sanitizeElement(source) {
    const parsed = new DOMParser().parseFromString(source.innerHTML, "text/html");
    const container = document.createElement("div");
    parsed.body.childNodes.forEach((node) => cleanNode(node, container));
    container.querySelectorAll("p").forEach((paragraph) => {
      if (!paragraph.textContent.trim() && !paragraph.querySelector("img")) paragraph.remove();
    });
    container.querySelectorAll("figure").forEach((figure) => {
      if (!figure.querySelector("img")) figure.remove();
    });
    // Tout texte resté à la racine est regroupé dans un paragraphe.
    const normalized = document.createElement("div");
    let inlineParagraph = null;
    Array.from(container.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) return;
      if (node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.tagName)) {
        inlineParagraph = null;
        normalized.append(node);
        return;
      }
      if (!inlineParagraph) {
        inlineParagraph = document.createElement("p");
        normalized.append(inlineParagraph);
      }
      inlineParagraph.append(node);
    });
    return normalized;
  }

  const serializeBlocks = (root) => Array.from(root.children).map((child) => child.outerHTML).join("\n");

  /* ======================================================================
     Collage depuis Word (notes de bas de page) et nettoyage du collage
     ====================================================================== */
  const normalizeFootnoteId = (value) => value
    .replace(/^#/, "")
    .replace(/^_+/, "")
    .replace(/^(?:ftn|edn)/i, "")
    .toLowerCase();

  // Extrait les notes d'un document Word collé ; renvoie null s'il n'y en a pas.
  const extractWordFootnotes = (pasted) => {
    const blocks = Array.from(pasted.body.querySelectorAll("[id]")).filter((node) => {
      const style = node.getAttribute("style") || "";
      return /mso-element:\s*(?:footnote|endnote)\b(?!-list)/i.test(style)
        || /^(?:_)?(?:ftn|edn|endnote)\d+$/i.test(node.id);
    });
    if (!blocks.length) return null;

    const footnotes = new Map(blocks.map((block) => [normalizeFootnoteId(block.id), block]));
    const references = Array.from(pasted.body.querySelectorAll("a")).filter((anchor) => {
      if (blocks.some((block) => block.contains(anchor))) return false;
      const href = anchor.getAttribute("href") || "";
      const target = href.startsWith("#") ? normalizeFootnoteId(href) : "";
      return footnotes.has(target)
        || /mso-footnote-id\s*:/i.test(anchor.getAttribute("style") || "");
    });
    if (!references.length) return null;

    const imported = new Map(); // identifiant Word -> numéro provisoire
    let temporary = 100000;
    references.forEach((sourceReference) => {
      const styleId = (sourceReference.getAttribute("style") || "")
        .match(/mso-footnote-id\s*:\s*([^;\s]+)/i)?.[1];
      const footnoteId = normalizeFootnoteId(styleId || sourceReference.getAttribute("href") || "");
      if (!footnotes.has(footnoteId)) return;
      if (!imported.has(footnoteId)) imported.set(footnoteId, (temporary += 1));
      const reference = createNoteRef(imported.get(footnoteId));
      sourceReference.replaceWith(reference);
    });
    if (!imported.size) return null;

    // On retire les notes et leurs conteneurs (qui laissent sinon <hr> et <br> parasites).
    pasted.body.querySelectorAll("[style]").forEach((node) => {
      if (/mso-element:\s*(?:footnote|endnote)-list/i.test(node.getAttribute("style") || "")) node.remove();
    });
    blocks.forEach((block) => block.remove());
    return { imported, footnotes };
  };

  const appendImportedNotes = ({ imported, footnotes }) => {
    let list = notesEditor.querySelector("ol");
    if (!list) {
      list = document.createElement("ol");
      notesEditor.replaceChildren(list);
    }
    const base = Math.max(
      0,
      ...Array.from(notesEditor.querySelectorAll("li[id]")).map((li) => noteNumberOf(li.id, "fn") || 0),
    );
    // On donne des numéros provisoires libres aux nouvelles notes puis on renumérote.
    const shift = new Map();
    imported.forEach((temporaryNumber, footnoteId) => {
      shift.set(temporaryNumber, base + shift.size + 1);
      const item = document.createElement("li");
      item.id = `fn${base + shift.size}`;
      const content = footnotes.get(footnoteId).cloneNode(true);
      content.querySelectorAll("a").forEach((anchor) => {
        if (/mso-footnote-id\s*:/i.test(anchor.getAttribute("style") || "")
          || /^#_?(?:ftn|edn)ref/i.test(anchor.getAttribute("href") || "")
          || /^_?(?:ftn|edn)\d+$/i.test(anchor.getAttribute("name") || "")) {
          anchor.remove();
        }
      });
      const paragraphs = Array.from(content.querySelectorAll("p"));
      if (paragraphs.length) {
        paragraphs.forEach((paragraph, index) => {
          if (index) item.append(document.createElement("br"));
          paragraph.childNodes.forEach((node) => cleanNode(node, item));
        });
      } else {
        content.childNodes.forEach((node) => cleanNode(node, item));
      }
      while (item.firstChild?.nodeType === Node.TEXT_NODE && !item.firstChild.textContent.trim()) {
        item.firstChild.remove();
      }
      if (item.firstChild?.nodeType === Node.TEXT_NODE) {
        item.firstChild.textContent = item.firstChild.textContent.replace(/^\s+/, "");
      }
      list.append(item);
    });
    return shift;
  };

  editor.addEventListener("paste", (event) => {
    const clipboardHtml = event.clipboardData?.getData("text/html");
    if (!clipboardHtml) return; // texte brut : collage natif

    event.preventDefault();
    const pasted = new DOMParser().parseFromString(clipboardHtml, "text/html");
    const droppedImages = Array.from(pasted.body.querySelectorAll("img"))
      .filter((img) => !safeImageSrc(img.getAttribute("src") || "")).length;
    const wordNotes = extractWordFootnotes(pasted);

    const container = document.createElement("div");
    pasted.body.childNodes.forEach((node) => cleanNode(node, container));
    container.querySelectorAll("p").forEach((paragraph) => {
      if (!paragraph.textContent.trim() && !paragraph.querySelector("img")) paragraph.remove();
    });

    let html = container.innerHTML;
    let shift = null;
    if (wordNotes) {
      shift = appendImportedNotes(wordNotes);
      // Les appels provisoires (fn100001…) deviennent les numéros réservés aux nouvelles notes.
      shift.forEach((finalNumber, temporaryNumber) => {
        html = html
          .split(`href="#fn${temporaryNumber}"`).join(`href="#fn${finalNumber}"`)
          .split(`id="fnref${temporaryNumber}"`).join(`id="fnref${finalNumber}"`)
          .split(`<sup>${temporaryNumber}</sup>`).join(`<sup>${finalNumber}</sup>`);
      });
    }
    if (html.trim()) document.execCommand("insertHTML", false, html);
    if (wordNotes) renumberLive();
    schedulePreview();

    if (wordNotes) {
      const count = wordNotes.imported.size;
      setStatus(`${count} note${count > 1 ? "s" : ""} de bas de page importée${count > 1 ? "s" : ""} depuis Word.`, "succes");
    } else if (droppedImages) {
      setStatus("Les images collées depuis un autre document ne sont pas conservées : utilisez « Insérer une image ».", "erreur");
    }
  });

  /* ======================================================================
     Publication sur GitHub
     ====================================================================== */
  const parseList = (value) => value.split(",").map((item) => item.trim()).filter(Boolean);
  const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

  const explainHttpError = async (response) => {
    let detail = "";
    try {
      detail = (await response.json()).message || "";
    } catch (error) { /* corps vide */ }
    if (response.status === 401) return "jeton GitHub invalide ou expiré";
    if (response.status === 403) return `accès refusé par GitHub${detail ? ` (${detail})` : ""} : vérifiez la permission « Contents : Read and write »`;
    if (response.status === 404) return "dépôt introuvable ou jeton sans accès à ce dépôt";
    if (response.status === 409 || response.status === 422) {
      return `conflit avec GitHub${detail ? ` (${detail})` : ""} : le fichier a changé depuis son chargement. Rechargez-le puis recommencez`;
    }
    return detail || `erreur HTTP ${response.status}`;
  };

  const githubHeaders = (token, withBody = false) => ({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...(withBody ? { "Content-Type": "application/json" } : {}),
  });

  const putFile = async (path, token, message, bytes, sha = null) => {
    const payload = { message, content: encodeBase64(bytes), branch: BRANCH };
    if (sha) payload.sha = sha;
    const response = await fetch(`${API_ROOT}${encodePath(path)}`, {
      method: "PUT",
      headers: githubHeaders(token, true),
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await explainHttpError(response));
    return response.json();
  };

  const deleteFile = async (path, token, message, sha) => {
    const response = await fetch(`${API_ROOT}${encodePath(path)}`, {
      method: "DELETE",
      headers: githubHeaders(token, true),
      body: JSON.stringify({ message, sha, branch: BRANCH }),
    });
    if (!response.ok) throw new Error(await explainHttpError(response));
  };

  const contentsUrl = (path) => `${API_ROOT}${encodePath(path)}?ref=${encodeURIComponent(BRANCH)}`;

  // Renvoie le sha d'un fichier, ou null s'il n'existe pas.
  const getSha = async (path, token) => {
    const response = await fetch(contentsUrl(path), { headers: githubHeaders(token) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(await explainHttpError(response));
    return (await response.json()).sha || null;
  };

  // Lit un fichier texte (UTF-8) ; renvoie null s'il manque et que allowMissing est vrai.
  const getFile = async (path, token, allowMissing = false) => {
    const response = await fetch(contentsUrl(path), { headers: githubHeaders(token) });
    if (response.status === 404 && allowMissing) return null;
    if (!response.ok) throw new Error(await explainHttpError(response));
    const data = await response.json();
    if (!data.content) throw new Error("fichier trop volumineux pour l’API GitHub (plus de 1 Mo)");
    const binary = atob(data.content.replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { sha: data.sha, text: new TextDecoder().decode(bytes) };
  };

  // Liste les fichiers .json d'un dossier ; un dossier absent (Git ne garde pas les dossiers vides) = liste vide.
  const listFolder = async (folder, token) => {
    const response = await fetch(contentsUrl(folder), { headers: githubHeaders(token) });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(await explainHttpError(response));
    const files = await response.json();
    return files.filter((file) => file.type === "file" && file.name.endsWith(".json"));
  };

  const pathExists = async (path, token) => {
    const response = await fetch(`${API_ROOT}${encodePath(path)}?ref=${encodeURIComponent(BRANCH)}`, {
      headers: githubHeaders(token),
    });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error(await explainHttpError(response));
    return true;
  };

  function encodeBase64(bytes) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  }

  const uploadImages = async (slug, token, used) => {
    const paths = new Map();
    let sent = 0;
    for (const image of used) {
      sent += 1;
      const extension = IMAGE_EXTENSIONS[image.file.type];
      const baseName = slugify(image.file.name.replace(/\.[^.]+$/, "")) || "image";
      const stem = `${slug}-${String(sent).padStart(2, "0")}-${baseName}`;
      let candidate = `images/${stem}.${extension}`;
      let suffix = 2;
      while (await pathExists(candidate, token)) {
        candidate = `images/${stem}-${suffix}.${extension}`;
        suffix += 1;
      }
      setStatus(`Envoi de l’image ${sent}/${used.length} : ${image.file.name}…`);
      const bytes = new Uint8Array(await image.file.arrayBuffer());
      await putFile(candidate, token, `Ajout de l’image ${candidate}`, bytes);
      paths.set(image.id, candidate);
    }
    return paths;
  };

  // Valide le formulaire et prépare l'article (sans toucher à l'éditeur).
  const buildArticle = () => {
    const slug = $("slug").value.trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error("Le slug doit contenir uniquement des minuscules non accentuées, chiffres et tirets.");
    }
    const date = $("date").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00`))) {
      throw new Error("La date de publication est invalide.");
    }

    const body = sanitizeElement(editor);
    if (!body.textContent.trim() && !body.querySelector("img")) {
      throw new Error("Ajoutez du texte ou une image au corps de l’article.");
    }

    const used = [];
    const missingAlt = [];
    body.querySelectorAll("img[data-upload-id]").forEach((img) => {
      const image = images.find((item) => item.id === img.getAttribute("data-upload-id"));
      if (!image) throw new Error("Une image du texte n’est associée à aucun fichier. Retirez-la puis réinsérez-la.");
      if (!used.includes(image)) used.push(image);
      if (!image.alt.trim() && !missingAlt.includes(image.file.name)) missingAlt.push(image.file.name);
    });
    if (missingAlt.length) {
      throw new Error(`Renseignez une description détaillée pour : ${missingAlt.join(", ")}.`);
    }

    const notes = sanitizeElement(notesEditor);
    const check = renumberNotes(body, notes);
    if (check.duplicates) {
      throw new Error("Un même appel de note apparaît plusieurs fois. Utilisez le bouton « Ajouter une note » pour chaque nouvel appel.");
    }
    if (check.unmatched) {
      throw new Error("Un appel de note n’a pas de note correspondante dans la zone « Notes de bas de page ».");
    }
    if (check.orphans) {
      throw new Error("Une note n’est reliée à aucun appel dans le texte. Supprimez-la ou replacez son appel avec « Ajouter une note ».");
    }
    if (notes.querySelector(":scope > :not(ol)")) {
      throw new Error("La zone des notes contient du texte hors d’une note numérotée. Utilisez le bouton « Ajouter une note ».");
    }
    const list = notes.querySelector("ol");
    list?.querySelectorAll("li").forEach((item) => {
      if (item.textContent.includes(NOTE_PLACEHOLDER)) {
        throw new Error(`Complétez la référence de la note ${item.id.replace(/^fn/, "")} avant de publier.`);
      }
    });

    const article = {
      slug,
      titre: $("titre").value.trim(),
      soustitre: $("soustitre").value.trim(),
      date,
      description: $("description").value.trim(),
      temps_lecture: $("temps-lecture").value.trim(),
      tags: parseList($("tags").value),
      disciplines: parseList($("disciplines").value),
      motscles: parseList($("motscles").value),
      meta_title: $("meta-title").value.trim(),
      meta_description: $("meta-description").value.trim(),
      publie_le: "",
      corps: "",
      notes: "",
    };
    return { article, body, notes, list, used };
  };

  const resetForm = (preserveToken = true) => {
    images.forEach((image) => URL.revokeObjectURL(image.url));
    images.length = 0;
    form.reset();
    editor.replaceChildren();
    notesEditor.replaceChildren();
    renderImageList();
    slugEdited = false;
    editing = null;
    if (!preserveToken) tokenInput.value = "";
    setToday();
    updatePreview();
    updateFormVisibility();
    dirty = false;
  };
  /* ======================================================================
     Onglets, liste des articles, suppression, édito, publication
     ====================================================================== */
  const infosSet = $("fieldset-infos");
  const notesSet = $("fieldset-notes");
  const bodyLegend = $("legende-corps");
  const dateLabel = $("date-etiquette");
  const editoPanel = $("panneau-edito");
  const editoStatus = $("statut-edito");

  const todayString = () => {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
  };

  const updateFormVisibility = () => {
    form.hidden = (mode === "modifier" || mode === "edito") && !editing;
    infosSet.hidden = mode === "edito";
    notesSet.hidden = mode === "edito";
    bodyLegend.textContent = mode === "edito" ? "Texte de l’édito" : "Corps de l’article";
    dateLabel.textContent = mode === "avenir"
      ? "Date de mise en ligne (publication automatique)"
      : "Date de publication";
  };

  // Dans l'éditeur, les images déjà publiées sont affichées depuis la racine du site (admin.html y est).
  // Le préfixe « ./ » est exigé par le nettoyage du HTML ; il est retiré ou converti à l'enregistrement.
  const showImages = (html) => html
    .split('src="../images/').join('src="./images/')
    .split('src="images/').join('src="./images/');

  const applyUploadedImages = (body, paths, prefix) => {
    body.querySelectorAll("img[data-upload-id]").forEach((img) => {
      const id = img.getAttribute("data-upload-id");
      const image = images.find((item) => item.id === id);
      img.setAttribute("src", `${prefix}${paths.get(id)}`);
      img.setAttribute("alt", image.alt);
      if (image.width && image.height) {
        img.setAttribute("width", String(image.width));
        img.setAttribute("height", String(image.height));
      }
      img.removeAttribute("data-upload-id");
      const figure = img.closest("figure");
      const caption = figure?.querySelector("figcaption");
      if (image.caption) {
        if (caption) caption.textContent = image.caption;
        else figure?.append(Object.assign(document.createElement("figcaption"), { textContent: image.caption }));
      } else {
        caption?.remove();
      }
    });
  };

  /* ---------- Liste des articles (publiés et à venir) ---------- */
  const renderArticleList = () => {
    listContainer.replaceChildren();
    if (!articleList.length) {
      const empty = document.createElement("p");
      empty.className = "admin-aide";
      empty.textContent = "Aucun article pour l’instant dans le dépôt.";
      listContainer.append(empty);
      return;
    }
    articleList.forEach((file) => {
      const row = document.createElement("div");
      row.className = "admin-article-row";

      const name = document.createElement("span");
      name.textContent = file.name.replace(/\.json$/, "");
      if (file.avenir) {
        const badge = document.createElement("em");
        badge.className = "admin-badge";
        badge.textContent = " (à venir)";
        name.append(badge);
      }

      const actions = document.createElement("div");
      actions.className = "admin-article-actions";
      const addButton = (label, handler, className = "") => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        if (className) button.className = className;
        button.setAttribute("aria-label", `${label} : ${name.textContent.trim()}`);
        button.addEventListener("click", handler);
        actions.append(button);
      };
      addButton("Modifier", () => loadArticleForEdit(file));
      if (file.avenir) addButton("Publier maintenant", () => promoteNow(file));
      addButton("Supprimer", () => deleteArticle(file), "admin-danger");

      row.append(name, actions);
      listContainer.append(row);
    });
  };

  const loadArticleList = async () => {
    if (listLoading) return;
    const token = tokenInput.value.trim();
    if (!token) {
      listContainer.replaceChildren();
      listStatus.textContent = "Saisissez un jeton GitHub ci-dessus puis cliquez sur « Charger la liste ».";
      return;
    }
    listLoading = true;
    listStatus.textContent = "Chargement de la liste…";
    try {
      const [published, upcoming] = await Promise.all([
        listFolder(DATA_FOLDER, token),
        listFolder(AVENIR_FOLDER, token),
      ]);
      articleList = [
        ...upcoming.map((file) => ({ ...file, avenir: true })),
        ...published.map((file) => ({ ...file, avenir: false })),
      ];
      renderArticleList();
      listStatus.textContent = `${published.length} article${published.length > 1 ? "s" : ""} publié${published.length > 1 ? "s" : ""}, ${upcoming.length} à venir.`;
    } catch (error) {
      articleList = [];
      renderArticleList();
      listStatus.textContent = `Impossible de charger la liste : ${error.message}.`;
    } finally {
      listLoading = false;
    }
  };

  // Recharge la liste puis affiche le message d'une action devant le décompte.
  const finishList = async (message) => {
    await loadArticleList();
    listStatus.textContent = `${message} ${listStatus.textContent}`;
  };

  /* ---------- Modifier ---------- */
  const populateForm = (article) => {
    $("titre").value = article.titre || "";
    $("soustitre").value = article.soustitre || "";
    $("slug").value = article.slug || "";
    $("date").value = article.date || "";
    $("temps-lecture").value = article.temps_lecture || "";
    $("description").value = article.description || "";
    $("meta-title").value = article.meta_title || "";
    $("meta-description").value = article.meta_description || "";
    $("tags").value = (article.tags || []).join(", ");
    $("disciplines").value = (article.disciplines || []).join(", ");
    $("motscles").value = (article.motscles || []).join(", ");
    editor.innerHTML = showImages(article.corps || "");
    notesEditor.innerHTML = article.notes || "";
    images.forEach((image) => URL.revokeObjectURL(image.url));
    images.length = 0;
    renderImageList();
    slugEdited = true;
    updatePreview();
  };

  const loadArticleForEdit = async (file) => {
    const token = tokenInput.value.trim();
    if (!token) {
      listStatus.textContent = "Jeton requis pour charger un article.";
      return;
    }
    if (hasUnsavedWork() && !window.confirm("Abandonner le travail en cours et charger cet article ?")) return;
    listStatus.textContent = `Chargement de ${file.name}…`;
    try {
      const current = await getFile(file.path, token);
      const article = JSON.parse(current.text);
      resetForm(true);
      populateForm(article);
      editing = {
        kind: "article",
        path: file.path,
        sha: current.sha,
        slug: article.slug,
        publie_le: article.publie_le || "",
        avenir: Boolean(file.avenir),
      };
      listStatus.textContent = `« ${article.titre} » chargé${file.avenir ? " (article à venir)" : ""}. Modifiez puis enregistrez.`;
      updateFormVisibility();
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      setStatus("");
    } catch (error) {
      listStatus.textContent = `Chargement impossible : ${error.message}.`;
    }
  };

  /* ---------- Supprimer ---------- */
  const imagePathsOf = (corps, slug) => Array.from(new Set(
    Array.from(String(corps).matchAll(/(?:\.\.\/)?(images\/[^"'\s<>)]+)/g), (match) => match[1]),
  )).filter((path) => !path.includes("..") && path.startsWith(`images/${slug}-`));

  const deleteArticle = async (file) => {
    const token = tokenInput.value.trim();
    if (!token) {
      listStatus.textContent = "Jeton requis pour supprimer un article.";
      return;
    }
    const slug = file.name.replace(/\.json$/, "");
    const question = `Supprimer définitivement l’article « ${slug} » ?\n\n`
      + "Sa page sera retirée du site après la prochaine génération (1 à 2 minutes).";
    if (!window.confirm(question)) return;
    listStatus.textContent = `Suppression de ${file.name}…`;
    try {
      const current = await getFile(file.path, token);
      const article = JSON.parse(current.text);
      const paths = imagePathsOf(article.corps, slug);
      const withImages = paths.length > 0
        && window.confirm(`Supprimer aussi les ${paths.length} image${paths.length > 1 ? "s" : ""} de cet article (dossier images/) ?`);
      await deleteFile(file.path, token, `Suppression de l’article ${slug}`, current.sha);
      let removed = 0;
      if (withImages) {
        for (const path of paths) {
          const sha = await getSha(path, token);
          if (!sha) continue;
          await deleteFile(path, token, `Suppression de l’image ${path}`, sha);
          removed += 1;
        }
      }
      if (editing && editing.path === file.path) resetForm(true);
      await finishList(`« ${slug} » supprimé${removed ? ` avec ${removed} image${removed > 1 ? "s" : ""}` : ""} ; GitHub Actions retire sa page.`);
    } catch (error) {
      listStatus.textContent = `Suppression impossible : ${error.message}.`;
    }
  };

  /* ---------- Publier tout de suite un article à venir ---------- */
  const promoteNow = async (file) => {
    const token = tokenInput.value.trim();
    if (!token) {
      listStatus.textContent = "Jeton requis pour publier un article.";
      return;
    }
    const slug = file.name.replace(/\.json$/, "");
    if (!window.confirm(`Publier « ${slug} » maintenant ?\n\nSa date sera remplacée par celle d’aujourd’hui.`)) return;
    listStatus.textContent = `Publication de ${file.name}…`;
    try {
      const target = `${DATA_FOLDER}/${file.name}`;
      if (await pathExists(target, token)) throw new Error(`un article « ${slug} » est déjà publié`);
      const current = await getFile(file.path, token);
      const article = JSON.parse(current.text);
      article.date = todayString();
      article.publie_le = new Date().toISOString();
      await putFile(
        target,
        token,
        `Publication de l’article ${slug}`,
        new TextEncoder().encode(`${JSON.stringify(article, null, 2)}\n`),
      );
      await deleteFile(file.path, token, `Retrait de ${slug} des articles à venir`, current.sha);
      if (editing && editing.path === file.path) resetForm(true);
      await finishList(`« ${slug} » publié ; GitHub Actions génère sa page (1 à 2 minutes).`);
    } catch (error) {
      listStatus.textContent = `Publication impossible : ${error.message}.`;
    }
  };

  $("charger-liste").addEventListener("click", loadArticleList);

  /* ---------- Édito ---------- */
  const loadEdito = async () => {
    const token = tokenInput.value.trim();
    if (!token) {
      editoStatus.textContent = "Saisissez d’abord un jeton GitHub ci-dessus.";
      return;
    }
    if (editing && dirty && !window.confirm("Recharger l’édito et abandonner les modifications en cours ?")) return;
    editoStatus.textContent = "Chargement de l’édito…";
    try {
      const file = await getFile(EDITO_PATH, token, true);
      let corps = "";
      if (file) {
        const data = JSON.parse(file.text);
        corps = typeof data.corps === "string" ? data.corps : "";
      }
      resetForm(true);
      editor.innerHTML = showImages(corps);
      editing = { kind: "edito", path: EDITO_PATH, sha: file ? file.sha : null };
      updatePreview();
      updateFormVisibility();
      editoStatus.textContent = file
        ? "Édito actuel chargé. Modifiez-le puis enregistrez."
        : "Aucun édito enregistré pour l’instant : rédigez-le puis enregistrez.";
      setStatus("");
    } catch (error) {
      editoStatus.textContent = `Chargement impossible : ${error.message}.`;
    }
  };
  $("charger-edito").addEventListener("click", loadEdito);

  const saveEdito = async (token) => {
    const body = sanitizeElement(editor);
    if (!body.textContent.trim() && !body.querySelector("img")) {
      setStatus("L’édito est vide.", "erreur");
      return;
    }
    if (body.querySelector("a.footnote-ref")) {
      setStatus("Les notes de bas de page ne sont pas disponibles dans l’édito.", "erreur");
      return;
    }
    const used = [];
    const missingAlt = [];
    for (const img of body.querySelectorAll("img[data-upload-id]")) {
      const image = images.find((item) => item.id === img.getAttribute("data-upload-id"));
      if (!image) {
        setStatus("Une image du texte n’est associée à aucun fichier. Retirez-la puis réinsérez-la.", "erreur");
        return;
      }
      if (!used.includes(image)) used.push(image);
      if (!image.alt.trim() && !missingAlt.includes(image.file.name)) missingAlt.push(image.file.name);
    }
    if (missingAlt.length) {
      setStatus(`Renseignez une description détaillée pour : ${missingAlt.join(", ")}.`, "erreur");
      return;
    }

    publishing = true;
    publishButton.disabled = true;
    let uploadedSome = false;
    try {
      const paths = await uploadImages("edito", token, used);
      uploadedSome = paths.size > 0;
      // L'accueil est à la racine : les images y sont référencées sans « ../ ».
      applyUploadedImages(body, paths, "");
      body.querySelectorAll("img[src^='./images/'], img[src^='../images/']").forEach((img) => {
        img.setAttribute("src", img.getAttribute("src").replace(/^(?:\.\.?\/)/, ""));
      });
      // Même style de lien que dans le reste de l'accueil.
      body.querySelectorAll("a").forEach((anchor) => anchor.classList.add("lien"));
      const json = `${JSON.stringify({ corps: serializeBlocks(body), maj: new Date().toISOString() }, null, 2)}\n`;
      setStatus("Enregistrement de l’édito sur GitHub…");
      await putFile(EDITO_PATH, token, "Mise à jour de l’édito", new TextEncoder().encode(json), editing.sha);
      dirty = false;
      await loadEdito();
      setStatus("Édito enregistré ! GitHub Actions va mettre à jour l’accueil (1 à 2 minutes).", "succes");
    } catch (error) {
      const partial = uploadedSome
        ? " Certaines images ont déjà été ajoutées dans images/ ; elles seront renvoyées sous un autre nom lors d’un nouvel essai."
        : "";
      setStatus(`Enregistrement impossible : ${error.message}.${partial}`, "erreur");
    } finally {
      publishing = false;
      publishButton.disabled = false;
    }
  };

  /* ---------- Publier, programmer ou enregistrer un article ---------- */
  const saveArticle = async (token) => {
    let prepared;
    try {
      prepared = buildArticle();
    } catch (error) {
      setStatus(error.message, "erreur");
      return;
    }
    const { article, body, list, used } = prepared;
    if (mode === "modifier" && article.slug !== editing.slug) {
      setStatus("Le slug ne peut pas être modifié en mode édition.", "erreur");
      return;
    }
    if (mode === "avenir" && article.date <= todayString()
      && !window.confirm("Cette date est déjà atteinte : l’article sera publié dès la prochaine génération (quelques minutes). Continuer ?")) {
      return;
    }

    publishing = true;
    publishButton.disabled = true;
    let uploadedSome = false;

    try {
      let dataPath;
      let sha = null;
      let verb;

      if (mode === "modifier") {
        dataPath = editing.path;
        sha = editing.sha;
        verb = "Mise à jour";
      } else {
        const folder = mode === "avenir" ? AVENIR_FOLDER : DATA_FOLDER;
        dataPath = `${folder}/${article.slug}.json`;
        setStatus("Vérification du dépôt et du slug…");
        if (await pathExists(dataPath, token)) {
          throw new Error(`le slug « ${article.slug} » existe déjà dans ${folder}/. Choisissez-en un autre`);
        }
        const otherFolder = mode === "avenir" ? DATA_FOLDER : AVENIR_FOLDER;
        if (await pathExists(`${otherFolder}/${article.slug}.json`, token)) {
          throw new Error(`le slug « ${article.slug} » existe déjà dans ${otherFolder}/. Choisissez-en un autre`);
        }
        if (mode === "nouveau" && await pathExists(`articles/${article.slug}.html`, token)) {
          throw new Error(`une page articles/${article.slug}.html existe déjà. Choisissez un autre slug`);
        }
        verb = mode === "avenir" ? "Programmation" : "Publication";
      }

      const paths = await uploadImages(article.slug, token, used);
      uploadedSome = paths.size > 0;
      applyUploadedImages(body, paths, "../");
      // Images déjà publiées : affichées avec « ./ » dans l'éditeur, rétablies en « ../ » pour la page de l'article.
      body.querySelectorAll("img[src^='./images/']").forEach((img) => {
        img.setAttribute("src", `.${img.getAttribute("src")}`);
      });

      if (mode === "modifier") article.publie_le = editing.publie_le;
      else if (mode === "avenir") article.publie_le = "";
      else article.publie_le = new Date().toISOString();
      article.corps = serializeBlocks(body);
      article.notes = list && list.children.length
        ? `<ol>\n${Array.from(list.children).map((item) => item.outerHTML).join("\n")}\n</ol>`
        : "";

      setStatus(`${verb} de l’article sur GitHub…`);
      const json = `${JSON.stringify(article, null, 2)}\n`;
      await putFile(dataPath, token, `${verb} de l’article ${article.slug}`, new TextEncoder().encode(json), sha);

      if (mode === "modifier") {
        resetForm(true);
        await finishList("Article mis à jour ; GitHub Actions va régénérer sa page et les listes (1 à 2 minutes).");
      } else {
        resetForm(false);
        setStatus(
          mode === "avenir"
            ? `Article programmé dans ${AVENIR_FOLDER}/. Il sera publié automatiquement à partir de sa date (génération quotidienne à 6 h UTC).`
            : "Article envoyé ! GitHub Actions va générer sa page et mettre à jour l’accueil et la liste des articles ; comptez une à deux minutes.",
          "succes",
        );
      }
    } catch (error) {
      const partial = uploadedSome
        ? " Certaines images ont déjà été ajoutées dans images/ ; elles seront renvoyées sous un autre nom lors d’un nouvel essai."
        : "";
      setStatus(`Publication impossible : ${error.message}.${partial}`, "erreur");
    } finally {
      publishing = false;
      publishButton.disabled = false;
    }
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (publishing) return;
    if ((mode === "modifier" || mode === "edito") && !editing) {
      setStatus(mode === "edito"
        ? "Chargez d’abord l’édito actuel."
        : "Choisissez d’abord un article à modifier dans la liste ci-dessus.", "erreur");
      return;
    }
    const token = tokenInput.value.trim();
    if (!token) {
      setStatus("Saisissez un jeton GitHub ci-dessus pour continuer.", "erreur");
      return;
    }
    if (mode === "edito") {
      await saveEdito(token);
      return;
    }
    if (!form.reportValidity()) return;
    await saveArticle(token);
  });

  /* ---------- Onglets ---------- */
  const switchMode = (newMode) => {
    if (mode === newMode) return;
    if (hasUnsavedWork() && !window.confirm("Abandonner le travail en cours et changer d’onglet ?")) return;

    resetForm(true);
    mode = newMode;
    tabButtons.forEach((tab) => {
      const active = tab.dataset.mode === mode;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    picker.hidden = mode !== "modifier";
    editoPanel.hidden = mode !== "edito";
    heading.textContent = MODE_LABELS[mode].titre;
    publishButton.textContent = MODE_LABELS[mode].bouton;
    updateFormVisibility();
    setStatus("");

    if (mode === "modifier") loadArticleList();
    if (mode === "edito") loadEdito();
  };

  tabButtons.forEach((tab) => {
    tab.addEventListener("click", () => switchMode(tab.dataset.mode));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = tabButtons.indexOf(tab);
      let nextIndex;
      if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
      else if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabButtons.length;
      else if (event.key === "Home") nextIndex = 0;
      else nextIndex = tabButtons.length - 1;
      tabButtons[nextIndex].focus();
      switchMode(tabButtons[nextIndex].dataset.mode);
    });
  });

  window.addEventListener("beforeunload", (event) => {
    if (publishing || hasUnsavedWork()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  renderImageList();
  updatePreview();
  updateFormVisibility();
})();