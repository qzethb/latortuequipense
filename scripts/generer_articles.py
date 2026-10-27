import html
import json
import re
from datetime import date
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "articles-data"
ARTICLES_DIR = ROOT_DIR / "articles"
INDEX_PATH = ROOT_DIR / "index.html"
LIST_PATH = ROOT_DIR / "articles.html"
SITEMAP_PATH = ROOT_DIR / "sitemap.xml"  # Ajouté pour le sitemap
DOMAINE_SITE = "https://latortuequipense.fr"  # Ajouté pour le sitemap

MARKER_START = "<!-- ARTICLES_GENERES_DEBUT -->"
MARKER_END = "<!-- ARTICLES_GENERES_FIN -->"
REQUIRED_FIELDS = ("slug", "titre", "soustitre", "date", "description", "temps_lecture", "corps")
OPTIONAL_LIST_FIELDS = ("tags", "disciplines", "motscles")
OPTIONAL_TEXT_FIELDS = ("meta_title", "meta_description", "notes")
MOIS_FR = (
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
)


def echapper(valeur: str) -> str:
    return html.escape(valeur, quote=True)


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
    article["date_affichee"] = (
        f"{date_article.day} {MOIS_FR[date_article.month - 1]} {date_article.year}"
    )

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


def charger_articles() -> list[dict[str, Any]]:
    if not DATA_DIR.exists():
        raise FileNotFoundError(f"Le dossier des données est introuvable : {DATA_DIR}")

    articles = []
    slugs = set()
    for fichier_json in sorted(DATA_DIR.glob("*.json")):
        try:
            with fichier_json.open(encoding="utf-8") as fichier:
                data = json.load(fichier)
        except json.JSONDecodeError as erreur:
            raise ValueError(
                f"{fichier_json}:{erreur.lineno}:{erreur.colno}: JSON invalide ({erreur.msg})."
            ) from erreur
        article = valider_article(data, fichier_json)
        if article["slug"] in slugs:
            raise ValueError(f"Slug d’article en double : {article['slug']}")
        slugs.add(article["slug"])
        articles.append(article)

    articles.sort(key=lambda article: article["date_obj"], reverse=True)
    return articles


def generer_page_article(article: dict[str, Any]) -> None:
    titre = echapper(article["titre"])
    description = echapper(article["description"])
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
        notes_html = f"""      <section class="notes" aria-label="Notes">
        {article["notes"]}
      </section>
"""
    figure_script = (
        '<script src="../schema-descriptions.js" defer></script>\n'
        if re.search(r"<figure\b", article["corps"], re.IGNORECASE) else ""
    )
    formule_assets = ""
    if re.search(r'class=["\'][^"\']*\bformule\b', article["corps"], re.IGNORECASE):
        formule_assets = """<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.css" integrity="sha384-nH0MfJ44wi1dd7w6jinlyBgljjS8EJAh2JBoRad8a3VDw2K69vfaaqm4WnR+gXtA" crossorigin="anonymous">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.js" integrity="sha384-CwjPRVHTvLiMBFjEoij+QZViMV5rhTOIp7CJzl24JEqpRDA1sJFHVXXLURktbYYp" crossorigin="anonymous"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/contrib/auto-render.min.js" integrity="sha384-bjyGPfbij8/NDKJhSGZNP/khQVgtHUE5exjm4Ydllo42FwIgYsdLO2lXGmRBf5Mz" crossorigin="anonymous" onload="renderMathInElement(document.querySelector('.billet-texte'), { throwOnError: false })"></script>
"""
    structured_data = json.dumps(
        {
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": article["titre"],
            "description": meta_description_brute,
            "datePublished": article["date_obj"].isoformat(),
            "mainEntityOfPage": f"https://latortuequipense.fr/articles/{article['slug']}.html",
        },
        ensure_ascii=False,
    ).replace("</", "<\\/")

    html_content = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{meta_title}</title>
<meta name="description" content="{meta_description}">
{meta_motscles}<link rel="stylesheet" href="../charte.css">
<script src="../menu.js" defer></script>
<link rel="stylesheet" href="../article.css">
{figure_script}{formule_assets}<link rel="canonical" href="https://latortuequipense.fr/articles/{slug}.html">
<meta property="og:type" content="article">
<meta property="og:title" content="{meta_title}">
<meta property="og:description" content="{meta_description}">
<meta property="og:url" content="https://latortuequipense.fr/articles/{slug}.html">
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
  <div class="page page--lecture">
    <header>
      <a class="marque" href="../index.html">
        <img class="logo" src="../logo.svg" alt="La Tortue">
      </a>
      <button class="menu-toggle" type="button" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="navigation-principale">
        <span class="menu-toggle-icon" aria-hidden="true"><span></span><span></span><span></span></span>
      </button>
      <nav id="navigation-principale" class="navigation" aria-label="Navigation principale">
        <a href="../index.html#articles">Articles</a>
        <a href="../a-propos.html">À propos</a>
        <a href="../contacts.html">Contacts</a>
        <a href="../newsletter.html">Newsletter</a>
      </nav>
    </header>
    <article>
      <div class="billet-entete">
        <h1>{titre}</h1>
        <div class="ornement"></div>
        <p class="sous-titre">{soustitre}</p>
        <p class="billet-meta"><time datetime="{date_iso}">{date_affichee}</time><span>{temps_lecture} de lecture</span></p>
        <div class="billet-actions">
          <button type="button" onclick="window.print()">Télécharger l’article en PDF</button>
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
    <footer>© 2026 La Tortue</footer>
  </div>
</body>
</html>
"""
    ARTICLES_DIR.mkdir(parents=True, exist_ok=True)
    (ARTICLES_DIR / f"{slug}.html").write_text(html_content, encoding="utf-8")


def generer_apercu(article: dict[str, Any], liste_complete: bool) -> str:
    slug = echapper(article["slug"])
    description_id = f"description-{slug}-genere"
    tags = ", ".join(article["tags"])
    disciplines = ", ".join(article["disciplines"])
    motscles = ", ".join(article["motscles"])
    tags_html = "".join(
        f'<span class="tag">{echapper(tag)}</span>' for tag in article["tags"]
    )
    metadonnees = ""
    if liste_complete:
        metadonnees = (
            f' data-tags="{echapper(tags)}"'
            f' data-disciplines="{echapper(disciplines)}"'
            f' data-motscles="{echapper(motscles)}"'
        )

    apercu = f"""<article class="article-row">
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
    return apercu


def mettre_a_jour_page(chemin_page: Path, snippets: list[str]) -> None:
    if not chemin_page.exists():
        raise FileNotFoundError(f"Page à mettre à jour introuvable : {chemin_page}")

    contenu = chemin_page.read_text(encoding="utf-8")
    if contenu.count(MARKER_START) != 1 or contenu.count(MARKER_END) != 1:
        raise ValueError(f"{chemin_page}: il faut une seule paire de marqueurs d’articles générés.")

    debut = contenu.index(MARKER_START) + len(MARKER_START)
    fin = contenu.index(MARKER_END)
    if debut > fin:
        raise ValueError(f"{chemin_page}: les marqueurs d’articles générés sont dans le désordre.")

    bloc = "\n" + "\n".join(snippets) + "\n        "
    chemin_page.write_text(contenu[:debut] + bloc + contenu[fin:], encoding="utf-8")


def verifier_marqueurs(chemin_page: Path) -> None:
    if not chemin_page.exists():
        raise FileNotFoundError(f"Page à mettre à jour introuvable : {chemin_page}")
    contenu = chemin_page.read_text(encoding="utf-8")
    if contenu.count(MARKER_START) != 1 or contenu.count(MARKER_END) != 1:
        raise ValueError(f"{chemin_page}: il faut une seule paire de marqueurs d’articles générés.")
    if contenu.index(MARKER_START) > contenu.index(MARKER_END):
        raise ValueError(f"{chemin_page}: les marqueurs d’articles générés sont dans le désordre.")


def generer_sitemap(articles: list[dict[str, Any]]) -> None:
    """Génère et met à jour automatiquement le fichier sitemap.xml."""
    pages_fixes = [
        "/",
        "/articles.html",
        "/a-propos.html",
        "/contacts.html",
        "/newsletter.html",
        "/confidentialite.html",
        "/accessibilite.html",
        "/mentions-legales.html",
        "/charte-utilisation-IA.html",
    ]
    
    url_elements = []
    for page in pages_fixes:
        url_elements.append(f"  <url>\n    <loc>{DOMAINE_SITE}{page}</loc>\n  </url>")
        
    for article in articles:
        slug = echapper(article["slug"])
        url_elements.append(f"  <url>\n    <loc>{DOMAINE_SITE}/articles/{slug}.html</loc>\n  </url>")
        
    sitemap_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{'\n'.join(url_elements)}
</urlset>
"""
    SITEMAP_PATH.write_text(sitemap_content, encoding="utf-8")


def main() -> None:
    articles = charger_articles()
    if not articles:
        raise ValueError(f"Aucun fichier JSON d’article trouvé dans {DATA_DIR}")

    verifier_marqueurs(INDEX_PATH)
    verifier_marqueurs(LIST_PATH)

    for article in articles:
        generer_page_article(article)

    apercus_accueil = [generer_apercu(article, False) for article in articles[:3]]
    apercus_liste = [generer_apercu(article, True) for article in articles]
    mettre_a_jour_page(INDEX_PATH, apercus_accueil)
    mettre_a_jour_page(LIST_PATH, apercus_liste)
    
    # Mise à jour automatique du sitemap XML
    generer_sitemap(articles)

    print(f"{len(articles)} article(s) généré(s) dans {ARTICLES_DIR} et sitemap.xml mis à jour.")


if __name__ == "__main__":
    main()