"""Génère les pages d'articles et de critiques de La Tortue.

Pour chaque article JSON de articles-data/ :
  - crée articles/<slug>.html ;
  - supprime les pages générées dont le JSON a disparu (les pages écrites à la main,
    sans le repère de génération, ne sont jamais touchées) ;
  - met à jour les aperçus de index.html et articles.html (entre les marqueurs) ;
  - met à jour la section « Articles à venir » de index.html (depuis articles-data-avenir/) ;
  - remplace l'édito de index.html (depuis site-data/edito.json) ;
  - met à jour sitemap.xml.

Pour chaque critique JSON de critiques-data/ :
  - crée critiques/<slug>.html ;
  - met à jour les cartes et les filtres de critique.html.

Usage (depuis la racine du dépôt) :  python scripts/generer_articles.py
"""

import html
import json
import re
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Optional


ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "articles-data"
CRITIQUES_DATA_DIR = ROOT_DIR / "critiques-data"
AVENIR_DIR = ROOT_DIR / "articles-data-avenir"
EDITO_PATH = ROOT_DIR / "site-data" / "edito.json"
ARTICLES_DIR = ROOT_DIR / "articles"
CRITIQUES_DIR = ROOT_DIR / "critiques"
INDEX_PATH = ROOT_DIR / "index.html"
LIST_PATH = ROOT_DIR / "articles.html"
CRITIQUE_LIST_PATH = ROOT_DIR / "critique.html"
SITEMAP_PATH = ROOT_DIR / "sitemap.xml"
DOMAINE_SITE = "https://latortuequipense.fr"

MARKER_START = "<!-- ARTICLES_GENERES_DEBUT -->"
MARKER_END = "<!-- ARTICLES_GENERES_FIN -->"
EDITO_START = "<!-- EDITO_DEBUT -->"
EDITO_END = "<!-- EDITO_FIN -->"
AVENIR_START = "<!-- AVENIR_DEBUT -->"
AVENIR_END = "<!-- AVENIR_FIN -->"
CRITIQUES_ACCUEIL_START = "<!-- CRITIQUES_ACCUEIL_DEBUT -->"
CRITIQUES_ACCUEIL_END = "<!-- CRITIQUES_ACCUEIL_FIN -->"
# Repère placé dans chaque page générée : seules ces pages peuvent être supprimées automatiquement.
MARQUEUR_GENERE = "<!-- Page générée par scripts/generer_articles.py : ne pas modifier à la main -->"
# Dans « Articles à venir » : True affiche « Prévu le 3 novembre 2026 », False affiche « À venir ».
AFFICHER_DATE_AVENIR = False
REQUIRED_FIELDS = ("slug", "titre", "soustitre", "date", "description", "temps_lecture", "corps")
CRITIQUE_TYPES = {"Livre", "Film", "Série"}
CRITIQUE_IMAGE_PATTERN = re.compile(r"images-critiques/[a-z0-9][a-z0-9._-]*\.(?:png|jpg|gif|webp)")
CRITIQUE_LIST_FIELDS = ("tags", "disciplines", "categories")
CRITIQUE_TEXT_FIELDS = ("auteur", "soustitre")
LONGUEUR_EXTRAIT_CRITIQUE = 700
OPTIONAL_LIST_FIELDS = ("tags", "disciplines", "categories", "motscles")
OPTIONAL_TEXT_FIELDS = ("meta_title", "meta_description", "notes")
MOIS_FR = (
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
)

# En-tête et pied de page : repris à l'identique de articles/manifestations-lyceennes.html
ENTETE_NAVIGATION = """    <header>
      <a class="marque" href="../index.html">
        <img class="logo" src="../logo.svg" alt="La Tortue">
      </a>
      <button class="menu-toggle" type="button" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="navigation-principale">
        <span class="menu-toggle-icon" aria-hidden="true"><span></span><span></span><span></span></span>
      </button>
      <nav id="navigation-principale" class="navigation" aria-label="Navigation principale">
        <a href="../index.html#articles">Articles</a>
        <a href="../critique.html">Critiques</a>
        <a href="../a-propos.html">À propos</a>
      </nav>
    </header>"""

PIED_DE_PAGE = """    <footer class="pied">
      <div class="pied-colonnes">
        <nav class="pied-col" aria-label="Plan du site">
          <h2>Plan du site</h2>
          <ul>
            <li><a href="../index.html">Accueil</a></li>
            <li><a href="../articles.html">Articles</a></li>
            <li><a href="../critique.html">Critiques</a></li>
            <li><a href="../a-propos.html">À propos et contact</a></li>
          </ul>
        </nav>
        <nav class="pied-col" aria-label="Informations">
          <h2>Informations</h2>
          <ul>
            <li><a href="../confidentialite.html">Politique de confidentialité</a></li>
            <li><a href="../accessibilite.html">Déclaration d’accessibilité</a></li>
            <li><a href="../mentions-legales.html">Mentions légales</a></li>
            <li><a href="../charte-utilisation-IA.html">Charte d’utilisation de l’IA</a></li>
            <li><a href="../report.html">Signaler un problème</a></li>
          </ul>
        </nav>
        <nav class="pied-col" aria-label="Newsletter">
          <h2>Newsletter</h2>
          <ul><li><a href="../newsletter.html">S’abonner</a></li></ul>
        </nav>
      </div>
      <p class="pied-copy">© 2026 La Tortue</p>
    </footer>"""

KATEX_ASSETS = """<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.css" integrity="sha384-nH0MfJ44wi1dd7w6jinlyBgljjS8EJAh2JBoRad8a3VDw2K69vfaaqm4WnR+gXtA" crossorigin="anonymous">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.js" integrity="sha384-CwjPRVHTvLiMBFjEoij+QZViMV5rhTOIp7CJzl24JEqpRDA1sJFHVXXLURktbYYp" crossorigin="anonymous"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/contrib/auto-render.min.js" integrity="sha384-bjyGPfbij8/NDKJhSGZNP/khQVgtHUE5exjm4Ydllo42FwIgYsdLO2lXGmRBf5Mz" crossorigin="anonymous" onload="renderMathInElement(document.querySelector('.billet-texte'), { throwOnError: false })"></script>
"""


def echapper(valeur: str) -> str:
    return html.escape(valeur, quote=True)


class NettoyeurHTMLCritique(HTMLParser):
    balises = {
        "a", "blockquote", "br", "div", "em", "h2", "h3", "i", "li", "ol",
        "p", "strong", "sub", "sup", "ul",
    }
    balises_interdites = {"script", "style", "iframe", "object", "embed", "svg", "math", "template"}
    balises_vides = {"br"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.sortie: list[str] = []
        self.pile: list[tuple[str, str]] = []
        self.balises_supprimees: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        if self.balises_supprimees:
            if tag in self.balises_interdites:
                self.balises_supprimees.append(tag)
            return
        if tag in self.balises_interdites:
            self.balises_supprimees.append(tag)
            return
        if tag not in self.balises:
            return
        sortie = {"b": "strong", "i": "em", "div": "p"}.get(tag, tag)
        attributs = ""
        if tag == "a":
            href = next((value or "" for key, value in attrs if key.lower() == "href"), "")
            if re.fullmatch(r"(?:https?://[^\s]+|mailto:[^\s]+|#[^\s]*|/(?!/)[^\s]*|\.\.?/[^\s]*)", href, re.IGNORECASE):
                attributs = f' href="{echapper(href)}"'
                if href.lower().startswith(("http://", "https://")):
                    attributs += ' rel="noopener noreferrer"'
            else:
                sortie = ""
        if sortie:
            self.sortie.append(f"<{sortie}{attributs}>")
            if sortie not in self.balises_vides:
                self.pile.append((tag, sortie))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag not in self.balises_vides and self.pile and self.pile[-1][0] == tag:
            self.sortie.append(f"</{self.pile.pop()[1]}>")

    def handle_endtag(self, tag: str) -> None:
        if self.balises_supprimees:
            for index in range(len(self.balises_supprimees) - 1, -1, -1):
                if self.balises_supprimees[index] == tag:
                    del self.balises_supprimees[index:]
                    break
            return
        position = next((index for index in range(len(self.pile) - 1, -1, -1) if self.pile[index][0] == tag), None)
        if position is None:
            return
        while len(self.pile) > position:
            _, sortie = self.pile.pop()
            self.sortie.append(f"</{sortie}>")

    def handle_data(self, data: str) -> None:
        if not self.balises_supprimees:
            self.sortie.append(echapper(data))

    def nettoyer(self, source: str) -> str:
        self.feed(source)
        self.close()
        while self.pile:
            _, sortie = self.pile.pop()
            self.sortie.append(f"</{sortie}>")
        return "".join(self.sortie).strip()


def nettoyer_texte_critique(source: str) -> str:
    """Conserve une mise en forme limitée et sûre, tout en prenant en charge les anciennes fiches en texte brut."""
    if not re.search(r"<\s*/?\s*(?:a|blockquote|br|div|em|h2|h3|i|li|ol|p|strong|sub|sup|ul)\b", source, re.IGNORECASE):
        paragraphes = []
        for paragraphe in re.split(r"\n\s*\n", source):
            lignes = [echapper(ligne.strip()) for ligne in paragraphe.splitlines() if ligne.strip()]
            if lignes:
                paragraphes.append(f"<p>{'<br>'.join(lignes)}</p>")
        return "\n".join(paragraphes)
    return NettoyeurHTMLCritique().nettoyer(source)


def texte_critique_sans_html(source: str) -> str:
    texte = re.sub(r"<br\s*/?>", " ", source, flags=re.IGNORECASE)
    texte = re.sub(r"</(?:p|blockquote|h2|h3|li)>", " ", texte, flags=re.IGNORECASE)
    texte = re.sub(r"<[^>]*>", "", texte)
    return re.sub(r"\s+", " ", html.unescape(texte)).strip()


class TronqueurHTMLCritique(HTMLParser):
    balises_vides = {"br"}

    def __init__(self, limite: int) -> None:
        super().__init__(convert_charrefs=True)
        self.limite = limite
        self.longueur = 0
        self.sortie: list[str] = []
        self.pile: list[str] = []
        self.tronque = False

    def _fermer(self) -> None:
        while self.pile:
            self.sortie.append(f"</{self.pile.pop()}>")
        self.tronque = True

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        if self.tronque:
            return
        attributs = "".join(
            f' {nom}="{echapper(valeur or "")}"' for nom, valeur in attrs
        )
        self.sortie.append(f"<{tag}{attributs}>")
        if tag not in self.balises_vides:
            self.pile.append(tag)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        if self.tronque:
            return
        attributs = "".join(
            f' {nom}="{echapper(valeur or "")}"' for nom, valeur in attrs
        )
        self.sortie.append(f"<{tag}{attributs}/>")

    def handle_endtag(self, tag: str) -> None:
        if self.tronque:
            return
        position = next(
            (index for index in range(len(self.pile) - 1, -1, -1) if self.pile[index] == tag),
            None,
        )
        if position is None:
            return
        while len(self.pile) > position:
            self.sortie.append(f"</{self.pile.pop()}>")

    def handle_data(self, data: str) -> None:
        if self.tronque:
            return
        restant = self.limite - self.longueur
        if restant <= 0:
            if data.strip():
                self.sortie.append("…")
                self._fermer()
            return
        if len(data) > restant:
            portion = data[:restant]
            coupure = portion.rfind(" ")
            if coupure >= restant * 0.7:
                portion = portion[:coupure]
            self.sortie.append(echapper(portion.rstrip()))
            self.sortie.append("…")
            self.longueur += len(portion)
            self._fermer()
            return
        self.sortie.append(echapper(data))
        self.longueur += len(data)


def tronquer_texte_critique(source: str, limite: int = LONGUEUR_EXTRAIT_CRITIQUE) -> str:
    """Coupe un texte HTML déjà nettoyé sans perdre sa mise en forme."""
    tronqueur = TronqueurHTMLCritique(limite)
    tronqueur.feed(source)
    tronqueur.close()
    while tronqueur.pile:
        tronqueur.sortie.append(f"</{tronqueur.pile.pop()}>")
    return "".join(tronqueur.sortie).strip()


def lire(chemin: Path) -> str:
    """Lit un fichier en UTF-8 sans convertir les fins de ligne (CRLF conservés)."""
    with chemin.open(encoding="utf-8", newline="") as fichier:
        return fichier.read()


def ecrire(chemin: Path, contenu: str) -> None:
    """Écrit en UTF-8 avec des fins de ligne LF, quel que soit le système."""
    with chemin.open("w", encoding="utf-8", newline="\n") as fichier:
        fichier.write(contenu)


def date_francaise(date_article: date) -> str:
    jour = "1er" if date_article.day == 1 else str(date_article.day)
    return f"{jour} {MOIS_FR[date_article.month - 1]} {date_article.year}"


def valider_article(data: Any, source: Path) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError(f"{source}: chaque fichier JSON doit contenir un objet.")

    for champ in REQUIRED_FIELDS:
        if not isinstance(data.get(champ), str) or not data[champ].strip():
            raise ValueError(f"{source}: le champ « {champ} » doit être une chaîne non vide.")

    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", data["slug"]):
        raise ValueError(f"{source}: « slug » doit contenir uniquement des minuscules, chiffres et tirets.")

    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", data["date"]):
        raise ValueError(f"{source}: « date » doit être au format AAAA-MM-JJ.")
    try:
        date_article = date.fromisoformat(data["date"])
    except ValueError as erreur:
        raise ValueError(f"{source}: « date » doit être au format AAAA-MM-JJ.") from erreur

    article = dict(data)
    article["date_obj"] = date_article
    article["date_affichee"] = date_francaise(date_article)

    for champ in OPTIONAL_LIST_FIELDS:
        valeurs = article.get(champ, [])
        if not isinstance(valeurs, list) or any(
            not isinstance(valeur, str) or not valeur.strip() for valeur in valeurs
        ):
            raise ValueError(f"{source}: « {champ} » doit être une liste de chaînes non vides.")
        article[champ] = valeurs

    for champ in OPTIONAL_TEXT_FIELDS:
        valeur = article.get(champ, "")
        if not isinstance(valeur, str):
            raise ValueError(f"{source}: « {champ} » doit être une chaîne de caractères.")
        article[champ] = valeur.strip()

    return article


def charger_articles(dossier: Path = DATA_DIR) -> list[dict[str, Any]]:
    # Git ne garde pas les dossiers vides : un dossier absent signifie « aucun article ».
    if not dossier.exists():
        return []

    articles = []
    slugs = set()
    for fichier_json in sorted(dossier.glob("*.json")):
        try:
            data = json.loads(lire(fichier_json))
        except json.JSONDecodeError as erreur:
            raise ValueError(
                f"{fichier_json}:{erreur.lineno}:{erreur.colno}: JSON invalide ({erreur.msg})."
            ) from erreur
        article = valider_article(data, fichier_json)
        if article["slug"] in slugs:
            raise ValueError(f"Slug d’article en double : {article['slug']}")
        slugs.add(article["slug"])
        articles.append(article)

    # Plus récent d'abord ; à date égale, ordre alphabétique des slugs (résultat stable).
    articles.sort(key=lambda article: article["slug"])
    articles.sort(key=lambda article: article["date_obj"], reverse=True)
    return articles


def valider_critique(data: Any, source: Path) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise ValueError(f"{source}: chaque fichier JSON doit contenir un objet.")

    for champ in ("slug", "titre", "type", "critique", "image", "date"):
        if not isinstance(data.get(champ), str) or not data[champ].strip():
            raise ValueError(f"{source}: le champ « {champ} » doit être une chaîne non vide.")
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", data["slug"]):
        raise ValueError(f"{source}: « slug » doit contenir uniquement des minuscules, chiffres et tirets.")
    if data["type"] not in CRITIQUE_TYPES:
        raise ValueError(f"{source}: « type » doit être Livre, Film ou Série.")
    if not CRITIQUE_IMAGE_PATTERN.fullmatch(data["image"]):
        raise ValueError(f"{source}: « image » doit désigner un fichier de images-critiques/.")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", data["date"]):
        raise ValueError(f"{source}: « date » doit être au format AAAA-MM-JJ.")
    try:
        date_critique = date.fromisoformat(data["date"])
    except ValueError as erreur:
        raise ValueError(f"{source}: « date » doit être au format AAAA-MM-JJ.") from erreur

    critique = dict(data)
    for champ in CRITIQUE_TEXT_FIELDS:
        valeur = critique.get(champ, "")
        if not isinstance(valeur, str):
            raise ValueError(f"{source}: « {champ} » doit être une chaîne de caractères.")
        critique[champ] = valeur.strip()
    for champ in CRITIQUE_LIST_FIELDS:
        valeurs = critique.get(champ, [])
        if not isinstance(valeurs, list) or any(
            not isinstance(valeur, str) or not valeur.strip() for valeur in valeurs
        ):
            raise ValueError(f"{source}: « {champ} » doit être une liste de chaînes non vides.")
        critique[champ] = valeurs
    critique["date_obj"] = date_critique
    critique["date_affichee"] = date_francaise(date_critique)
    return critique


def charger_critiques(dossier: Path = CRITIQUES_DATA_DIR) -> list[dict[str, Any]]:
    if not dossier.exists():
        return []

    critiques = []
    slugs = set()
    for fichier_json in sorted(dossier.glob("*.json")):
        try:
            data = json.loads(lire(fichier_json))
        except json.JSONDecodeError as erreur:
            raise ValueError(
                f"{fichier_json}:{erreur.lineno}:{erreur.colno}: JSON invalide ({erreur.msg})."
            ) from erreur
        critique = valider_critique(data, fichier_json)
        if critique["slug"] != fichier_json.stem:
            raise ValueError(f"{fichier_json}: le slug doit correspondre au nom du fichier.")
        if critique["slug"] in slugs:
            raise ValueError(f"Slug de critique en double : {critique['slug']}")
        slugs.add(critique["slug"])
        critiques.append(critique)

    critiques.sort(key=lambda critique: critique["slug"])
    critiques.sort(key=lambda critique: critique["date_obj"], reverse=True)
    return critiques


def contient_formules(corps: str) -> bool:
    if re.search(r'class=["\'][^"\']*\bformule\b', corps, re.IGNORECASE):
        return True
    # Formules écrites directement dans le texte : \( ... \), \[ ... \] ou $$ ... $$
    return bool(re.search(r"\\\(|\\\[|\$\$", corps))


def generer_page_article(article: dict[str, Any]) -> None:
    titre = echapper(article["titre"])
    meta_title = echapper(article["meta_title"] or f'{article["titre"]} — La Tortue')
    meta_description = echapper(article["meta_description"] or article["description"])
    soustitre = echapper(article["soustitre"])
    slug = echapper(article["slug"])
    date_iso = article["date_obj"].isoformat()
    date_affichee = echapper(article["date_affichee"])
    temps_lecture = echapper(article["temps_lecture"])
    motscles = ", ".join(article["motscles"])
    meta_motscles = (
        f'<meta name="keywords" content="{echapper(motscles)}">\n'
        if motscles else ""
    )
    meta_description_brute = article["meta_description"] or article["description"]
    notes_html = ""
    if article["notes"].strip():
        notes_html = f"""
      <section class="notes" aria-label="Notes">
{article["notes"]}
      </section>
"""
    figure_script = (
        '<script src="../schema-descriptions.js" defer></script>\n'
        if re.search(r"<figure\b", article["corps"], re.IGNORECASE) else ""
    )
    formule_assets = KATEX_ASSETS if contient_formules(article["corps"]) else ""
    structured_data = json.dumps(
        {
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": article["titre"],
            "description": meta_description_brute,
            "datePublished": date_iso,
            "mainEntityOfPage": f"{DOMAINE_SITE}/articles/{article['slug']}.html",
        },
        ensure_ascii=False,
    ).replace("</", "<\\/")

    html_content = f"""<!DOCTYPE html>
{MARQUEUR_GENERE}
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{meta_title}</title>
<meta name="description" content="{meta_description}">
{meta_motscles}<link rel="stylesheet" href="../charte.css">
<script src="../menu.js" defer></script>
<link rel="stylesheet" href="../article.css">
{figure_script}{formule_assets}<link rel="canonical" href="{DOMAINE_SITE}/articles/{slug}.html">
<meta property="og:type" content="article">
<meta property="og:title" content="{meta_title}">
<meta property="og:description" content="{meta_description}">
<meta property="og:url" content="{DOMAINE_SITE}/articles/{slug}.html">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{meta_title}">
<meta name="twitter:description" content="{meta_description}">
<link rel="icon" type="image/png" href="../favicon/favicon-96x96.png" sizes="96x96">
<link rel="icon" type="image/svg+xml" href="../favicon/favicon.svg">
<link rel="shortcut icon" href="../favicon/favicon.ico">
<link rel="apple-touch-icon" sizes="180x180" href="../favicon/apple-touch-icon.png">
<link rel="manifest" href="../favicon/site.webmanifest">
<script type="application/ld+json">{structured_data}</script>
</head>
<body>
  <div class="progression" aria-hidden="true"></div>
  <div class="page">

{ENTETE_NAVIGATION}

    <article>
      <div class="billet-entete">
        <h1>{titre}</h1>
        <div class="ornement"></div>
        <p class="sous-titre">{soustitre}</p>
        <p class="billet-meta"><time datetime="{date_iso}">{date_affichee}</time><span>{temps_lecture} de lecture</span></p>
        <div class="billet-actions">
          <button type="button" onclick="window.print()">
            Télécharger l’article en PDF
          </button>
        </div>
      </div>

      <div class="billet-texte">
{article["corps"]}
      </div>
{notes_html}    </article>

    <div class="billet-fin">
      <div class="ornement"></div>
      <a class="lien" href="../index.html">Retour à l’accueil</a>
    </div>

{PIED_DE_PAGE}

  </div>
</body>
</html>
"""
    ARTICLES_DIR.mkdir(parents=True, exist_ok=True)
    ecrire(ARTICLES_DIR / f"{article['slug']}.html", html_content)


def generer_page_critique(critique: dict[str, Any]) -> None:
    titre_brut = critique["titre"]
    auteur_brut = critique["auteur"]
    titre = echapper(critique["titre"])
    texte_html = nettoyer_texte_critique(critique["critique"])
    texte_brut = texte_critique_sans_html(texte_html)
    resume = echapper(texte_brut[:180])
    type_media = echapper(critique["type"])
    slug = echapper(critique["slug"])
    auteur = echapper(critique["auteur"])
    soustitre = echapper(critique["soustitre"])
    date_iso = critique["date_obj"].isoformat()
    date_affichee = echapper(critique["date_affichee"])
    image = "../" + echapper(critique["image"])
    paragraphes = "\n".join(f"        {ligne}" for ligne in texte_html.splitlines()) if "\n" in texte_html else f"        {texte_html}"
    titre_affiche = f"{titre} — {auteur}" if auteur else titre
    titre_affiche_brut = f"{titre_brut} — {auteur_brut}" if auteur_brut else titre_brut
    structured_data = json.dumps(
        {
            "@context": "https://schema.org",
            "@type": "Review",
            "name": titre_affiche_brut,
            "reviewBody": texte_brut,
            "itemReviewed": {
                "@type": "CreativeWork",
                "name": titre_brut,
                **({"author": {"@type": "Person", "name": auteur_brut}} if auteur_brut else {}),
            },
            "datePublished": date_iso,
        },
        ensure_ascii=False,
    ).replace("</", "<\\/")

    html_content = f"""<!DOCTYPE html>
{MARQUEUR_GENERE}
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{titre_affiche} — Critique — La Tortue</title>
<meta name="description" content="{resume}">
<link rel="stylesheet" href="../charte.css">
<link rel="stylesheet" href="../critique.css">
<link rel="stylesheet" href="../article.css">
<script src="../menu.js" defer></script>
<link rel="canonical" href="{DOMAINE_SITE}/critiques/{slug}.html">
<meta property="og:type" content="article">
<meta property="og:title" content="{titre_affiche} — Critique — La Tortue">
<meta property="og:description" content="{resume}">
<meta property="og:image" content="{DOMAINE_SITE}/{echapper(critique["image"])}">
<meta property="og:url" content="{DOMAINE_SITE}/critiques/{slug}.html">
<link rel="icon" type="image/svg+xml" href="../favicon/favicon.svg">
<script type="application/ld+json">{structured_data}</script>
</head>
<body>
  <div class="page">
{ENTETE_NAVIGATION}
    <main class="critique-section critique-detail">
      <article class="critique-article" data-type="{type_media}">
        <header class="billet-entete">
          <h1 class="critique-titre">{titre_affiche}</h1>
          <div class="ornement"></div>
          {f'<p class="sous-titre">{soustitre}</p>' if soustitre else ""}
          <p class="billet-meta"><time datetime="{date_iso}">{date_affichee}</time></p>
        </header>
        <div class="critique-corps billet-texte">
          <img src="{image}" alt="{echapper('Couverture' if critique['type'] == 'Livre' else 'Affiche')} de {titre}" class="critique-couverture">
{paragraphes}
        </div>
      </article>
      <a class="critique-lire" href="../critique.html">← Retour à toutes les critiques</a>
    </main>
{PIED_DE_PAGE}
  </div>
</body>
</html>
"""
    CRITIQUES_DIR.mkdir(parents=True, exist_ok=True)
    ecrire(CRITIQUES_DIR / f"{critique['slug']}.html", html_content)


def supprimer_critiques_orphelines(slugs: set[str]) -> None:
    if not CRITIQUES_DIR.exists():
        return
    for page in sorted(CRITIQUES_DIR.glob("*.html")):
        if page.stem not in slugs and MARQUEUR_GENERE in lire(page)[:600]:
            page.unlink()
            print(f"Page supprimée (critique retirée) : {page.name}")


def generer_apercu(article: dict[str, Any], liste_complete: bool) -> str:
    slug = echapper(article["slug"])
    description_id = f"description-{slug}-genere"
    tags = ", ".join(article["tags"])
    disciplines = ", ".join(article["disciplines"])
    categories = ", ".join(article["categories"])
    motscles = ", ".join(article["motscles"])
    tags_html = "".join(
        f'<span class="tag">{echapper(tag)}</span>' for tag in article["tags"]
    )
    metadonnees = ""
    if liste_complete:
        metadonnees = (
            f' data-tags="{echapper(tags)}"'
            f' data-disciplines="{echapper(disciplines)}"'
            f' data-categories="{echapper(categories)}"'
            f' data-motscles="{echapper(motscles)}"'
        )

    return f"""<article class="article-row">
  <a class="article" href="articles/{slug}.html"{metadonnees}>
    <span class="date">{echapper(article["date_affichee"])}</span>
    <div class="article-corps">
      <h2>{echapper(article["titre"])}</h2>
      <span class="article-description" id="{description_id}" aria-hidden="true">{echapper(article["description"])}</span>
      <div class="article-tags">{tags_html}</div>
    </div>
    <span class="fleche" aria-hidden="true">→</span>
  </a>
  <button class="article-toggle" type="button" aria-label="Afficher la description de l’article" aria-expanded="false" aria-controls="{description_id}">
    <span class="fleche" aria-hidden="true">↓</span>
  </button>
</article>"""


def verifier_marqueurs(
    chemin_page: Path,
    debut_marqueur: str = MARKER_START,
    fin_marqueur: str = MARKER_END,
) -> str:
    """Vérifie la présence d'une seule paire de marqueurs et renvoie le contenu de la page."""
    if not chemin_page.exists():
        raise FileNotFoundError(f"Page à mettre à jour introuvable : {chemin_page}")
    contenu = lire(chemin_page)
    if contenu.count(debut_marqueur) != 1 or contenu.count(fin_marqueur) != 1:
        raise ValueError(
            f"{chemin_page}: il faut exactement un marqueur {debut_marqueur} et un marqueur {fin_marqueur}."
        )
    if contenu.index(debut_marqueur) > contenu.index(fin_marqueur):
        raise ValueError(f"{chemin_page}: les marqueurs {debut_marqueur} et {fin_marqueur} sont dans le désordre.")
    return contenu


def mettre_a_jour_page(
    chemin_page: Path,
    snippets: list[str],
    debut_marqueur: str = MARKER_START,
    fin_marqueur: str = MARKER_END,
) -> None:
    contenu = verifier_marqueurs(chemin_page, debut_marqueur, fin_marqueur)
    fin_de_ligne = "\r\n" if "\r\n" in contenu else "\n"
    debut = contenu.index(debut_marqueur) + len(debut_marqueur)
    fin = contenu.index(fin_marqueur)

    bloc = "\n" + "\n".join(snippets) + "\n        "
    bloc = bloc.replace("\n", fin_de_ligne)
    nouveau = contenu[:debut] + bloc + contenu[fin:]
    if nouveau != contenu:
        with chemin_page.open("w", encoding="utf-8", newline="") as fichier:
            fichier.write(nouveau)


def supprimer_pages_orphelines(slugs: set[str]) -> None:
    """Supprime les pages générées dont l'article JSON n'existe plus."""
    if not ARTICLES_DIR.exists():
        return
    for page in sorted(ARTICLES_DIR.glob("*.html")):
        if page.stem in slugs:
            continue
        if MARQUEUR_GENERE in lire(page)[:600]:
            page.unlink()
            print(f"Page supprimée (article retiré) : {page.name}")


def remplacer_entre_marqueurs(chemin: Path, debut: str, fin: str, bloc: str) -> None:
    """Remplace le contenu entre deux marqueurs ; ignore la page si les marqueurs manquent."""
    contenu = lire(chemin)
    if contenu.count(debut) != 1 or contenu.count(fin) != 1:
        print(f"Avertissement : marqueurs {debut} / {fin} absents de {chemin.name} ; bloc non mis à jour.")
        return
    if contenu.index(debut) > contenu.index(fin):
        raise ValueError(f"{chemin}: les marqueurs {debut} et {fin} sont dans le désordre.")
    fin_de_ligne = "\r\n" if "\r\n" in contenu else "\n"
    position = contenu.index(debut) + len(debut)
    bloc = bloc.replace("\r\n", "\n").replace("\n", fin_de_ligne)
    nouveau = contenu[:position] + bloc + contenu[contenu.index(fin):]
    if nouveau != contenu:
        with chemin.open("w", encoding="utf-8", newline="") as fichier:
            fichier.write(nouveau)


def charger_edito() -> Optional[str]:
    """Renvoie le HTML de l'édito, ou None si site-data/edito.json n'existe pas."""
    if not EDITO_PATH.exists():
        return None
    try:
        data = json.loads(lire(EDITO_PATH))
    except json.JSONDecodeError as erreur:
        raise ValueError(f"{EDITO_PATH}: JSON invalide ({erreur.msg}).") from erreur
    corps = data.get("corps") if isinstance(data, dict) else None
    if not isinstance(corps, str) or not corps.strip():
        raise ValueError(f"{EDITO_PATH}: le champ « corps » doit être une chaîne non vide.")
    return corps.strip()


def generer_edito(corps: str) -> str:
    lignes = "\n".join(f"        {ligne}" if ligne.strip() else "" for ligne in corps.splitlines())
    return f"\n{lignes}\n        "


def generer_avenir(articles: list[dict[str, Any]]) -> str:
    elements = []
    for article in articles:
        libelle = f"Prévu le {article['date_affichee']}" if AFFICHER_DATE_AVENIR else "À venir"
        elements.append(
            f'''        <a class="article" href="error.html">
          <span class="date">{echapper(libelle)}</span>
          <h2>{echapper(article["titre"])}</h2>
          <span class="fleche">→</span>
        </a>'''
        )
    if not elements:
        return "\n        "
    return "\n" + "\n".join(elements) + "\n        "


def generer_apercu_critique(critique: dict[str, Any]) -> str:
    slug = echapper(critique["slug"])
    titre = echapper(critique["titre"])
    auteur = echapper(critique["auteur"])
    titre_affiche = f"{titre} — {auteur}" if auteur else titre
    type_media = echapper(critique["type"])
    image = echapper(critique["image"])
    tags = echapper(", ".join(critique["tags"]))
    disciplines = echapper(", ".join(critique["disciplines"]))
    categories = list(critique["categories"])
    if critique["type"] not in categories:
        categories.insert(0, critique["type"])
    categories_attr = echapper(", ".join(categories))
    texte_html = nettoyer_texte_critique(critique["critique"])
    extrait = tronquer_texte_critique(texte_html)
    soustitre_html = (
        f'  <p class="critique-sous-titre">{echapper(critique["soustitre"])}</p>\n'
        if critique["soustitre"] else ""
    )
    alt = "Couverture" if critique["type"] == "Livre" else "Affiche"
    return f"""<article class="critique-article" data-type="{type_media}" data-tags="{tags}" data-disciplines="{disciplines}" data-categories="{categories_attr}">
  <h2 class="critique-titre">{titre_affiche}</h2>
{soustitre_html}  <div class="critique-corps">
    <img src="{image}" alt="{alt} de {titre}" class="critique-couverture" loading="lazy">
    {extrait}
    <a href="critiques/{slug}.html" class="critique-lire">Continuer à lire</a>
  </div>
  <div class="critique-meta"><span>{echapper(critique["date_affichee"])}</span></div>
</article>"""


def generer_sitemap(articles: list[dict[str, Any]], critiques: list[dict[str, Any]]) -> None:
    """Génère et met à jour automatiquement le fichier sitemap.xml."""
    pages_fixes = [
        "/",
        "/articles.html",
        "/critique.html",
        "/a-propos.html",
        "/newsletter.html",
        "/confidentialite.html",
        "/accessibilite.html",
        "/mentions-legales.html",
        "/charte-utilisation-IA.html",
    ]

    url_elements = [
        f"  <url>\n    <loc>{DOMAINE_SITE}{page}</loc>\n  </url>" for page in pages_fixes
    ]
    for article in articles:
        slug = echapper(article["slug"])
        url_elements.append(
            f"  <url>\n    <loc>{DOMAINE_SITE}/articles/{slug}.html</loc>\n"
            f"    <lastmod>{article['date_obj'].isoformat()}</lastmod>\n  </url>"
        )
    for critique in critiques:
        slug = echapper(critique["slug"])
        url_elements.append(
            f"  <url>\n    <loc>{DOMAINE_SITE}/critiques/{slug}.html</loc>\n"
            f"    <lastmod>{critique['date_obj'].isoformat()}</lastmod>\n  </url>"
        )

    slugs_generes = {article["slug"] for article in articles}
    if ARTICLES_DIR.exists():
        for page in sorted(ARTICLES_DIR.glob("*.html")):
            if page.stem not in slugs_generes:
                url_elements.append(f"  <url>\n    <loc>{DOMAINE_SITE}/articles/{echapper(page.stem)}.html</loc>\n  </url>")

    corps_sitemap = "\n".join(url_elements)
    sitemap_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{corps_sitemap}
</urlset>
"""
    ecrire(SITEMAP_PATH, sitemap_content)


def main() -> None:
    articles = charger_articles(DATA_DIR)
    critiques = charger_critiques(CRITIQUES_DATA_DIR)
    avenir = charger_articles(AVENIR_DIR)
    if not articles:
        print(f"Aucun fichier JSON d’article dans {DATA_DIR} : les listes seront vides.")

    # Un slug déjà publié ne peut pas rester « à venir ».
    publies = {article["slug"] for article in articles}
    for article in avenir:
        if article["slug"] in publies:
            print(f"Avertissement : « {article['slug']} » est déjà publié ; l'entrée « à venir » est ignorée.")
    avenir = [article for article in avenir if article["slug"] not in publies]
    avenir.sort(key=lambda article: (article["date_obj"], article["slug"]))

    edito = charger_edito()

    # On vérifie tout avant d'écrire quoi que ce soit.
    verifier_marqueurs(INDEX_PATH)
    verifier_marqueurs(INDEX_PATH, CRITIQUES_ACCUEIL_START, CRITIQUES_ACCUEIL_END)
    verifier_marqueurs(LIST_PATH)
    verifier_marqueurs(CRITIQUE_LIST_PATH)

    for article in articles:
        generer_page_article(article)
    supprimer_pages_orphelines(publies)
    for critique in critiques:
        generer_page_critique(critique)
    supprimer_critiques_orphelines({critique["slug"] for critique in critiques})

    apercus_accueil = [generer_apercu(article, False) for article in articles[:3]]
    apercus_liste = [generer_apercu(article, True) for article in articles]
    mettre_a_jour_page(INDEX_PATH, apercus_accueil)
    mettre_a_jour_page(
        INDEX_PATH,
        [generer_apercu_critique(critique) for critique in critiques[:3]],
        CRITIQUES_ACCUEIL_START,
        CRITIQUES_ACCUEIL_END,
    )
    mettre_a_jour_page(LIST_PATH, apercus_liste)
    mettre_a_jour_page(
        CRITIQUE_LIST_PATH,
        [generer_apercu_critique(critique) for critique in critiques],
    )
    remplacer_entre_marqueurs(INDEX_PATH, AVENIR_START, AVENIR_END, generer_avenir(avenir))
    if edito is not None:
        remplacer_entre_marqueurs(INDEX_PATH, EDITO_START, EDITO_END, generer_edito(edito))
    generer_sitemap(articles, critiques)

    print(
        f"{len(articles)} article(s) et {len(critiques)} critique(s) généré(s), {len(avenir)} à venir ; "
        "index.html, articles.html, critique.html et sitemap.xml mis à jour."
    )


if __name__ == "__main__":
    main()