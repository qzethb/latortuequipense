(() => {
  "use strict";

  /* ======================================================================
     Configuration : dépôt PRIVÉ réservé aux notes
     ====================================================================== */
  const OWNER = "qzethb";
  const REPOSITORY = "latortuequipense-notes";
  const FILE = "notes.json";
  const TOKEN_KEY = "tortue-notes-jeton";
  const REPO_URL = `https://api.github.com/repos/${OWNER}/${REPOSITORY}`;
  const MAX_BYTES = 900 * 1024; // l'API « contents » lit jusqu'à 1 Mo

  const $ = (id) => document.getElementById(id);
  const loginForm = $("connexion");
  const tokenInput = $("jeton");
  const rememberBox = $("memoriser");
  const forgetButton = $("oublier");
  const status = $("statut");
  const space = $("espace");
  const searchInput = $("recherche");
  const list = $("liste");
  const noteForm = $("note");
  const titleInput = $("note-titre");
  const textInput = $("note-texte");
  const pinInput = $("note-epingle");
  const meta = $("note-meta");
  const saveButton = $("enregistrer");
  const deleteButton = $("supprimer");

  let token = "";
  let sha = null;
  let data = { version: 1, notes: [] };
  let currentId = null;
  let dirty = false;
  let busy = false;

  const setStatus = (message, type = "") => {
    status.textContent = message;
    if (type) status.dataset.type = type;
    else delete status.dataset.type;
  };

  /* ---------- Stockage local du jeton (facultatif) ---------- */
  const readStoredToken = () => {
    try { return window.localStorage.getItem(TOKEN_KEY) || ""; } catch (error) { return ""; }
  };
  const storeToken = (value) => {
    try { window.localStorage.setItem(TOKEN_KEY, value); } catch (error) { /* stockage indisponible */ }
  };
  const clearStoredToken = () => {
    try { window.localStorage.removeItem(TOKEN_KEY); } catch (error) { /* stockage indisponible */ }
  };

  /* ---------- GitHub ---------- */
  const headers = (withBody = false) => ({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...(withBody ? { "Content-Type": "application/json" } : {}),
  });

  const explain = async (response) => {
    let detail = "";
    try { detail = (await response.json()).message || ""; } catch (error) { /* corps vide */ }
    if (response.status === 401) return "jeton invalide ou expiré";
    if (response.status === 403) return `accès refusé par GitHub${detail ? ` (${detail})` : ""} : vérifiez la permission « Contents : Read and write »`;
    if (response.status === 404) return `dépôt ${OWNER}/${REPOSITORY} introuvable, ou jeton sans accès à ce dépôt`;
    if (response.status === 409 || response.status === 422) {
      return "les notes ont été modifiées ailleurs depuis leur chargement ; copiez votre texte puis cliquez sur « Ouvrir mes notes » pour recharger";
    }
    return detail || `erreur HTTP ${response.status}`;
  };

  const encodeBase64 = (text) => {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary);
  };

  const decodeBase64 = (value) => {
    const binary = atob(value.replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder().decode(bytes);
  };

  // Garde-fou : jamais d'écriture dans un dépôt public.
  const assertPrivateRepository = async () => {
    const response = await fetch(REPO_URL, { headers: headers() });
    if (!response.ok) throw new Error(await explain(response));
    const repository = await response.json();
    if (!repository.private) {
      throw new Error(`le dépôt ${OWNER}/${REPOSITORY} est public : vos notes seraient lisibles par tous. Passez-le en privé`);
    }
  };

  const normalizeNotes = (value) => {
    const notes = Array.isArray(value?.notes) ? value.notes : [];
    return {
      version: 1,
      notes: notes
        .filter((note) => note && typeof note.id === "string")
        .map((note) => ({
          id: note.id,
          titre: String(note.titre || ""),
          texte: String(note.texte || ""),
          epingle: Boolean(note.epingle),
          cree: String(note.cree || ""),
          maj: String(note.maj || ""),
        })),
    };
  };

  const loadNotes = async () => {
    await assertPrivateRepository();
    const response = await fetch(`${REPO_URL}/contents/${FILE}`, { headers: headers() });
    if (response.status === 404) {
      sha = null;
      data = { version: 1, notes: [] };
      return;
    }
    if (!response.ok) throw new Error(await explain(response));
    const file = await response.json();
    sha = file.sha;
    data = normalizeNotes(JSON.parse(decodeBase64(file.content)));
  };

  const saveNotes = async (message) => {
    const text = `${JSON.stringify(data, null, 2)}\n`;
    if (new TextEncoder().encode(text).length > MAX_BYTES) {
      throw new Error("le fichier de notes dépasse 900 Ko : supprimez de vieilles notes");
    }
    await assertPrivateRepository();
    const payload = { message, content: encodeBase64(text) };
    if (sha) payload.sha = sha;
    const response = await fetch(`${REPO_URL}/contents/${FILE}`, {
      method: "PUT",
      headers: headers(true),
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await explain(response));
    sha = (await response.json()).content.sha;
  };

  /* ---------- Affichage ---------- */
  const normalize = (value) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const formatDate = (iso) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  };
  const noteTitle = (note) => note.titre.trim() || note.texte.trim().split("\n")[0].slice(0, 60) || "Note sans titre";

  const sortedNotes = () => {
    const query = normalize(searchInput.value.trim());
    return data.notes
      .filter((note) => !query || normalize(`${note.titre}\n${note.texte}`).includes(query))
      .sort((a, b) => Number(b.epingle) - Number(a.epingle) || b.maj.localeCompare(a.maj));
  };

  const renderList = () => {
    list.replaceChildren();
    const notes = sortedNotes();
    if (!notes.length) {
      const empty = document.createElement("li");
      empty.className = "notes-vide";
      empty.textContent = data.notes.length ? "Aucune note ne correspond." : "Aucune note pour l’instant.";
      list.append(empty);
      return;
    }
    notes.forEach((note) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "notes-element";
      if (note.id === currentId) button.setAttribute("aria-current", "true");
      const title = document.createElement("span");
      title.textContent = `${note.epingle ? "★ " : ""}${noteTitle(note)}`;
      const date = document.createElement("small");
      date.textContent = formatDate(note.maj);
      button.append(title, date);
      button.addEventListener("click", () => selectNote(note.id));
      item.append(button);
      list.append(item);
    });
  };

  const showNote = (note) => {
    noteForm.hidden = !note;
    if (!note) return;
    titleInput.value = note.titre;
    textInput.value = note.texte;
    pinInput.checked = note.epingle;
    meta.textContent = note.maj ? `Dernière modification : ${formatDate(note.maj)}.` : "Nouvelle note, pas encore enregistrée.";
    dirty = false;
  };

  const confirmDiscard = () => !dirty || window.confirm("Abandonner les modifications non enregistrées de cette note ?");

  function selectNote(id) {
    if (id !== currentId && !confirmDiscard()) return;
    currentId = id;
    showNote(data.notes.find((note) => note.id === id) || null);
    renderList();
  }

  const newId = () => (window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

  $("nouvelle").addEventListener("click", () => {
    if (!confirmDiscard()) return;
    const note = { id: newId(), titre: "", texte: "", epingle: false, cree: "", maj: "" };
    data.notes.push(note); // retirée si elle reste vide et non enregistrée
    currentId = note.id;
    showNote(note);
    renderList();
    titleInput.focus();
  });

  const dropUnsavedEmpty = () => {
    data.notes = data.notes.filter((note) => note.maj || note.titre || note.texte);
  };

  searchInput.addEventListener("input", renderList);
  noteForm.addEventListener("input", () => { dirty = true; });
  noteForm.addEventListener("change", () => { dirty = true; });

  /* ---------- Actions ---------- */
  const setBusy = (value) => {
    busy = value;
    saveButton.disabled = value;
    deleteButton.disabled = value;
  };

  noteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const note = data.notes.find((item) => item.id === currentId);
    if (!note) return;
    if (!titleInput.value.trim() && !textInput.value.trim()) {
      setStatus("Saisissez un titre ou un texte avant d’enregistrer.", "erreur");
      return;
    }
    const previous = { ...note };
    const now = new Date().toISOString();
    note.titre = titleInput.value.trim();
    note.texte = textInput.value;
    note.epingle = pinInput.checked;
    note.cree = note.cree || now;
    note.maj = now;
    setBusy(true);
    setStatus("Enregistrement…");
    try {
      await saveNotes("Mise à jour des notes");
      dirty = false;
      showNote(note);
      renderList();
      setStatus("Note enregistrée.", "succes");
    } catch (error) {
      Object.assign(note, previous);
      setStatus(`Enregistrement impossible : ${error.message}.`, "erreur");
    } finally {
      setBusy(false);
    }
  });

  deleteButton.addEventListener("click", async () => {
    if (busy) return;
    const note = data.notes.find((item) => item.id === currentId);
    if (!note) return;
    if (!note.maj) { // jamais enregistrée : simple abandon
      dropUnsavedEmpty();
      data.notes = data.notes.filter((item) => item.id !== note.id);
      currentId = null;
      showNote(null);
      renderList();
      return;
    }
    if (!window.confirm(`Supprimer définitivement la note « ${noteTitle(note)} » ?`)) return;
    const before = data.notes.slice();
    data.notes = data.notes.filter((item) => item.id !== note.id);
    setBusy(true);
    setStatus("Suppression…");
    try {
      await saveNotes("Mise à jour des notes");
      currentId = null;
      dirty = false;
      showNote(null);
      renderList();
      setStatus("Note supprimée.", "succes");
    } catch (error) {
      data.notes = before;
      renderList();
      setStatus(`Suppression impossible : ${error.message}.`, "erreur");
    } finally {
      setBusy(false);
    }
  });

  /* ---------- Connexion ---------- */
  const open = async (value, remember) => {
    token = value.trim();
    if (!token) {
      setStatus("Saisissez le jeton du dépôt des notes.", "erreur");
      return;
    }
    setStatus("Ouverture des notes…");
    try {
      await loadNotes();
      if (remember) storeToken(token);
      currentId = null;
      dirty = false;
      showNote(null);
      searchInput.value = "";
      renderList();
      space.hidden = false;
      forgetButton.hidden = !readStoredToken();
      tokenInput.value = "";
      setStatus(`${data.notes.length} note${data.notes.length > 1 ? "s" : ""}.`);
    } catch (error) {
      space.hidden = true;
      token = "";
      setStatus(`Ouverture impossible : ${error.message}.`, "erreur");
    }
  };

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!confirmDiscard()) return;
    open(tokenInput.value, rememberBox.checked);
  });

  forgetButton.addEventListener("click", () => {
    clearStoredToken();
    token = "";
    data = { version: 1, notes: [] };
    sha = null;
    currentId = null;
    dirty = false;
    space.hidden = true;
    forgetButton.hidden = true;
    rememberBox.checked = false;
    tokenInput.value = "";
    setStatus("Jeton oublié sur cet appareil.");
  });

  window.addEventListener("beforeunload", (event) => {
    if (dirty || busy) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  const stored = readStoredToken();
  if (stored) {
    rememberBox.checked = true;
    forgetButton.hidden = false;
    open(stored, true);
  }
})();
