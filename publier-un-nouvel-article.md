# Publier un nouvel article

Les articles sont générés depuis des fichiers JSON dans `articles-data/`. Le
workflow GitHub Actions `publier.yml` lance le générateur quand un fichier de
données ou le script change, puis ajoute à `articles/` la page HTML et ses
aperçus sur l’accueil et dans « Tous les articles ».

## Rédiger depuis l’administration

La page [admin.html](./admin.html) propose un formulaire visuel qui envoie
l’article dans `articles-data/`. Le commit du fichier JSON déclenche le workflow
de génération ; la page de l’article et ses aperçus sont ensuite ajoutés
automatiquement.

Pour publier depuis cette page, créer un jeton GitHub à granularité fine limité
au dépôt `qzethb/latortuequipense`, avec la permission de dépôt
`Contents : Read and write`. Saisir le jeton uniquement au moment de publier :
la page ne le conserve pas dans le navigateur et l’envoie directement à l’API
GitHub. Le jeton donne la capacité d’écrire dans le dépôt ; choisir une
expiration courte et ne jamais le partager ni l’intégrer au code du site.

La page permet aussi de sélectionner des images PNG, JPEG, GIF ou WebP de 10 Mo
maximum. Chaque image doit avoir une description alternative ; une légende est
facultative. Les fichiers sont ajoutés dans `images/` avant l’envoi du JSON et
leurs chemins sont insérés dans l’article. Si l’envoi de l’article échoue après
l’ajout d’une image, celle-ci peut rester dans le dépôt sans être utilisée.

L’éditeur propose également des commandes pour ajouter une annexe, une
bibliographie, un tableau, une formule LaTeX et des appels de notes de bas de
page liés à leur liste de références.

## Créer le fichier de données

Créer un fichier JSON, par exemple `articles-data/mon-article.json` :

```json
{
  "slug": "mon-article",
  "titre": "Titre de l’article",
  "soustitre": "Sous-titre de l’article",
  "date": "2026-10-27",
  "description": "Résumé court utilisé dans les aperçus et les métadonnées.",
  "meta_title": "Titre SEO facultatif",
  "meta_description": "Description SEO facultative, distincte du résumé des cartes.",
  "temps_lecture": "8 min",
  "tags": ["Société", "Politique"],
  "disciplines": ["Sociologie", "Science politique"],
  "motscles": ["sujet principal", "autre formulation"],
  "corps": "<p>Texte de l’article en HTML<a href=\"#fn1\" class=\"footnote-ref\" id=\"fnref1\" role=\"doc-noteref\"><sup>1</sup></a>.</p><h2>Un intertitre</h2><p>Suite du texte.</p><h2 id=\"annexe\">Annexe</h2><p>Contenu de l’annexe.</p>",
  "notes": "<ol><li id=\"fn1\">Référence bibliographique.<a href=\"#fnref1\" class=\"footnote-back\" role=\"doc-backlink\">↩</a></li></ol>"
}
```

### Champs obligatoires

- `slug` : nom de fichier en minuscules ASCII, chiffres et tirets. Il devient
  `articles/<slug>.html` et doit être unique.
- `titre`, `soustitre`, `description` et `temps_lecture` : textes non vides.
- `meta_title` et `meta_description` : champs facultatifs pour personnaliser le
  titre SEO (onglet et partage) et la méta-description, sans modifier le titre
  visible ou le résumé des cartes. Par défaut, le titre SEO reprend le titre
  suivi de « — La Tortue » et la méta-description reprend `description`.
- `date` : date réelle au format `AAAA-MM-JJ`.
- `corps` : contenu HTML de l’article. Utiliser uniquement du HTML maîtrisé et
  vérifier les liens et chemins des images. Le script de génération ne téléverse
  pas les fichiers image ; ceux-ci doivent déjà exister dans le dépôt.
- `notes` : bloc HTML facultatif contenant une liste `<ol>` des notes de fin.
  Les appels dans `corps` et les notes doivent employer les ancres `fnrefN` et
  `fnN`. Une annexe ou une bibliographie indépendante se place dans `corps` ;
  l’administration propose des boutons pour insérer ces sections.

### Métadonnées de recherche

- `tags`, `disciplines` et `motscles` sont des listes de textes. Elles sont
  facultatives, mais permettent de classer et de retrouver l’article dans
  `articles.html`. En leur absence, le script utilise des listes vides.
- Les valeurs de `tags` et `disciplines` doivent correspondre aux options
  actuellement proposées dans les filtres de `articles.html` pour être
  sélectionnables.
- La recherche porte sur le titre, la date, la description, les tags affichés
  et les termes de `motscles`. Elle ne parcourt pas le corps complet de l’article.

## Génération et vérification

Après avoir ajouté le fichier JSON, vérifier qu’il est valide puis le pousser
sur GitHub. Le workflow génère :

- `articles/<slug>.html`, avec la charte du site, le menu et le contenu fourni ;
- les métadonnées title, description, partage social, URL canonique et données
  structurées JSON-LD ; le script de description des images et KaTeX sont ajoutés
  uniquement lorsque le contenu en a besoin ;
- les notes de fin (si le champ `notes` est renseigné), ainsi que le pied de
  page standard ;
- un aperçu dans la liste des derniers articles sur `index.html` ;
- une carte filtrable et recherchable sur `articles.html`.

Le générateur trie les articles JSON par date décroissante. Les nouveaux aperçus
sont insérés dans les emplacements encadrés par
`ARTICLES_GENERES_DEBUT` et `ARTICLES_GENERES_FIN`.

Pour lancer la génération localement depuis la racine du dépôt :

```sh
python scripts/generer_articles.py
```

En cas de champ manquant, de date invalide, de slug en double ou de marqueurs
absents, le script s’arrête avec une erreur explicite plutôt que de publier des
pages incomplètes.
