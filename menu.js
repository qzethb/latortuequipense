const themePreference = window.matchMedia("(prefers-color-scheme: dark)");
const themeToggle = document.createElement("button");
themeToggle.className = "theme-toggle";
themeToggle.type = "button";

let savedTheme = null;
try {
  const storedTheme = localStorage.getItem("la-tortue-theme");
  if (storedTheme === "light" || storedTheme === "dark") savedTheme = storedTheme;
} catch (error) {
  console.warn("La préférence de thème ne peut pas être lue.", error);
}

const selectedTheme = () => document.documentElement.dataset.theme
  || (themePreference.matches ? "dark" : "light");

const updateThemeToggle = () => {
  const nextTheme = selectedTheme() === "dark" ? "light" : "dark";
  themeToggle.textContent = "∨";
  themeToggle.setAttribute("aria-label", `Activer le mode ${nextTheme === "dark" ? "sombre" : "clair"}`);
  themeToggle.title = `Activer le mode ${nextTheme === "dark" ? "sombre" : "clair"}`;
};

if (savedTheme) document.documentElement.dataset.theme = savedTheme;

const header = document.querySelector("header");
const navigation = header?.querySelector(".navigation");
if (navigation) {
  navigation.append(themeToggle);
} else if (header) {
  header.append(themeToggle);
} else {
  themeToggle.classList.add("theme-toggle--floating");
  const main = document.querySelector("main");
  if (main) {
    main.prepend(themeToggle);
  } else {
    document.body.append(themeToggle);
  }
}

updateThemeToggle();
themePreference.addEventListener("change", () => {
  if (!document.documentElement.dataset.theme) updateThemeToggle();
});

themeToggle.addEventListener("click", () => {
  const theme = selectedTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  updateThemeToggle();
  try {
    localStorage.setItem("la-tortue-theme", theme);
  } catch (error) {
    console.warn("La préférence de thème ne peut pas être enregistrée.", error);
  }
});

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