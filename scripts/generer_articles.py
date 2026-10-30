"""Génère les pages d'articles de La Tortue à partir des fichiers articles-data/*.json.

Pour chaque article JSON de articles-data/ :
  - crée articles/<slug>.html ;
  - supprime les pages générées dont le JSON a disparu (les pages écrites à la main,
    sans le repère de génération, ne sont jamais touchées) ;
  - met à jour les aperçus de index.html et articles.html (entre les marqueurs) ;
  - met à jour la section « Articles à venir » de index.html (depuis articles-data-avenir/) ;
  - remplace l'édito de index.html (depuis site-data/edito.json) ;
  - met à jour sitemap.xml.

Usage (depuis la racine du dépôt) :  python scripts/generer_articles.py
"""

import html
import json
import re
from datetime import date
from pathlib import Path
from typing import Any, Optional


ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "articles-data"
AVENIR_DIR = ROOT_DIR / "articles-data-avenir"
EDITO_PATH = ROOT_DIR / "site-data" / "edito.json"
ARTICLES_DIR = ROOT_DIR / "articles"
INDEX_PATH = ROOT_DIR / "index.html"
LIST_PATH = ROOT_DIR / "articles.html"
SITEMAP_PATH = ROOT_DIR / "sitemap.xml"
DOMAINE_SITE = "https://latortuequipense.fr"

MARKER_START = "<!-- ARTICLES_GENERES_DEBUT -->"
MARKER_END = "<!-- ARTICLES_GENERES_FIN -->"
EDITO_START = "<!-- EDITO_DEBUT -->"
EDITO_END = "<!-- EDITO_FIN -->"
AVENIR_START = "<!-- AVENIR_DEBUT -->"
AVENIR_END = "<!-- AVENIR_FIN -->"
# Repère placé dans chaque page générée : seules ces pages peuvent être supprimées automatiquement.
MARQUEUR_GENERE = "<!-- Page générée par scripts/generer_articles.py : ne pas modifier à la main -->"
# Dans « Articles à venir » : True affiche « Prévu le 3 novembre 2026 », False affiche « À venir ».
AFFICHER_DATE_AVENIR = False
REQUIRED_FIELDS = ("slug", "titre", "soustitre", "date", "description", "temps_lecture", "corps")
OPTIONAL_LIST_FIELDS = ("tags", "disciplines", "motscles")
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
        <a href="../a-propos.html">À propos</a>
        <a href="../a-propos.html#contact">Contact</a>
        <a href="../newsletter.html">Newsletter</a>
      </nav>
    </header>"""

PIED_DE_PAGE = """    <footer class="pied">
      <div class="pied-colonnes">
        <nav class="pied-col" aria-label="Plan du site">
          <h2>Plan du site</h2>
          <ul>
            <li><a href="../index.html">Accueil</a></li>
            <li><a href="../articles.html">Articles</a></li>
            <li><a href="../a-propos.html">À propos</a></li>
            <li><a href="../contacts.html">Contacts</a></li>
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


def verifier_marqueurs(chemin_page: Path) -> str:
    """Vérifie la présence d'une seule paire de marqueurs et renvoie le contenu de la page."""
    if not chemin_page.exists():
        raise FileNotFoundError(f"Page à mettre à jour introuvable : {chemin_page}")
    contenu = lire(chemin_page)
    if contenu.count(MARKER_START) != 1 or contenu.count(MARKER_END) != 1:
        raise ValueError(
            f"{chemin_page}: il faut exactement un marqueur {MARKER_START} et un marqueur {MARKER_END}."
        )
    if contenu.index(MARKER_START) > contenu.index(MARKER_END):
        raise ValueError(f"{chemin_page}: les marqueurs d’articles générés sont dans le désordre.")
    return contenu


def mettre_a_jour_page(chemin_page: Path, snippets: list[str]) -> None:
    contenu = verifier_marqueurs(chemin_page)
    fin_de_ligne = "\r\n" if "\r\n" in contenu else "\n"
    debut = contenu.index(MARKER_START) + len(MARKER_START)
    fin = contenu.index(MARKER_END)

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

    url_elements = [
        f"  <url>\n    <loc>{DOMAINE_SITE}{page}</loc>\n  </url>" for page in pages_fixes
    ]
    for article in articles:
        slug = echapper(article["slug"])
        url_elements.append(
            f"  <url>\n    <loc>{DOMAINE_SITE}/articles/{slug}.html</loc>\n"
            f"    <lastmod>{article['date_obj'].isoformat()}</lastmod>\n  </url>"
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
    verifier_marqueurs(LIST_PATH)

    for article in articles:
        generer_page_article(article)
    supprimer_pages_orphelines(publies)

    apercus_accueil = [generer_apercu(article, False) for article in articles[:3]]
    apercus_liste = [generer_apercu(article, True) for article in articles]
    mettre_a_jour_page(INDEX_PATH, apercus_accueil)
    mettre_a_jour_page(LIST_PATH, apercus_liste)
    remplacer_entre_marqueurs(INDEX_PATH, AVENIR_START, AVENIR_END, generer_avenir(avenir))
    if edito is not None:
        remplacer_entre_marqueurs(INDEX_PATH, EDITO_START, EDITO_END, generer_edito(edito))
    generer_sitemap(articles)

    print(
        f"{len(articles)} article(s) généré(s), {len(avenir)} à venir ; "
        "index.html, articles.html et sitemap.xml mis à jour."
    )


if __name__ == "__main__":
    main()