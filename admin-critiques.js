(() => {
  "use strict";

  const OWNER = "qzethb";
  const REPOSITORY = "latortuequipense";
  const BRANCH = "main";
  const TOKEN_KEY = "tortue-admin-jeton";
  const API_ROOT = `https://api.github.com/repos/${OWNER}/${REPOSITORY}/contents/`;
  const IMAGE_EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const $ = (id) => document.getElementById(id);
  const tokenInput = $("jeton");
  const rememberInput = $("memoriser");
  const forgetButton = $("oublier");
  const form = $("formulaire-critique");
  const titleInput = $("critique-titre");
  const typeInput = $("critique-type");
  const authorInput = $("critique-auteur");
  const subtitleInput = $("critique-soustitre");
  const dateInput = $("critique-date");
  const slugInput = $("critique-slug");
  const tagsInput = $("critique-tags");
  const disciplinesInput = $("critique-disciplines");
  const categoriesInput = $("critique-categories");
  const reviewInput = $("critique-texte");
  const reviewPreview = $("apercu-texte-critique");
  const previewTitle = $("apercu-titre-critique");
  const previewSubtitle = $("apercu-soustitre-critique");
  const previewDate = $("apercu-date-critique");
  const infoPreviewTitle = $("infos-apercu-titre");
  const infoPreviewSubtitle = $("infos-apercu-soustitre");
  const infoPreviewImage = $("infos-apercu-image");
  const infoPreviewText = $("infos-apercu-texte");
  const infoPreviewLink = $("infos-apercu-lien");
  const infoPreviewDate = $("infos-apercu-date");
  const infoSerpUrl = $("infos-serp-url");
  const infoSerpTitle = $("infos-serp-titre");
  const infoSerpDescription = $("infos-serp-description");
  const previewCover = $("apercu-couverture-critique");
  const previewPage = $("page-apercu-critique");
  const editorLayout = $("critique-editor-layout");
  const contextMenu = $("menu-contextuel-critique");
  const imageInput = $("critique-image");
  const imagePreview = $("apercu-image-critique");
  const imageHelp = $("image-critique-aide");
  const saveButton = $("enregistrer-critique");
  const deleteButton = $("supprimer-critique");
  const status = $("statut-critique");
  const listStatus = $("statut-liste-critiques");
  const list = $("liste-critiques-admin");
  const libraryPanel = $("panneau-modifier-critiques");
  const filterInput = $("filtre-critiques");
  const heading = $("titre-page-critique");
  const intro = $("intro-page-critique");
  const draftState = $("etat-brouillon-critique");
  const changeCritiqueButton = $("changer-critique");
  const tabButtons = Array.from(document.querySelectorAll(".adm-onglets [role='tab']"));
  const stepButtons = Array.from(document.querySelectorAll("[data-critique-etape-bouton]"));
  const stepPanels = Array.from(document.querySelectorAll("[data-critique-etape]"));
  const connectionBadge = $("etat-connexion");

  let editing = null;
  let busy = false;
  let slugEdited = false;
  let previewUrl = "";
  let savedRange = null;
  let mode = "nouveau";
  let dirty = false;

  const setStatus = (message, type = "") => {
    status.textContent = message;
    if (type) status.dataset.type = type;
    else delete status.dataset.type;
  };

  const setListStatus = (message) => { listStatus.textContent = message; };
  const token = () => tokenInput.value.trim();
  const setConnection = (state) => {
    const labels = { absent: "Non connecté", saisi: "Jeton saisi" };
    connectionBadge.dataset.etat = state;
    connectionBadge.textContent = labels[state];
  };
  const refreshState = () => {
    if (dirty) {
      draftState.dataset.etat = "modifie";
      draftState.textContent = editing ? "Modifications non enregistrées" : "Brouillon non envoyé";
    } else if (editing) {
      draftState.dataset.etat = "ok";
      draftState.textContent = "À jour avec GitHub";
    } else {
      draftState.dataset.etat = "vide";
      draftState.textContent = "Aucun contenu";
    }
  };
  const updateFormVisibility = () => {
    const editingCritique = mode === "modifier" && Boolean(editing);
    libraryPanel.hidden = mode !== "modifier" || editingCritique;
    form.hidden = mode === "modifier" && !editing;
    changeCritiqueButton.hidden = !editingCritique;
    deleteButton.hidden = !editingCritique;
    refreshState();
  };
  const showStep = (name) => {
    stepButtons.forEach((button) => {
      const active = button.dataset.critiqueEtapeBouton === name;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    stepPanels.forEach((panel) => { panel.hidden = panel.dataset.critiqueEtape !== name; });
  };
  stepButtons.forEach((button) => {
    button.addEventListener("click", () => showStep(button.dataset.critiqueEtapeBouton));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const next = stepButtons[(stepButtons.indexOf(button) + (event.key === "ArrowRight" ? 1 : -1) + stepButtons.length) % stepButtons.length];
      event.preventDefault();
      next.focus();
      showStep(next.dataset.critiqueEtapeBouton);
    });
  });
  const todayString = () => new Date().toISOString().slice(0, 10);
  const listFromInput = (input) => Array.from(new Set(
    input.value.split(",").map((value) => value.trim()).filter(Boolean),
  ));
  const inputFromList = (value) => Array.isArray(value)
    ? value.filter((item) => typeof item === "string").join(", ")
    : "";
  const ALLOWED_RICH_TAGS = new Set([
    "A", "B", "BLOCKQUOTE", "BR", "DIV", "EM", "H2", "I", "LI", "OL", "P", "STRONG", "SUB", "SUP", "UL",
  ]);
  const DROPPED_RICH_TAGS = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "TEMPLATE"]);
  const safeHref = (value) => /^(?:https?:\/\/[^\s]+|mailto:[^\s]+|#[^\s]*|\/(?!\/)[^\s]*|\.\.?\/[^\s]*)$/i.test(value.trim());
  const cleanRichNode = (node, destination) => {
    if (node.nodeType === Node.TEXT_NODE) {
      destination.append(document.createTextNode(node.nodeValue || ""));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName;
    if (DROPPED_RICH_TAGS.has(tag)) return;
    if (!ALLOWED_RICH_TAGS.has(tag)) {
      node.childNodes.forEach((child) => cleanRichNode(child, destination));
      return;
    }
    const outputTag = tag === "B" ? "strong" : tag === "I" ? "em" : tag === "DIV" ? "p" : tag.toLowerCase();
    const clean = document.createElement(outputTag);
    if (tag === "A") {
      const href = node.getAttribute("href") || "";
      if (!safeHref(href)) {
        node.childNodes.forEach((child) => cleanRichNode(child, destination));
        return;
      }
      clean.setAttribute("href", href.trim());
      if (/^https?:/i.test(href)) clean.setAttribute("rel", "noopener noreferrer");
    }
    node.childNodes.forEach((child) => cleanRichNode(child, clean));
    if (tag === "P" || tag === "DIV" || tag === "H2" || tag === "BLOCKQUOTE" || tag === "LI") {
      if (!clean.textContent.trim() && !clean.querySelector("br")) return;
    }
    destination.append(clean);
  };
  const normalizeRichText = (source) => {
    const parsed = new DOMParser().parseFromString(source, "text/html");
    const container = document.createElement("div");
    parsed.body.childNodes.forEach((node) => cleanRichNode(node, container));
    return container.innerHTML.trim();
  };
  const sanitizeRichText = (source) => normalizeRichText(source);
  const legacyTextToHtml = (source) => {
    const container = document.createElement("div");
    source.split(/\n\s*\n/).filter((paragraph) => paragraph.trim()).forEach((paragraph) => {
      const element = document.createElement("p");
      paragraph.split("\n").forEach((line, index) => {
        if (index) element.append(document.createElement("br"));
        element.append(document.createTextNode(line));
      });
      container.append(element);
    });
    return container.innerHTML;
  };
  const richTextToPlainText = (source) => {
    const parsed = new DOMParser().parseFromString(sanitizeRichText(source), "text/html");
    return parsed.body.textContent.trim();
  };
  const encodedPath = (path) => path.split("/").map(encodeURIComponent).join("/");
  const contentsUrl = (path) => `${API_ROOT}${encodedPath(path)}?ref=${encodeURIComponent(BRANCH)}`;
  const headers = (withBody = false) => ({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token()}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...(withBody ? { "Content-Type": "application/json" } : {}),
  });

  const explain = async (response) => {
    let detail = "";
    try { detail = (await response.json()).message || ""; } catch (error) {
      console.warn("La réponse d’erreur GitHub n’est pas au format JSON.", error);
    }
    if (response.status === 401) return "jeton invalide ou expiré";
    if (response.status === 403) return `accès refusé par GitHub${detail ? ` (${detail})` : ""} ; vérifiez Contents : Read and write`;
    if (response.status === 404) return `dépôt ${OWNER}/${REPOSITORY} introuvable, ou jeton sans accès`;
    return detail || `erreur HTTP ${response.status}`;
  };

  const readStoredToken = () => {
    try { return window.localStorage.getItem(TOKEN_KEY) || ""; } catch (error) {
      console.warn("La préférence de jeton ne peut pas être lue.", error);
      return "";
    }
  };
  const syncStoredToken = () => {
    try {
      if (rememberInput.checked && token()) window.localStorage.setItem(TOKEN_KEY, token());
      else window.localStorage.removeItem(TOKEN_KEY);
      forgetButton.hidden = !window.localStorage.getItem(TOKEN_KEY);
    } catch (error) {
      console.warn("La préférence de jeton ne peut pas être enregistrée.", error);
      forgetButton.hidden = true;
    }
  };

  const decodeBase64 = (value) => {
    const binary = atob(value.replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder().decode(bytes);
  };
  const encodeBase64 = (bytes) => {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  };

  const getFile = async (path, allowMissing = false) => {
    const response = await fetch(contentsUrl(path), { headers: headers() });
    if (response.status === 404 && allowMissing) return null;
    if (!response.ok) throw new Error(await explain(response));
    const file = await response.json();
    if (!file.content) throw new Error("fichier trop volumineux pour l’API GitHub");
    return { sha: file.sha, text: decodeBase64(file.content) };
  };

  const getSha = async (path) => {
    const response = await fetch(contentsUrl(path), { headers: headers() });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(await explain(response));
    return (await response.json()).sha || null;
  };

  const putFile = async (path, message, bytes, sha = null) => {
    const payload = { message, content: encodeBase64(bytes), branch: BRANCH };
    if (sha) payload.sha = sha;
    const response = await fetch(`${API_ROOT}${encodedPath(path)}`, {
      method: "PUT",
      headers: headers(true),
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await explain(response));
    return response.json();
  };

  const deleteFile = async (path, sha, message) => {
    const response = await fetch(`${API_ROOT}${encodedPath(path)}`, {
      method: "DELETE",
      headers: headers(true),
      body: JSON.stringify({ message, sha, branch: BRANCH }),
    });
    if (!response.ok) throw new Error(await explain(response));
  };

  const slugify = (value) => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const setImagePreview = (src, alt, message) => {
    if (previewUrl && previewUrl !== src) URL.revokeObjectURL(previewUrl);
    previewUrl = src.startsWith("blob:") ? src : "";
    imagePreview.hidden = !src;
    imagePreview.removeAttribute("src");
    imagePreview.alt = alt;
    imageHelp.textContent = message;
    if (src) imagePreview.src = src;
  };

  const truncateRichText = (source, limit) => {
    const container = document.createElement("div");
    container.innerHTML = sanitizeRichText(source);
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let remaining = limit;
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue || "";
      const characters = Array.from(text);
      if (characters.length <= remaining) {
        remaining -= characters.length;
        continue;
      }
      let excerpt = characters.slice(0, remaining).join("");
      const lastSpace = excerpt.lastIndexOf(" ");
      if (lastSpace >= remaining * 0.7) excerpt = excerpt.slice(0, lastSpace);
      node.nodeValue = `${excerpt.trimEnd()}…`;
      let current = node;
      while (current && current !== container) {
        while (current.nextSibling) current.nextSibling.remove();
        current = current.parentNode;
      }
      break;
    }
    return container.innerHTML;
  };

  const truncateText = (text, limit) => {
    const characters = Array.from(text);
    if (characters.length <= limit) return text;
    let excerpt = characters.slice(0, limit).join("");
    const lastSpace = excerpt.lastIndexOf(" ");
    if (lastSpace >= limit * 0.7) excerpt = excerpt.slice(0, lastSpace);
    return `${excerpt.trimEnd()}…`;
  };

  const updatePreview = () => {
    const title = titleInput.value.trim();
    const author = authorInput.value.trim();
    const subtitle = subtitleInput.value.trim();
    const date = dateInput.value
      ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${dateInput.value}T00:00:00Z`))
      : "";
    const slug = slugInput.value.trim() || "identifiant";
    const displayTitle = author ? `${title || "Titre de l’œuvre"} — ${author}` : title || "Titre de l’œuvre";
    previewTitle.textContent = author ? `${title || "Titre de l’œuvre"} — ${author}` : title || "Titre de l’œuvre";
    previewSubtitle.textContent = subtitle;
    previewSubtitle.hidden = !previewSubtitle.textContent;
    previewDate.textContent = date;
    reviewPreview.innerHTML = sanitizeRichText(reviewInput.innerHTML);
    previewCover.hidden = !imagePreview.getAttribute("src");
    previewCover.removeAttribute("src");
    previewCover.alt = `${typeInput.value === "Livre" ? "Couverture" : "Affiche"} de ${title || "l’œuvre"}`;
    if (!previewCover.hidden) previewCover.src = imagePreview.getAttribute("src");

    infoPreviewTitle.textContent = displayTitle;
    infoPreviewSubtitle.textContent = subtitle;
    infoPreviewSubtitle.hidden = !subtitle;
    infoPreviewImage.hidden = !imagePreview.getAttribute("src");
    infoPreviewImage.removeAttribute("src");
    infoPreviewImage.alt = `${typeInput.value === "Livre" ? "Couverture" : "Affiche"} de ${title || "l’œuvre"}`;
    if (!infoPreviewImage.hidden) infoPreviewImage.src = imagePreview.getAttribute("src");
    const excerpt = truncateRichText(reviewPreview.innerHTML, 1400);
    infoPreviewText.innerHTML = excerpt || "Le début de la critique s’affichera ici.";
    infoPreviewText.classList.toggle("is-vide", !excerpt);
    infoPreviewLink.href = `critiques/${encodeURIComponent(slug)}.html`;
    infoPreviewDate.textContent = date;

    const pageTitle = author ? `${title || "Titre de l’œuvre"} — ${author}` : title || "Titre de l’œuvre";
    infoSerpUrl.textContent = `https://latortuequipense.fr/critiques/${slug}.html`;
    infoSerpTitle.textContent = `${pageTitle} — Critique — La Tortue`;
    const plainReview = richTextToPlainText(reviewPreview.innerHTML);
    infoSerpDescription.textContent = truncateText(plainReview, 160) || "Le début de la critique s’affichera ici.";
    infoSerpDescription.classList.toggle("is-vide", !plainReview);
  };

  const restoreEditorSelection = () => {
    reviewInput.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (savedRange && selection && reviewInput.contains(savedRange.startContainer)) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }
  };

  const normalizeLink = (value) => {
    const url = value.trim();
    if (!url) return "";
    if (/^(?:https?:|mailto:|#|\/|\.\.?\/)/i.test(url)) return url;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) return `mailto:${url}`;
    return `https://${url}`;
  };

  const formatEditor = (button) => {
    restoreEditorSelection();
    if (button.dataset.critiqueCommande === "createLink") {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setStatus("Sélectionnez d’abord le texte à transformer en lien.", "erreur");
        return;
      }
      const href = normalizeLink(window.prompt("Adresse du lien (https://…)") || "");
      if (!href) return;
      document.execCommand("createLink", false, href);
    } else if (button.dataset.critiqueCommande) {
      document.execCommand(button.dataset.critiqueCommande, false);
    } else if (button.dataset.critiqueBloc) {
      const tag = button.dataset.critiqueBloc;
      const current = String(document.queryCommandValue("formatBlock") || "").toLowerCase().replace(/[<>]/g, "");
      document.execCommand("formatBlock", false, current === tag ? "p" : tag);
    }
    updatePreview();
    reviewInput.dispatchEvent(new Event("input", { bubbles: true }));
  };

  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && reviewInput.contains(selection.anchorNode)) {
      savedRange = selection.getRangeAt(0).cloneRange();
    }
  });
  document.querySelectorAll(".admin-critique-redaction [data-critique-commande], .admin-critique-redaction [data-critique-bloc]").forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => formatEditor(button));
  });
  reviewInput.addEventListener("input", updatePreview);
  [titleInput, authorInput, subtitleInput, dateInput, typeInput].forEach((input) => {
    input.addEventListener("input", updatePreview);
    input.addEventListener("change", updatePreview);
  });
  reviewInput.addEventListener("contextmenu", (event) => {
    const selection = window.getSelection();
    if (selection?.rangeCount && reviewInput.contains(selection.anchorNode)) {
      savedRange = selection.getRangeAt(0).cloneRange();
    } else {
      let point = document.caretRangeFromPoint?.(event.clientX, event.clientY);
      if (!point) {
        const position = document.caretPositionFromPoint?.(event.clientX, event.clientY);
        if (position) {
          point = document.createRange();
          point.setStart(position.offsetNode, position.offset);
          point.collapse(true);
        }
      }
      if (point && reviewInput.contains(point.startContainer)) {
        point.collapse(true);
        savedRange = point.cloneRange();
      }
    }
    event.preventDefault();
    contextMenu.hidden = false;
    const bounds = contextMenu.getBoundingClientRect();
    contextMenu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - bounds.width - 8))}px`;
    contextMenu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - bounds.height - 8))}px`;
    contextMenu.querySelector("button")?.focus({ preventScroll: true });
  });
  contextMenu.addEventListener("mousedown", (event) => event.preventDefault());
  contextMenu.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (!button) return;
    contextMenu.hidden = true;
    formatEditor(button);
    reviewInput.focus({ preventScroll: true });
  });
  contextMenu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      contextMenu.hidden = true;
      reviewInput.focus({ preventScroll: true });
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!contextMenu.hidden && !contextMenu.contains(event.target)) contextMenu.hidden = true;
  });
  window.addEventListener("resize", () => { contextMenu.hidden = true; });
  document.querySelectorAll("[data-critique-vue]").forEach((button) => {
    button.addEventListener("click", () => {
      editorLayout.dataset.vue = button.dataset.critiqueVue;
      document.querySelectorAll("[data-critique-vue]").forEach((item) => {
        item.setAttribute("aria-pressed", String(item === button));
      });
    });
  });
  document.querySelectorAll("[data-critique-appareil]").forEach((button) => {
    button.addEventListener("click", () => {
      previewPage.dataset.appareil = button.dataset.critiqueAppareil;
      document.querySelectorAll("[data-critique-appareil]").forEach((item) => {
        item.setAttribute("aria-pressed", String(item === button));
      });
    });
  });

  const resetForm = () => {
    editing = null;
    slugEdited = false;
    dirty = false;
    form.reset();
    reviewInput.replaceChildren();
    showStep("redaction");
    slugInput.disabled = false;
    dateInput.value = todayString();
    imageInput.required = true;
    saveButton.textContent = "Publier la critique";
    deleteButton.hidden = true;
    $("titre-formulaire-critique").textContent = "Nouvelle critique";
    setImagePreview("", "", "Aucune image sélectionnée.");
    updatePreview();
    setStatus("");
    updateFormVisibility();
  };

  const switchMode = (newMode) => {
    if (mode === newMode) return;
    if (dirty && !window.confirm("Abandonner le travail en cours et changer d’onglet ?")) return;
    resetForm();
    mode = newMode;
    tabButtons.forEach((tab) => {
      const active = tab.dataset.mode === mode;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    heading.textContent = mode === "modifier" ? "Modifier ou supprimer une critique" : "Nouvelle critique";
    intro.textContent = mode === "modifier"
      ? "Choisissez une critique publiée pour la modifier ou la supprimer."
      : "Rédigez une critique de livre, de film ou de série. Sa page et ses aperçus seront générés après l’enregistrement.";
    updateFormVisibility();
    setStatus("");
    if (mode === "modifier") loadList();
  };

  tabButtons.forEach((tab) => {
    tab.addEventListener("click", () => switchMode(tab.dataset.mode));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = tabButtons.indexOf(tab);
      let nextIndex;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
      else if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % tabButtons.length;
      else if (event.key === "Home") nextIndex = 0;
      else nextIndex = tabButtons.length - 1;
      tabButtons[nextIndex].focus();
      switchMode(tabButtons[nextIndex].dataset.mode);
    });
  });

  const loadList = async () => {
    if (!token()) {
      setListStatus("Saisissez un jeton GitHub pour charger les critiques.");
      return;
    }
    setListStatus("Chargement des critiques…");
    list.replaceChildren();
    try {
      const response = await fetch(contentsUrl("critiques-data"), { headers: headers() });
      if (response.status === 404) {
        setListStatus("Aucune critique publiée pour le moment.");
        return;
      }
      if (!response.ok) throw new Error(await explain(response));
      const files = (await response.json())
        .filter((file) => file.type === "file" && file.name.endsWith(".json"))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
      if (!files.length) {
        setListStatus("Aucune critique publiée pour le moment.");
        return;
      }
      files.forEach((file) => {
        const row = document.createElement("div");
        row.className = "admin-article-row";
        row.dataset.name = file.name.toLocaleLowerCase("fr");
        const name = document.createElement("span");
        name.className = "admin-article-nom";
        name.textContent = file.name.replace(/\.json$/, "");
        const actions = document.createElement("div");
        actions.className = "admin-article-actions";
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Modifier";
        button.setAttribute("aria-label", `Modifier ${file.name.replace(/\.json$/, "")}`);
        button.addEventListener("click", () => loadCritique(file.name));
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "admin-danger";
        removeButton.textContent = "Supprimer";
        removeButton.setAttribute("aria-label", `Supprimer ${file.name.replace(/\.json$/, "")}`);
        removeButton.addEventListener("click", () => removeCritique(file.name));
        actions.append(button, removeButton);
        row.append(name, actions);
        list.append(row);
      });
      setListStatus(`${files.length} critique${files.length > 1 ? "s" : ""} dans le dépôt.`);
      filterInput.dispatchEvent(new Event("input"));
    } catch (error) {
      setListStatus(`Impossible de charger la liste : ${error.message}`);
    }
  };

  const loadCritique = async (filename) => {
    try {
      setStatus("Chargement de la critique…");
      const file = await getFile(`critiques-data/${filename}`);
      const data = JSON.parse(file.text);
      if (!data || typeof data !== "object") throw new Error("fichier de critique invalide");
      editing = {
        path: `critiques-data/${filename}`,
        sha: file.sha,
        image: data.image || "",
      };
      titleInput.value = String(data.titre || "");
      typeInput.value = String(data.type || "Livre");
      authorInput.value = String(data.auteur || "");
      subtitleInput.value = String(data.soustitre || "");
      dateInput.value = String(data.date || todayString());
      slugInput.value = String(data.slug || filename.replace(/\.json$/, ""));
      slugInput.disabled = true;
      tagsInput.value = inputFromList(data.tags);
      disciplinesInput.value = inputFromList(data.disciplines);
      categoriesInput.value = inputFromList(data.categories);
      const storedReview = String(data.critique || "");
      reviewInput.innerHTML = /<\s*\/?\s*(?:a|blockquote|br|div|em|h2|h3|i|li|ol|p|strong|sub|sup|ul)\b/i.test(storedReview)
        ? sanitizeRichText(storedReview)
        : legacyTextToHtml(storedReview);
      imageInput.value = "";
      imageInput.required = false;
      saveButton.textContent = "Enregistrer les modifications";
      $("titre-formulaire-critique").textContent = `Modifier : ${titleInput.value}`;
      setImagePreview(data.image || "", titleInput.value, data.image ? "Image actuelle ; sélectionnez un nouveau fichier pour la remplacer." : "Aucune image enregistrée.");
      dirty = false;
      updateFormVisibility();
      updatePreview();
      setStatus("");
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setStatus(`Impossible d’ouvrir cette critique : ${error.message}`, "erreur");
    }
  };

  const uploadCover = async (slug, file, previousPath) => {
    const extension = IMAGE_EXTENSIONS[file.type];
    if (!extension) throw new Error("format d’image non pris en charge");
    if (file.size > MAX_IMAGE_BYTES) throw new Error("l’image dépasse la limite de 10 Mo");

    const basePath = `images-critiques/${slug}-couverture.${extension}`;
    let path = basePath;
    let sha = null;
    if (path === previousPath) {
      sha = await getSha(path);
    } else {
      let suffix = 2;
      while (await getSha(path)) {
        path = `images-critiques/${slug}-couverture-${suffix}.${extension}`;
        suffix += 1;
      }
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    await putFile(path, `Ajout de l’image de la critique ${slug}`, bytes, sha);
    return path;
  };

  const saveCritique = async () => {
    if (!richTextToPlainText(reviewInput.innerHTML)) {
      setStatus("Rédigez le texte détaillé de la critique.", "erreur");
      reviewInput.focus();
      return;
    }
    if (!token()) {
      setStatus("Saisissez un jeton GitHub pour publier.", "erreur");
      tokenInput.focus();
      return;
    }
    const slug = slugInput.value.trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setStatus("L’identifiant doit contenir uniquement des minuscules non accentuées, chiffres et tirets.", "erreur");
      slugInput.focus();
      return;
    }
    const imageFile = imageInput.files && imageInput.files[0];
    if (!editing && !imageFile) {
      setStatus("Ajoutez la couverture ou l’affiche de l’œuvre.", "erreur");
      imageInput.focus();
      return;
    }
    if (imageFile && (!IMAGE_EXTENSIONS[imageFile.type] || imageFile.size > MAX_IMAGE_BYTES)) {
      setStatus("Choisissez une image PNG, JPEG, GIF ou WebP de 10 Mo maximum.", "erreur");
      imageInput.focus();
      return;
    }

    busy = true;
    saveButton.disabled = true;
    deleteButton.disabled = true;
    let imageUploaded = false;
    try {
      const dataPath = editing ? editing.path : `critiques-data/${slug}.json`;
      let sha = editing ? editing.sha : null;
      if (!editing && await getSha(dataPath)) {
        throw new Error(`une critique portant l’identifiant « ${slug} » existe déjà`);
      }

      let image = editing ? editing.image : "";
      if (imageFile) {
        setStatus("Envoi de la couverture ou de l’affiche…");
        image = await uploadCover(slug, imageFile, editing?.image || "");
        imageUploaded = true;
      }
      if (!image) throw new Error("aucune image n’est associée à cette critique");

      const data = {
        slug,
        titre: titleInput.value.trim(),
        type: typeInput.value,
        auteur: authorInput.value.trim(),
        soustitre: subtitleInput.value.trim(),
        tags: listFromInput(tagsInput),
        disciplines: listFromInput(disciplinesInput),
        categories: listFromInput(categoriesInput),
        critique: sanitizeRichText(reviewInput.innerHTML),
        image,
        date: dateInput.value,
      };
      const json = `${JSON.stringify(data, null, 2)}\n`;
      setStatus("Enregistrement de la critique sur GitHub…");
      const savedFile = await putFile(dataPath, `${editing ? "Mise à jour" : "Publication"} de la critique ${slug}`, new TextEncoder().encode(json), sha);
      let cleanupMessage = "";
      if (editing?.image && editing.image !== image
        && editing.image.startsWith("images-critiques/") && !editing.image.includes("..")) {
        try {
          const previousImageSha = await getSha(editing.image);
          if (previousImageSha) {
            await deleteFile(editing.image, previousImageSha, `Suppression de l’ancienne image de la critique ${slug}`);
          }
        } catch (error) {
          cleanupMessage = ` L’ancienne image n’a pas pu être supprimée : ${error.message}.`;
        }
      }
      const successMessage = `Critique enregistrée. GitHub Actions va générer la page et actualiser la liste sous quelques minutes.${cleanupMessage}`;
      if (editing) {
        editing.sha = savedFile.content.sha;
        editing.image = image;
        dirty = false;
        refreshState();
        setStatus(successMessage, cleanupMessage ? "erreur" : "succes");
      } else {
        resetForm();
        setStatus(successMessage, cleanupMessage ? "erreur" : "succes");
      }
    } catch (error) {
      const partial = imageUploaded
        ? " L’image a été envoyée mais la fiche n’a pas été enregistrée ; elle pourra être réutilisée."
        : "";
      setStatus(`Enregistrement impossible : ${error.message}.${partial}`, "erreur");
    } finally {
      busy = false;
      saveButton.disabled = false;
      deleteButton.disabled = false;
    }
  };

  const removeCritique = async (filename = "") => {
    if (busy) return;
    const fromLibrary = Boolean(filename);
    if (!token()) {
      const message = "Saisissez un jeton GitHub pour supprimer cette critique.";
      if (fromLibrary) setListStatus(message);
      else setStatus(message, "erreur");
      tokenInput.focus();
      return;
    }

    let target = editing;
    let title = titleInput.value.trim();
    try {
      if (fromLibrary) {
        const file = await getFile(`critiques-data/${filename}`);
        const data = JSON.parse(file.text);
        if (!data || typeof data !== "object") throw new Error("fichier de critique invalide");
        target = {
          path: `critiques-data/${filename}`,
          sha: file.sha,
          image: typeof data.image === "string" ? data.image : "",
        };
        title = typeof data.titre === "string" ? data.titre : filename.replace(/\.json$/, "");
      }
      if (!target) return;
      if (!window.confirm(`Supprimer la critique « ${title} » ?`)) return;

      busy = true;
      saveButton.disabled = true;
      deleteButton.disabled = true;
      await deleteFile(target.path, target.sha, `Suppression de la critique ${filename || slugInput.value}`);
      let cleanupMessage = "";
      if (target.image.startsWith("images-critiques/") && !target.image.includes("..")) {
        try {
          const imageSha = await getSha(target.image);
          if (imageSha) await deleteFile(target.image, imageSha, `Suppression de l’image de la critique ${title}`);
        } catch (error) {
          cleanupMessage = ` La fiche est supprimée, mais l’image n’a pas pu être supprimée : ${error.message}.`;
        }
      }
      if (editing?.path === target.path) resetForm();
      const message = `Critique supprimée.${cleanupMessage}`;
      if (fromLibrary) setListStatus(message);
      else setStatus(message, cleanupMessage ? "erreur" : "succes");
      await loadList();
    } catch (error) {
      const message = `Suppression impossible : ${error.message}`;
      if (fromLibrary) setListStatus(message);
      else setStatus(message, "erreur");
    } finally {
      busy = false;
      saveButton.disabled = false;
      deleteButton.disabled = false;
    }
  };

  titleInput.addEventListener("input", () => {
    if (!slugEdited && !editing) slugInput.value = slugify(titleInput.value);
    updatePreview();
  });
  slugInput.addEventListener("input", () => {
    slugEdited = true;
    updatePreview();
  });
  imageInput.addEventListener("change", () => {
    const file = imageInput.files && imageInput.files[0];
    if (file) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl, titleInput.value, file.name);
    } else if (editing?.image) {
      setImagePreview(editing.image, titleInput.value, "Image actuelle ; sélectionnez un nouveau fichier pour la remplacer.");
    } else {
      setImagePreview("", "", "Aucune image sélectionnée.");
    }
    updatePreview();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy) return;
    const invalid = Array.from(form.elements).find((element) => element.willValidate && !element.validity.valid);
    if (invalid) {
      const panel = invalid.closest("[data-critique-etape]");
      if (panel) showStep(panel.dataset.critiqueEtape);
      invalid.focus();
      form.reportValidity();
      return;
    }
    saveCritique();
  });
  form.addEventListener("input", () => {
    dirty = true;
    refreshState();
  });
  form.addEventListener("change", () => {
    dirty = true;
    refreshState();
  });
  $("nouvelle-critique").addEventListener("click", () => {
    if (dirty && !window.confirm("Effacer le contenu et abandonner les modifications en cours ?")) return;
    resetForm();
  });
  changeCritiqueButton.addEventListener("click", () => {
    if (dirty && !window.confirm("Abandonner les modifications en cours et choisir une autre critique ?")) return;
    resetForm();
  });
  $("charger-critiques").addEventListener("click", loadList);
  deleteButton.addEventListener("click", removeCritique);
  filterInput.addEventListener("input", () => {
    const query = filterInput.value.trim().toLocaleLowerCase("fr");
    list.querySelectorAll(".admin-article-row").forEach((row) => {
      row.hidden = !row.dataset.name.includes(query);
    });
  });
  tokenInput.addEventListener("input", () => {
    setConnection(token() ? "saisi" : "absent");
    if (rememberInput.checked) syncStoredToken();
  });
  rememberInput.addEventListener("change", syncStoredToken);
  forgetButton.addEventListener("click", () => {
    try { window.localStorage.removeItem(TOKEN_KEY); } catch (error) {
      console.warn("Le jeton mémorisé n’a pas pu être supprimé.", error);
    }
    tokenInput.value = "";
    rememberInput.checked = false;
    forgetButton.hidden = true;
    setConnection("absent");
    setListStatus("Saisissez un jeton GitHub pour charger les critiques.");
    list.replaceChildren();
  });

  dateInput.value = todayString();
  updatePreview();
  updateFormVisibility();
  const savedToken = readStoredToken();
  if (savedToken) {
    tokenInput.value = savedToken;
    rememberInput.checked = true;
    forgetButton.hidden = false;
    setConnection("saisi");
  }
})();
