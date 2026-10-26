document.querySelectorAll(".menu-toggle").forEach((toggle) => {
  const navigation = document.getElementById(toggle.getAttribute("aria-controls"));
  if (!navigation) return;

  const mobileViewport = window.matchMedia("(max-width: 760px)");

  const closeMenu = () => {
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Ouvrir le menu");
    navigation.hidden = mobileViewport.matches;
  };

  const updateViewport = () => {
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Ouvrir le menu");
    navigation.hidden = mobileViewport.matches;
  };

  toggle.addEventListener("click", () => {
    const opening = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(opening));
    toggle.setAttribute("aria-label", opening ? "Fermer le menu" : "Ouvrir le menu");
    navigation.hidden = !opening;
  });

  navigation.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      closeMenu();
      toggle.focus();
    }
  });

  mobileViewport.addEventListener("change", updateViewport);
  updateViewport();
});

document.querySelectorAll(".article-toggle").forEach((toggle) => {
  const article = toggle.previousElementSibling;
  const description = article?.querySelector(".article-description");
  if (!article || !description) return;

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", `${expanded ? "Masquer" : "Afficher"} la description de l'article`);
    article.classList.toggle("is-expanded", expanded);
    description.setAttribute("aria-hidden", String(!expanded));
  });
});