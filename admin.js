(() => {
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
    "A", "B", "BLOCKQUOTE", "BR", "CAPTION", "DIV", "EM", "FIGCAPTION", "FIGURE",
    "H2", "H3", "H4", "HR", "I", "IMG", "LI", "OL", "P", "STRONG", "SUB", "SUP",
    "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "UL",
  ]);
  const BLOCK_TAGS = new Set([
    "BLOCKQUOTE", "DIV", "FIGURE", "H2", "H3", "H4", "HR", "OL", "P", "TABLE", "UL",
  ]);
  const editor = document.getElementById("corps");
  const notesEditor = document.getElementById("notes");
  const form = document.getElementById("formulaire-article");
  const tokenInput = document.getElementById("jeton");
  const imageInput = document.getElementById("fichiers-images");
  const imageList = document.getElementById("liste-images");
  const status = document.getElementById("statut-publication");
  const publishButton = document.getElementById("publier");
  const preview = document.getElementById("apercu-corps");
  const notesPreview = document.getElementById("apercu-notes");
  let queuedImages = [];
  const imageDescriptions = new Map();
  const imagePreviewUrls = new Map();
  let savedSelection = null;
  let activeEditor = editor;
  let slugEdited = false;
  let imagesWereUploaded = false;

  const setToday = () => {
    const now = new Date();
    document.getElementById("date").value = [
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
    .replace(/^-|-$/g, "");

  document.getElementById("titre").addEventListener("input", (event) => {
    if (!slugEdited) document.getElementById("slug").value = slugify(event.target.value);
  });
  document.getElementById("slug").addEventListener("input", () => {
    slugEdited = true;
  });

  const rememberSelection = (event) => {
    if ([editor, notesEditor].includes(event?.currentTarget)) activeEditor = event.currentTarget;
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !activeEditor.contains(selection.anchorNode)) return;
    savedSelection = selection.getRangeAt(0).cloneRange();
  };
  [editor, notesEditor].forEach((editable) => {
    editable.addEventListener("keyup", rememberSelection);
    editable.addEventListener("mouseup", rememberSelection);
  });
  editor.addEventListener("input", () => {
    rememberSelection({ currentTarget: editor });
    editor.querySelectorAll("p[data-image-followup]").forEach((paragraph) => {
      if (!paragraph.textContent.trim()) return;
      paragraph.removeAttribute("data-image-followup");
      if (paragraph.lastElementChild?.tagName === "BR") paragraph.lastElementChild.remove();
    });
    updatePreview();
  });
  notesEditor.addEventListener("input", () => rememberSelection({ currentTarget: notesEditor }));

  const restoreSelection = () => {
    activeEditor.focus();
    const selection = window.getSelection();
    if (!selection || !savedSelection) return;
    selection.removeAllRanges();
    selection.addRange(savedSelection);
  };

  document.querySelectorAll("[data-commande]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      restoreSelection();
      const command = button.dataset.commande;
      if (command === "createLink") {
        const href = window.prompt("Adresse du lien (https://…)");
        if (!href) return;
        document.execCommand(command, false, href);
      } else {
        document.execCommand(command, false);
      }
      rememberSelection();
      updatePreview();
    });
  });

  document.querySelectorAll("[data-bloc]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      restoreSelection();
      document.execCommand("formatBlock", false, `<${button.dataset.bloc}>`);
      rememberSelection();
      updatePreview();
    });
  });

  document.getElementById("ajouter-image").addEventListener("mousedown", rememberSelection);
  document.getElementById("ajouter-image").addEventListener("click", () => imageInput.click());

  const insertAtSelection = (target, node) => {
    const selection = window.getSelection();
    if (savedSelection && selection && target.contains(savedSelection.startContainer)) {
      selection.removeAllRanges();
      selection.addRange(savedSelection);
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      savedSelection = range.cloneRange();
      target.focus();
      activeEditor = target;
      return true;
    }
    return false;
  };

  const appendBlock = (node) => {
    editor.append(node);
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedSelection = range.cloneRange();
    activeEditor = editor;
  };

  document.getElementById("ajouter-annexe").addEventListener("click", () => {
    if (editor.querySelector("#annexe")) {
      setStatus("Une annexe existe déjà dans le corps de l’article.", "erreur");
      return;
    }
    const heading = document.createElement("h2");
    heading.id = "annexe";
    heading.textContent = "Annexe";
    const paragraph = document.createElement("p");
    paragraph.append(document.createElement("br"));
    editor.append(heading, paragraph);
    const range = document.createRange();
    range.setStart(paragraph, 0);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedSelection = range.cloneRange();
    editor.focus();
    updatePreview();
    setStatus("");
  });

  document.getElementById("ajouter-sources").addEventListener("click", () => {
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
    appendBlock(heading);
    editor.append(list);
    updatePreview();
    setStatus("");
  });

  const addNote = (referenceText = "Référence à compléter.") => {
    restoreSelection();
    const selection = window.getSelection();
    if (!savedSelection || !selection || !editor.contains(savedSelection.startContainer)) {
      setStatus("Placez d’abord le curseur dans le corps de l’article, à l’endroit de l’appel de note.", "erreur");
      return false;
    }
    const numbers = Array.from(notesEditor.querySelectorAll("li[id^='fn']"))
      .map((item) => Number(item.id.slice(2)))
      .filter(Number.isInteger);
    const number = Math.max(0, ...numbers) + 1;
    const reference = document.createElement("a");
    reference.href = `#fn${number}`;
    reference.className = "footnote-ref";
    reference.id = `fnref${number}`;
    reference.setAttribute("role", "doc-noteref");
    const superscript = document.createElement("sup");
    superscript.textContent = String(number);
    reference.append(superscript);
    if (!insertAtSelection(editor, reference)) {
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
    item.append(document.createTextNode(`${referenceText.trim()} `));
    const backlink = document.createElement("a");
    backlink.href = `#fnref${number}`;
    backlink.className = "footnote-back";
    backlink.setAttribute("role", "doc-backlink");
    backlink.setAttribute("aria-label", "Revenir à l’appel de note");
    backlink.title = "Revenir à l’appel de note";
    backlink.textContent = "↩";
    item.append(backlink);
    list.append(item);
    activeEditor = notesEditor;
    notesEditor.focus();
    updatePreview();
    setStatus(
      referenceText.trim()
        ? "Appel et référence de note ajoutés."
        : "Appel et note ajoutés. Remplacez « Référence à compléter » par la référence.",
      "succes",
    );
    return true;
  };
  document.getElementById("ajouter-note").addEventListener("mousedown", (event) => event.preventDefault());
  document.getElementById("ajouter-note").addEventListener("click", () => addNote());

  document.getElementById("ajouter-tableau").addEventListener("click", () => {
    const wrapper = document.createElement("div");
    wrapper.className = "tableau-defile";
    const table = document.createElement("table");
    table.className = "texte";
    const caption = document.createElement("caption");
    caption.textContent = "Titre du tableau";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    ["Colonne 1", "Colonne 2"].forEach((label) => {
      const cell = document.createElement("th");
      cell.textContent = label;
      headRow.append(cell);
    });
    head.append(headRow);
    const body = document.createElement("tbody");
    const row = document.createElement("tr");
    ["Valeur", "Valeur"].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
    table.append(caption, head, body);
    wrapper.append(table);
    appendBlock(wrapper);
    updatePreview();
    setStatus("");
  });

  document.querySelectorAll("[data-formule]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById("latex-formule");
      const latex = input.value.trim();
      if (!latex) {
        setStatus("Saisissez d’abord une formule LaTeX.", "erreur");
        input.focus();
        return;
      }
      const formula = document.createElement("div");
      formula.className = button.dataset.formule;
      formula.textContent = `\\[ ${latex.trim()} \\]`;
      appendBlock(formula);
      input.value = "";
      updatePreview();
      setStatus("");
    });
  });

  const contextMenu = document.getElementById("menu-contextuel");
  const advancedContextMenu = document.getElementById("menu-contextuel-avance");
  const advancedContextToggle = document.getElementById("menu-options-avancees");
  const closeContextMenu = () => {
    contextMenu.hidden = true;
    advancedContextMenu.hidden = true;
    advancedContextToggle.setAttribute("aria-expanded", "false");
    advancedContextToggle.textContent = "Options avancées ▸";
  };
  const openContextMenu = (event) => {
    const selection = window.getSelection();
    const selectionInsideEditor = selection?.rangeCount
      && !selection.isCollapsed
      && editor.contains(selection.anchorNode)
      && editor.contains(selection.focusNode);
    if (selectionInsideEditor) {
      savedSelection = selection.getRangeAt(0).cloneRange();
    } else {
      const pointRange = document.caretRangeFromPoint?.(event.clientX, event.clientY);
      if (pointRange && editor.contains(pointRange.startContainer)) {
        pointRange.collapse(true);
        savedSelection = pointRange.cloneRange();
      } else if (selection?.rangeCount && editor.contains(selection.anchorNode)) {
        savedSelection = selection.getRangeAt(0).cloneRange();
      }
    }
    activeEditor = editor;
    event.preventDefault();
    advancedContextMenu.hidden = true;
    advancedContextToggle.setAttribute("aria-expanded", "false");
    advancedContextToggle.textContent = "Options avancées ▸";
    contextMenu.hidden = false;
    const bounds = contextMenu.getBoundingClientRect();
    contextMenu.style.left = `${Math.max(8, Math.min(event.clientX, innerWidth - bounds.width - 8))}px`;
    contextMenu.style.top = `${Math.max(8, Math.min(event.clientY, innerHeight - bounds.height - 8))}px`;
    contextMenu.querySelector("button[role='menuitem']").focus();
  };

  editor.addEventListener("contextmenu", openContextMenu);
  contextMenu.addEventListener("mousedown", (event) => {
    if (event.target instanceof HTMLInputElement) return;
    event.preventDefault();
  });
  contextMenu.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target === advancedContextToggle) {
      const expanded = target.getAttribute("aria-expanded") !== "true";
      target.setAttribute("aria-expanded", String(expanded));
      target.textContent = expanded ? "Options avancées ▾" : "Options avancées ▸";
      advancedContextMenu.hidden = !expanded;
      if (expanded) advancedContextMenu.querySelector("button")?.focus();
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
      document.getElementById("latex-formule").value = document.getElementById("menu-latex-formule").value;
      document.querySelector(`[data-formule="${target.dataset.contextFormule}"]`).click();
      if (status.dataset.type !== "erreur") closeContextMenu();
      return;
    }
    if (target.dataset.contextTarget) {
      document.querySelector(target.dataset.contextTarget).click();
      closeContextMenu();
    }
  });
  contextMenu.addEventListener("keydown", (event) => {
    const items = Array.from(contextMenu.querySelectorAll("button[role='menuitem']:not(:disabled)"))
      .filter((item) => item.getClientRects().length > 0);
    const currentIndex = items.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeContextMenu();
      editor.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      items[(currentIndex + direction + items.length) % items.length]?.focus();
    } else if (event.key === "ArrowRight" && document.activeElement === advancedContextToggle) {
      event.preventDefault();
      advancedContextToggle.click();
    } else if (event.key === "ArrowLeft" && !advancedContextMenu.hidden) {
      event.preventDefault();
      advancedContextToggle.click();
      advancedContextToggle.focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!contextMenu.hidden && !contextMenu.contains(event.target)) closeContextMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !contextMenu.hidden) {
      closeContextMenu();
      editor.focus();
    }
  });
  window.addEventListener("resize", closeContextMenu);
  window.addEventListener("scroll", closeContextMenu, true);

  const renderImageList = () => {
    imageList.replaceChildren();
    queuedImages.forEach((file, index) => {
      const row = document.createElement("div");
      row.className = "admin-image";
      const name = document.createElement("span");
      const size = file.size >= 1024 * 1024
        ? `${(file.size / 1024 / 1024).toFixed(1)} Mo`
        : `${(file.size / 1024).toFixed(1)} Ko`;
      name.textContent = `${file.name} (${size})`;
      const fields = document.createElement("div");
      fields.className = "admin-image-fields";
      const descriptionLabel = document.createElement("label");
      descriptionLabel.textContent = "Description de l’image (obligatoire)";
      const description = document.createElement("input");
      description.type = "text";
      description.required = true;
      description.maxLength = 500;
      description.value = imageDescriptions.get(file)?.alt || "";
      description.addEventListener("input", () => {
        const values = imageDescriptions.get(file) || { alt: "", caption: "" };
        values.alt = description.value.trim();
        imageDescriptions.set(file, values);
        const image = editor.querySelector(`[data-upload-index="${index}"]`);
        if (image) image.alt = values.alt;
        updatePreview();
      });
      descriptionLabel.append(description);
      const captionLabel = document.createElement("label");
      captionLabel.textContent = "Légende (facultative)";
      const caption = document.createElement("input");
      caption.type = "text";
      caption.maxLength = 300;
      caption.value = imageDescriptions.get(file)?.caption || "";
      caption.addEventListener("input", () => {
        const values = imageDescriptions.get(file) || { alt: "", caption: "" };
        values.caption = caption.value.trim();
        imageDescriptions.set(file, values);
        const image = editor.querySelector(`[data-upload-index="${index}"]`);
        const figureCaption = image?.closest("figure")?.querySelector("figcaption");
        if (figureCaption) figureCaption.textContent = values.caption;
        updatePreview();
      });
      captionLabel.append(caption);
      fields.append(descriptionLabel, captionLabel);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Retirer";
      remove.setAttribute("aria-label", `Retirer ${file.name}`);
      remove.addEventListener("click", () => {
        editor.querySelectorAll("[data-upload-index]").forEach((image) => {
          const currentIndex = Number(image.dataset.uploadIndex);
          if (currentIndex === index) image.closest("figure")?.remove();
          else if (currentIndex > index) image.dataset.uploadIndex = String(currentIndex - 1);
        });
        queuedImages.splice(index, 1);
        imageDescriptions.delete(file);
        renderImageList();
        updatePreview();
      });
      row.append(name, fields, remove);
      imageList.append(row);
    });
  };

  imageInput.addEventListener("change", () => {
    const files = Array.from(imageInput.files || []);
    imageInput.value = "";
    const validFiles = [];
    const rejectedFiles = [];
    for (const file of files) {
      if (!IMAGE_EXTENSIONS[file.type]) {
        rejectedFiles.push(`Format non pris en charge pour « ${file.name} ». Utilisez PNG, JPEG, GIF ou WebP.`);
      } else if (file.size > MAX_IMAGE_BYTES) {
        rejectedFiles.push(`« ${file.name} » dépasse la limite de 10 Mo.`);
      } else {
        validFiles.push(file);
      }
    }

    if (!validFiles.length) {
      if (rejectedFiles.length) setStatus(rejectedFiles.join(" "), "erreur");
      return;
    }
    restoreSelection();
    for (const file of validFiles) {
      const index = queuedImages.push(file) - 1;
      imageDescriptions.set(file, { alt: "", caption: "" });
      const figure = document.createElement("figure");
      figure.dataset.uploadName = file.name;
      const image = document.createElement("img");
      image.dataset.uploadIndex = String(index);
      image.alt = "";
      const caption = document.createElement("figcaption");
      caption.textContent = "";
      figure.append(image, caption);
      const paragraph = document.createElement("p");
      paragraph.dataset.imageFollowup = "";
      paragraph.append(document.createElement("br"));
      editor.append(figure, paragraph);
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      savedSelection = range.cloneRange();
      activeEditor = editor;
    }
    renderImageList();
    updatePreview();
    setStatus(rejectedFiles.length
      ? `${rejectedFiles.join(" ")} Les autres images ont été ajoutées.`
      : "");
  });

  const safeHref = (value) => {
    const href = value.trim();
    if (/^(?:https?:\/\/[^\s]+|mailto:[^\s]+|#[^\s]*|\/(?!\/)[^\s]*|\.\.?\/[^\s]*)$/i.test(href)) return href;
    return "";
  };

  const safeImageSrc = (value) => {
    const src = value.trim();
    if (/^(?:https?:\/\/[^\s]+|\/(?!\/)[^\s]*|\.\.?\/[^\s]*)$/i.test(src)) return src;
    return "";
  };

  const allowedClasses = new Set([
    "footnote-back", "footnote-ref", "formule", "large", "numerotee",
    "tableau-defile", "texte", "total",
  ]);
  const cleanNode = (node, destination) => {
    if (node.nodeType === Node.TEXT_NODE) {
      destination.append(document.createTextNode(node.nodeValue || ""));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const source = node;
    if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "SVG", "MATH"].includes(source.tagName)) return;
    if (!ALLOWED_TAGS.has(source.tagName)) {
      source.childNodes.forEach((child) => cleanNode(child, destination));
      return;
    }
    const clean = document.createElement(source.tagName.toLowerCase());
    if (source.tagName === "A") {
      const href = safeHref(source.getAttribute("href") || "");
      if (href) clean.setAttribute("href", href);
      clean.setAttribute("rel", "noopener noreferrer");
      const id = source.getAttribute("id") || "";
      if (/^fnref[1-9]\d*$/.test(id)) clean.id = id;
      const className = source.getAttribute("class") || "";
      if (allowedClasses.has(className)) clean.className = className;
      const role = source.getAttribute("role");
      if (role === "doc-noteref" || role === "doc-backlink") clean.setAttribute("role", role);
      if (className === "footnote-back") {
        clean.setAttribute("aria-label", "Revenir à l’appel de note");
        clean.title = "Revenir à l’appel de note";
      }
    } else if (source.tagName === "IMG") {
      const uploadIndex = source.getAttribute("data-upload-index");
      const src = source.getAttribute("src") || "";
      if (uploadIndex !== null && /^\d+$/.test(uploadIndex)) {
        clean.setAttribute("data-upload-index", uploadIndex);
      } else {
        const safeSrc = safeImageSrc(src);
        if (safeSrc) clean.setAttribute("src", safeSrc);
      }
      clean.setAttribute("alt", source.getAttribute("alt") || "");
      clean.setAttribute("loading", "lazy");
    } else if (source.tagName === "LI") {
      const id = source.getAttribute("id") || "";
      if (/^fn[1-9]\d*$/.test(id)) clean.id = id;
    } else if (source.tagName === "H2") {
      const id = source.getAttribute("id") || "";
      if (id === "annexe" || id === "sources") clean.id = id;
    }
    const className = source.getAttribute("class") || "";
    if (source.tagName !== "A" && source.tagName !== "LI" && allowedClasses.has(className)) {
      clean.className = className;
    }
    source.childNodes.forEach((child) => cleanNode(child, clean));
    destination.append(clean);
  };

  const sanitizeEditor = (sourceEditor) => {
    const parsed = new DOMParser().parseFromString(sourceEditor.innerHTML, "text/html");
    const container = document.createElement("div");
    parsed.body.childNodes.forEach((node) => cleanNode(node, container));
    container.querySelectorAll("p").forEach((paragraph) => {
      if (!paragraph.textContent.trim() && !paragraph.querySelector("img")) paragraph.remove();
    });
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
  };
  const sanitizedBody = () => sanitizeEditor(editor);
  const sanitizedNotes = () => sanitizeEditor(notesEditor);

  const normalizeFootnoteId = (value) => value
    .replace(/^#/, "")
    .replace(/^_+/, "")
    .replace(/^ftn/i, "")
    .toLowerCase();

  editor.addEventListener("paste", (event) => {
    const clipboardHtml = event.clipboardData?.getData("text/html");
    if (!clipboardHtml) return;

    const pasted = new DOMParser().parseFromString(clipboardHtml, "text/html");
    const footnoteBlocks = Array.from(pasted.body.querySelectorAll("[id]")).filter((node) => {
      const style = node.getAttribute("style") || "";
      return /mso-element:\s*(?:footnote|endnote)/i.test(style)
        || /^(?:_)?(?:ftn|endnote)\d+$/i.test(node.id);
    });
    if (!footnoteBlocks.length) return;

    const blockIds = new Set(footnoteBlocks.map((block) => normalizeFootnoteId(block.id)));
    const footnotes = new Map(footnoteBlocks.map((block) => [
      normalizeFootnoteId(block.id),
      block,
    ]));
    const references = Array.from(pasted.body.querySelectorAll("a")).filter((anchor) => {
      if (footnoteBlocks.some((block) => block.contains(anchor))) return false;
      const href = anchor.getAttribute("href") || "";
      const footnoteId = href.startsWith("#") ? normalizeFootnoteId(href) : "";
      return blockIds.has(footnoteId)
        || /mso-footnote-id\s*:/i.test(anchor.getAttribute("style") || "");
    });
    if (!references.length) return;

    const existingNumbers = Array.from(notesEditor.querySelectorAll("li[id^='fn']"))
      .map((item) => Number(item.id.slice(2)))
      .filter(Number.isInteger);
    let number = Math.max(0, ...existingNumbers);
    const importedNotes = new Map();

    references.forEach((sourceReference) => {
      const href = sourceReference.getAttribute("href") || "";
      const styleId = (sourceReference.getAttribute("style") || "")
        .match(/mso-footnote-id\s*:\s*([^;\s]+)/i)?.[1];
      const footnoteId = normalizeFootnoteId(styleId || href);
      const sourceNote = footnotes.get(footnoteId);
      if (!sourceNote) return;

      let noteNumber = importedNotes.get(footnoteId);
      if (!noteNumber) {
        noteNumber = ++number;
        importedNotes.set(footnoteId, noteNumber);
      }

      const reference = pasted.createElement("a");
      reference.href = `#fn${noteNumber}`;
      reference.className = "footnote-ref";
      reference.id = `fnref${noteNumber}`;
      reference.setAttribute("role", "doc-noteref");
      const superscript = pasted.createElement("sup");
      superscript.textContent = String(noteNumber);
      reference.append(superscript);
      sourceReference.replaceWith(reference);
    });

    if (!importedNotes.size) {
      return;
    }

    event.preventDefault();
    footnoteBlocks.forEach((block) => block.remove());
    const pastedContent = document.createElement("div");
    pasted.body.childNodes.forEach((node) => cleanNode(node, pastedContent));

    const selection = window.getSelection();
    const pasteRange = selection?.rangeCount && editor.contains(selection.anchorNode)
      ? selection.getRangeAt(0).cloneRange()
      : savedSelection;
    if (pasteRange && selection && editor.contains(pasteRange.startContainer)) {
      selection.removeAllRanges();
      selection.addRange(pasteRange);
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const insertedNodes = Array.from(pastedContent.childNodes);
      range.insertNode(pastedContent);
      const lastNode = insertedNodes.at(-1);
      if (lastNode) {
        range.setStartAfter(lastNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        savedSelection = range.cloneRange();
      }
    } else {
      editor.append(pastedContent);
    }

    let list = notesEditor.querySelector("ol");
    if (!list) {
      list = document.createElement("ol");
      notesEditor.replaceChildren(list);
    }
    importedNotes.forEach((noteNumber, footnoteId) => {
      const sourceNote = footnotes.get(footnoteId);
      const item = document.createElement("li");
      item.id = `fn${noteNumber}`;
      const sourceContent = sourceNote.cloneNode(true);
      sourceContent.querySelectorAll("a").forEach((anchor) => {
        if (/mso-footnote-id\s*:/i.test(anchor.getAttribute("style") || "")
          || /^#_?ftnref/i.test(anchor.getAttribute("href") || "")
          || /^_?ftn\d+$/i.test(anchor.getAttribute("name") || "")) {
          anchor.remove();
        }
      });
      const paragraphs = Array.from(sourceContent.querySelectorAll("p"));
      if (paragraphs.length) {
        paragraphs.forEach((paragraph, paragraphIndex) => {
          if (paragraphIndex) item.append(document.createElement("br"));
          paragraph.childNodes.forEach((node) => cleanNode(node, item));
        });
      } else {
        sourceContent.childNodes.forEach((node) => cleanNode(node, item));
      }
      while (item.firstChild?.nodeType === Node.TEXT_NODE
        && !item.firstChild.textContent.trim()) {
        item.firstChild.remove();
      }
      const backlink = document.createElement("a");
      backlink.href = `#fnref${noteNumber}`;
      backlink.className = "footnote-back";
      backlink.setAttribute("role", "doc-backlink");
      backlink.setAttribute("aria-label", "Revenir à l’appel de note");
      backlink.title = "Revenir à l’appel de note";
      backlink.textContent = "↩";
      item.append(backlink);
      list.append(item);
    });

    activeEditor = editor;
    rememberSelection({ currentTarget: editor });
    updatePreview();
    setStatus(
      `${importedNotes.size} note${importedNotes.size === 1 ? "" : "s"} de bas de page importée${importedNotes.size === 1 ? "" : "s"} depuis Word.`,
      "succes",
    );
  });

  const updatePreview = () => {
    const activeFiles = new Set(queuedImages);
    for (const [file, url] of imagePreviewUrls) {
      if (!activeFiles.has(file)) {
        URL.revokeObjectURL(url);
        imagePreviewUrls.delete(file);
      }
    }
    const body = sanitizedBody();
    body.querySelectorAll("img[data-upload-index]").forEach((image) => {
      const file = queuedImages[Number(image.dataset.uploadIndex)];
      if (!file) return;
      if (!imagePreviewUrls.has(file)) imagePreviewUrls.set(file, URL.createObjectURL(file));
      image.setAttribute("src", imagePreviewUrls.get(file));
    });
    preview.replaceChildren(body);
    notesPreview.replaceChildren(sanitizedNotes());
    if (typeof window.renderMathInElement === "function") {
      window.renderMathInElement(preview, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false },
        ],
        throwOnError: false,
      });
    }
  };

  const setStatus = (message, type = "") => {
    status.textContent = message;
    if (type) status.dataset.type = type;
    else delete status.dataset.type;
  };

  const parseList = (value) => value.split(",").map((item) => item.trim()).filter(Boolean);

  const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

  const apiRequest = async (path, token, options = {}) => {
    const response = await fetch(`${API_ROOT}${encodePath(path)}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    const responseBody = await response.json();
    if (!response.ok) {
      const detail = responseBody.message || `Erreur HTTP ${response.status}`;
      throw new Error(detail);
    }
    return responseBody;
  };

  const pathExists = async (path, token) => {
    const response = await fetch(`${API_ROOT}${encodePath(path)}?ref=${encodeURIComponent(BRANCH)}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (response.status === 404) return false;
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.message || `Vérification impossible (HTTP ${response.status}).`);
    }
    return true;
  };

  const encodeBase64 = (bytes) => {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  };

  const safeFilename = (name) => {
    const base = slugify(name.replace(/\.[^.]+$/, "")) || "image";
    return base;
  };

  const uploadImages = async (slug, token) => {
    const paths = [];
    for (let index = 0; index < queuedImages.length; index += 1) {
      const file = queuedImages[index];
      const baseName = safeFilename(file.name);
      const extension = IMAGE_EXTENSIONS[file.type];
      const numbered = `${slug}-${String(index + 1).padStart(2, "0")}-${baseName}.${extension}`;
      let candidate = `images/${numbered}`;
      const base = numbered.slice(0, -(extension.length + 1));
      let suffix = 2;
      while (await pathExists(candidate, token)) {
        candidate = `images/${base}-${suffix}.${extension}`;
        suffix += 1;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      await apiRequest(candidate, token, {
        method: "PUT",
        body: JSON.stringify({
          message: `Ajout de l’image ${candidate}`,
          content: encodeBase64(bytes),
          branch: BRANCH,
        }),
      });
      paths.push(candidate);
      imagesWereUploaded = true;
      setStatus(`Image ${index + 1}/${queuedImages.length} envoyée : ${file.name}`);
    }
    return paths;
  };

  const buildArticle = () => {
    const slug = document.getElementById("slug").value.trim();
    const article = {
      slug,
      titre: document.getElementById("titre").value.trim(),
      soustitre: document.getElementById("soustitre").value.trim(),
      date: document.getElementById("date").value,
      description: document.getElementById("description").value.trim(),
      temps_lecture: document.getElementById("temps-lecture").value.trim(),
      tags: parseList(document.getElementById("tags").value),
      disciplines: parseList(document.getElementById("disciplines").value),
      motscles: parseList(document.getElementById("motscles").value),
      corps: "",
    };
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new Error("Le slug doit contenir uniquement des minuscules non accentuées, chiffres et tirets.");
    }
    if (!article.date || Number.isNaN(Date.parse(`${article.date}T00:00:00`))) {
      throw new Error("La date de publication est invalide.");
    }
    const body = sanitizedBody();
    if (!body.textContent.trim() && !body.querySelector("img")) {
      throw new Error("Ajoutez du texte ou une image au corps de l’article.");
    }
    const bodyImages = Array.from(body.querySelectorAll("img"));
    if (bodyImages.some((image) => !image.getAttribute("alt")?.trim())) {
      throw new Error("Renseignez une description détaillée pour chaque image.");
    }
    if (bodyImages.some((image) => !image.getAttribute("src") && !image.hasAttribute("data-upload-index"))) {
      throw new Error("Une image n’a pas de fichier ou de chemin valide.");
    }
    const notes = sanitizedNotes();
    const footnotes = Array.from(notes.querySelectorAll("li[id^='fn']"));
    const referenceLinks = Array.from(body.querySelectorAll("a.footnote-ref"));
    const referenceIds = new Set();
    const noteIds = new Set();
    for (const reference of referenceLinks) {
      const id = reference.id.replace(/^fnref/, "");
      if (!/^fnref[1-9]\d*$/.test(reference.id) || referenceIds.has(reference.id)) {
        throw new Error("Les appels de notes doivent avoir des numéros uniques. Utilisez le bouton « Ajouter une note ».");
      }
      referenceIds.add(reference.id);
      const note = notes.querySelector(`#fn${id}`);
      if (!note || reference.getAttribute("href") !== `#fn${id}`) {
        throw new Error(`L’appel de note ${id} n’a pas de note correspondante.`);
      }
    }
    for (const note of footnotes) {
      const id = note.id.replace(/^fn/, "");
      if (noteIds.has(note.id)) {
        throw new Error(`Le numéro de note ${id} est utilisé plusieurs fois.`);
      }
      noteIds.add(note.id);
      if (!referenceIds.has(`fnref${id}`) || !note.querySelector(`a[href="#fnref${id}"]`)) {
        throw new Error(`La note ${id} n’a pas d’appel correspondant dans le texte.`);
      }
      if (note.textContent.includes("Référence à compléter.")) {
        throw new Error(`Complétez la référence de la note ${id} avant de publier.`);
      }
    }
    if (notes.textContent.trim() && footnotes.length === 0) {
      throw new Error("La zone des notes contient du texte sans note numérotée. Utilisez le bouton « Ajouter une note ».");
    }
    article.meta_title = document.getElementById("meta-title").value.trim();
    article.meta_description = document.getElementById("meta-description").value.trim();
    article.corps = body.innerHTML;
    article.notes = notes.innerHTML;
    return article;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    let article;
    try {
      article = buildArticle();
    } catch (error) {
      setStatus(error.message, "erreur");
      return;
    }

    const token = tokenInput.value.trim();
    if (!token) {
      setStatus("Saisissez un jeton GitHub pour publier.", "erreur");
      return;
    }
    tokenInput.value = "";
    publishButton.disabled = true;
    setStatus("Vérification du dépôt et du slug…");

    imagesWereUploaded = false;
    try {
      const dataPath = `articles-data/${article.slug}.json`;
      if (await pathExists(dataPath, token)) {
        throw new Error(`Le slug « ${article.slug} » existe déjà dans le dépôt. Choisissez-en un autre.`);
      }
      if (await pathExists(`articles/${article.slug}.html`, token)) {
        throw new Error(`Une page articles/${article.slug}.html existe déjà. Choisissez un autre slug pour éviter de l’écraser.`);
      }

      const imagePaths = await uploadImages(article.slug, token);
      imagesWereUploaded = imagePaths.length > 0;
      editor.querySelectorAll("[data-upload-index]").forEach((image) => {
        const index = Number(image.dataset.uploadIndex);
        const path = imagePaths[index];
        if (path) {
          image.setAttribute("src", `../${path}`);
          image.removeAttribute("data-upload-index");
          image.closest("figure")?.removeAttribute("data-upload-name");
        }
      });
      if (editor.querySelector("[data-upload-index]")) {
        throw new Error("Une image du contenu n’est associée à aucun fichier téléversé.");
      }

      article.corps = sanitizedBody().innerHTML;
      article.notes = sanitizedNotes().innerHTML;
      setStatus("Envoi de l’article sur GitHub…");
      await apiRequest(dataPath, token, {
        method: "PUT",
        body: JSON.stringify({
          message: `Publication de l’article ${article.slug}`,
          content: encodeBase64(new TextEncoder().encode(`${JSON.stringify(article, null, 2)}\n`)),
          branch: BRANCH,
        }),
      });
      setStatus("Article envoyé ! GitHub Actions va générer sa page et ses aperçus. La publication sur le site peut prendre quelques minutes.", "succes");
      form.reset();
      editor.replaceChildren();
      notesEditor.replaceChildren();
      queuedImages = [];
      imageDescriptions.clear();
      renderImageList();
      slugEdited = false;
      setToday();
      updatePreview();
    } catch (error) {
      const partialUpload = imagesWereUploaded
        ? " Certaines images ont peut-être déjà été ajoutées dans images/ ; vous pourrez les réutiliser ou les retirer plus tard."
        : "";
      setStatus(`Publication impossible : ${error.message}.${partialUpload}`, "erreur");
    } finally {
      publishButton.disabled = false;
    }
  });
})();
