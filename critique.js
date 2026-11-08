(() => {
  "use strict";

  const cards = Array.from(document.querySelectorAll(".critique-article"));
  const menus = Array.from(document.querySelectorAll(".menu-tags")).map((element) => ({
    element,
    key: element.dataset.cle,
    param: element.dataset.param,
    button: element.querySelector(".menu-tags-bouton"),
    panel: element.querySelector(".menu-tags-panneau"),
    count: element.querySelector(".menu-tags-nombre"),
    reset: element.querySelector(".menu-tags-reset"),
    checkboxes: Array.from(element.querySelectorAll('input[type="checkbox"]')),
  }));
  const searchForm = document.getElementById("formulaire");
  const searchInput = document.getElementById("recherche");
  const clearButton = document.getElementById("effacer");
  const quickSearchForm = document.querySelector(".bandeau-recherche-formulaire");
  const quickSearchInput = document.getElementById("recherche-rapide");
  const quickClearButton = document.getElementById("effacer-rapide");
  const searchBanner = document.getElementById("bandeau-recherche");
  const tools = document.querySelector(".outils");
  const applyButton = document.getElementById("actualiser-filtres");
  const resultCount = document.getElementById("critique-resultats");
  const emptyState = document.getElementById("vide");
  const critiqueList = document.getElementById("section-critiques");
  const emptyMessage = document.getElementById("critique-message-vide");
  const emptyMessageEnd = document.getElementById("critique-message-fin");
  const reportLink = document.getElementById("critique-signalement");
  const resetAllButton = document.getElementById("tout");
  let appliedFilters = [];
  let positionBeforeQuickSearch = null;

  const normalize = (value) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const checkedValues = (menu) => menu.checkboxes.filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value);
  const valuesFor = (card, key) => (card.dataset[key] || "").split(",").map((value) => value.trim()).filter(Boolean);

  menus.forEach((menu) => {
    const resetBefore = menu.reset;
    const knownValues = new Set(menu.checkboxes.map((checkbox) => checkbox.value));
    cards.forEach((card) => {
      valuesFor(card, menu.key).forEach((value) => {
        if (knownValues.has(value)) return;
        knownValues.add(value);
        const label = document.createElement("label");
        label.className = "menu-tags-option";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = value;
        const text = document.createElement("span");
        text.textContent = value;
        label.append(checkbox, text);
        menu.panel.insertBefore(label, resetBefore);
        menu.checkboxes.push(checkbox);
      });
    });
  });

  cards.forEach((card) => {
    card.dataset.texte = normalize([
      card.textContent,
      card.dataset.type,
      card.dataset.tags,
      card.dataset.disciplines,
      card.dataset.categories,
    ].join(" "));
  });

  const updateMenuState = () => {
    menus.forEach((menu) => {
      const selected = checkedValues(menu);
      menu.count.textContent = String(selected.length);
      menu.count.hidden = selected.length === 0;
      menu.reset.hidden = selected.length === 0;
    });
    applyButton.disabled = !menus.some((menu, index) => {
      const selected = checkedValues(menu);
      const applied = appliedFilters[index] || [];
      return selected.length !== applied.length || selected.some((value) => !applied.includes(value));
    });
  };

  const updateUrl = () => {
    const params = new URLSearchParams(window.location.search);
    ["q", "tag", "type", "discipline", "categorie", ...menus.map((menu) => menu.param)].forEach((key) => params.delete(key));
    if (searchInput.value.trim()) params.set("q", searchInput.value.trim());
    menus.forEach((menu, index) => {
      if (appliedFilters[index].length) params.set(menu.param, appliedFilters[index].join(","));
    });
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  };

  const filterCards = () => {
    const words = normalize(searchInput.value.trim()).split(/\s+/).filter(Boolean);
    let visibleCount = 0;
    cards.forEach((card) => {
      const matchesSearch = words.every((word) => card.dataset.texte.includes(word));
      const matchesMenus = menus.every((menu, index) => {
        const selected = appliedFilters[index];
        if (!selected.length) return true;
        const available = valuesFor(card, menu.key);
        return selected.some((value) => available.includes(value));
      });
      card.hidden = !matchesSearch || !matchesMenus;
      if (!card.hidden) visibleCount += 1;
    });
    resultCount.textContent = visibleCount
      ? `${visibleCount} critique${visibleCount > 1 ? "s" : ""}`
      : "";
    emptyState.hidden = visibleCount > 0;
    critiqueList.hidden = visibleCount === 0;
    if (cards.length === 0) {
      emptyMessage.textContent = "Aucune critique publiée pour le moment.";
      emptyMessageEnd.textContent = "";
      reportLink.hidden = true;
      resetAllButton.hidden = true;
    } else {
      emptyMessage.textContent =
        "Aucune critique ne correspond à cette recherche. Essayez de modifier vos critères ou de cliquer sur « Tout afficher ». En dernier recours, vous pouvez signaler un problème via le ";
      emptyMessageEnd.textContent = ".";
      reportLink.hidden = false;
      resetAllButton.hidden = false;
    }
    clearButton.hidden = !searchInput.value;
    quickClearButton.hidden = !quickSearchInput.value;
    updateMenuState();
  };

  const restoreQuickSearchPosition = () => {
    if (positionBeforeQuickSearch === null) return;
    const position = positionBeforeQuickSearch;
    positionBeforeQuickSearch = null;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: position, behavior: "auto" });
    });
  };

  const openMenu = (menu, open) => {
    menu.panel.hidden = !open;
    menu.button.setAttribute("aria-expanded", String(open));
  };
  const closeOtherMenus = (except) => {
    menus.forEach((menu) => {
      if (menu !== except) openMenu(menu, false);
    });
  };

  menus.forEach((menu) => {
    menu.button.addEventListener("click", () => {
      const opening = menu.panel.hidden;
      closeOtherMenus(menu);
      openMenu(menu, opening);
    });
    menu.element.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !menu.panel.hidden) {
        openMenu(menu, false);
        menu.button.focus();
      }
    });
    menu.checkboxes.forEach((checkbox) => checkbox.addEventListener("change", updateMenuState));
    menu.reset.addEventListener("click", () => {
      menu.checkboxes.forEach((checkbox) => { checkbox.checked = false; });
      updateMenuState();
    });
  });

  document.addEventListener("click", (event) => {
    menus.forEach((menu) => {
      if (!menu.element.contains(event.target)) openMenu(menu, false);
    });
  });
  document.addEventListener("focusin", (event) => {
    menus.forEach((menu) => {
      if (!menu.element.contains(event.target)) openMenu(menu, false);
    });
  });

  searchInput.addEventListener("input", () => {
    quickSearchInput.value = searchInput.value;
    filterCards();
    updateUrl();
  });
  clearButton.addEventListener("click", () => {
    searchInput.value = "";
    quickSearchInput.value = "";
    filterCards();
    updateUrl();
    restoreQuickSearchPosition();
    searchInput.focus();
  });
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    applyButton.click();
  });
  applyButton.addEventListener("click", () => {
    appliedFilters = menus.map(checkedValues);
    filterCards();
    updateUrl();
  });
  quickSearchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = quickSearchInput.value;
    const searchChanged = value !== searchInput.value;
    const clearingSearch = !value && Boolean(searchInput.value);

    if (searchChanged && value && positionBeforeQuickSearch === null) {
      positionBeforeQuickSearch = window.scrollY;
    }

    searchInput.value = value;
    filterCards();
    updateUrl();

    if (clearingSearch) {
      restoreQuickSearchPosition();
    } else if (searchChanged && value) {
      const target = document.querySelector(
        emptyState.hidden ? ".critique-article:not([hidden])" : "#vide",
      );
      if (target) {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      }
    }
  });
  quickSearchInput.addEventListener("input", () => {
    quickClearButton.hidden = !quickSearchInput.value;
  });
  quickClearButton.addEventListener("click", () => {
    quickSearchInput.value = "";
    quickClearButton.hidden = true;
    quickSearchInput.focus();
  });
  resetAllButton.addEventListener("click", () => {
    searchInput.value = "";
    quickSearchInput.value = "";
    menus.forEach((menu) => menu.checkboxes.forEach((checkbox) => { checkbox.checked = false; }));
    appliedFilters = menus.map(() => []);
    filterCards();
    updateUrl();
    restoreQuickSearchPosition();
  });

  const params = new URLSearchParams(window.location.search);
  searchInput.value = params.get("q") || "";
  quickSearchInput.value = searchInput.value;
  menus.forEach((menu) => {
    const legacyParam = menu.param === "type" ? params.get("categorie") : null;
    const selected = (params.get(menu.param) || legacyParam || "").split(",").map((value) => value.trim()).filter(Boolean);
    menu.checkboxes.forEach((checkbox) => { checkbox.checked = selected.includes(checkbox.value); });
  });
  appliedFilters = menus.map(checkedValues);
  filterCards();

  window.addEventListener("scroll", () => {
    searchBanner.hidden = tools.getBoundingClientRect().bottom >= 0
      && document.activeElement !== quickSearchInput;
  }, { passive: true });

  quickSearchInput.addEventListener("focus", () => {
    searchBanner.hidden = false;
  });
  quickSearchInput.addEventListener("blur", () => {
    window.requestAnimationFrame(() => {
      searchBanner.hidden = tools.getBoundingClientRect().bottom >= 0;
    });
  });
})();
