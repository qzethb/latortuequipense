# Publier un nouvel article : checklist complète

Ce document sert de référence pour publier un nouvel article sur le site en respectant le format du journal, le référencement SEO et la cohérence de l’index.

## 1. Matériel fourni

On suppose que tu as déjà :

- le fichier HTML de l’article
- son titre
- son sous-titre
- sa description
- les images associées
- un paragraphe de présentation

## 2. Vérifier et compléter les métadonnées HTML

### Objectif

Ensures que l’article a un bon titre dans l’onglet navigateur et une description utile pour les moteurs de recherche.

### À faire

1. Ouvrir le fichier HTML de l’article.
2. Vérifier dans la balise `<head>` :
   - `<title>`
   - `<meta name="description" content="...">`
3. Si le titre n’existe pas :
   - créer un méta-titre court, lisible et optimisé pour le SEO.
4. Si la description n’existe pas :
   - créer une méta-description de 140 à 180 caractères maximum, claire et annonçant l’intérêt de l’article.
5. Le titre du document HTML doit correspondre au titre de l’article, sans être trop long.

### Exemple

- Titre article : "L’école face au numérique : entre innovation et déconnexion"
- Meta-title : "L’école face au numérique : innovation et déconnexion | La Tortue"
- Meta-description : "Analyse de l’impact du numérique sur l’école, entre innovation pédagogique, dépendance technologique et nouvelles inégalités."

### Bonnes pratiques

- éviter les titres trop génériques
- garder le nom du journal ou du site dans le titre si possible
- ne pas répéter le même mot de manière excessive
- utiliser un style propre et lisible

---

## 3. Vérifier les liens internes et les ressources

### Objectif

Ensures que l’article charge correctement son CSS, ses images, ses scripts et les liens internes.

### À faire

1. Vérifier que les CSS et scripts sont bien référencés avec des chemins corrects.
2. Vérifier que toutes les images sont bien dans le dossier prévu.
3. Vérifier les chemins vers :
   - les fichiers CSS
   - les images
   - les favicon
   - les liens internes vers d’autres pages
4. Vérifier les liens externes (si présents) et les liens d’ancrage internes.

### Règle importante

- Si le fichier HTML est dans un sous-dossier comme `articles/`, les chemins doivent être adaptés en conséquence.
- Ex : un lien vers le site racine doit souvent être `../index.html`, alors qu’un fichier situé à la racine utilise `index.html`.

---

## 4. Ajouter le paragraphe de présentation dans l’index

### Objectif

Faire apparaître un court texte présentant l’article sur la page d’accueil du site, avec un lien cliquable.

### À faire

1. Ouvrir la page d’accueil `index.html`.
2. Trouver la zone des derniers articles ou de présentation.
3. Ajouter un paragraphe de présentation ou une ligne de texte correspondant à l’article.
4. S’assurer que le texte contient un lien cliquable vers la page de l’article.
5. Le lien doit pointer vers le bon fichier HTML de l’article, par exemple :
   - `articles/nom-de-l-article.html`
6. Utiliser un texte court et lisible, sans rendre la page trop dense.

### Exemple

```html
<p>En 2024, le débat sur l’intelligence artificielle a pris une dimension nouvelle dans l’éducation. Quels sont les impacts réels sur les apprentissages, la relation aux enseignants et l’accès à la connaissance ?
<a href="articles/nom-de-l-article.html" class="lien">Lire l’article</a></p>
```

### Vérification

- le texte doit être visible
- le lien doit être cliquable
- le lien doit ouvrir la bonne page
- le paragraphe doit être cohérent avec le style du site

---

## 5. Ajouter l’article à l’index principal

### Objectif

Faire apparaître le nouvel article dans la liste des derniers articles ou dans la rubrique “articles”.

### À faire

1. Ouvrir `index.html`.
2. Trouver la section “Derniers articles”.
3. Ajouter un bloc d’article avec :
   - la date
   - le titre
   - la description
   - le lien vers l’article
4. Vérifier que le format correspond à ceux déjà présents dans la page.

### Structure recommandée

```html
<article class="article-row">
  <a class="article" href="articles/nom-de-l-article.html">
    <span class="date">12 octobre 2026</span>
    <span class="article-corps">
      <h2>Titre de l’article</h2>
      <span class="article-description" id="description-article" aria-hidden="true">
        Description courte de l’article.
      </span>
    </span>
    <span class="fleche" aria-hidden="true">→</span>
  </a>
  <button class="article-toggle" type="button" aria-label="Afficher la description de l'article" aria-expanded="false" aria-controls="description-article">
    <span class="fleche" aria-hidden="true">↓</span>
  </button>
</article>
```

### Important

- le titre doit être précis et lisible
- la description doit être courte, claire, attractrice
- la date doit être cohérente avec la publication
- l’article doit être visible dans la liste des derniers articles

---

## 6. Ajouter l’article dans la page “Tous les articles”

### Objectif

L’article doit aussi figurer dans la page qui recense l’ensemble des publications.

### À faire

1. Ouvrir `articles.html`.
2. Ajouter une carte ou un bloc correspondant à l’article.
3. Inclure :
   - le titre
   - la date
   - la description courte
   - un lien vers l’article
   - les tags adaptés
   - les disciplines adaptées
   - un ou plusieurs mots-clés de recherche

### Exemple de structure

```html
<a class="article"
    href="articles/nom-de-l-article.html"
    data-tags="Éducation,Numérique"
    data-disciplines="Sociologie"
    data-motscles="nom du sujet, expression recherchée, variante, notion associée">
   <!-- Conserver ici la structure existante : date, titre, description et tags visibles. -->
   ...
</a>
```

L’attribut `data-motscles` doit être ajouté à l’élément `<a class="article">` de l’entrée correspondante. Les mots-clés séparés par des virgules sont utilisés par la recherche de `articles.html`.

---

## 7. Choisir les tags et disciplines les plus adaptés

### Objectif

Rendre l’article facilement retrouvable dans la liste globale et cohérent avec les autres thématiques du site.

### À faire

1. Choisir 2 à 6 tags maximum.
2. Sélectionner les disciplines les plus pertinentes.
3. Ajouter éventuellement un nouveau tag si aucun tag existant ne correspond vraiment.
4. Utiliser des tags simples, compréhensibles et homogènes entre les articles.

### Exemples de tags possibles

- Éducation
- Numérique
- Technologie
- Sociologie
- Culture
- Politique
- Médias
- IA
- Philosophie
- Économie
- Droit
- Environnement

### Exemples de disciplines possibles

- Sciences sociales
- Philosophie
- Sociologie
- Culture et médias
- Éducation
- Politique
- Technologie et société

### Conseils

- éviter les tags trop larges et vagues
- privilégier des catégories cohérentes avec le sujet
- si l’article porte sur un sujet très spécifique, créer un tag dédié mais pas trop proche d’un mot unique

---

## 8. Ajouter des mots-clés de recherche

### Objectif

Améliorer la recherche interne et la découvrabilité de l’article.

### À faire

Ajouter des mots-clés pertinents aux deux endroits suivants :

1. Dans `articles.html`, renseigner `data-motscles` sur l’élément `<a class="article">` de l’article. Séparer les termes par des virgules. La recherche interne examine le titre, la description, les tags et ces mots-clés ; elle ignore les accents et tous les mots saisis doivent correspondre.
2. Dans la page HTML de l’article, ajouter une balise `meta` `keywords` dans le `<head>`. Elle décrit le sujet de la page dans ses métadonnées ; elle ne remplace pas `data-motscles` pour la recherche interne.

### Exemples

```html
<!-- Dans articles.html, sur le lien de l’article -->
<a class="article" href="articles/nom-de-l-article.html"
   data-tags="Éducation,Numérique"
   data-disciplines="Sociologie"
   data-motscles="éducation, apprentissage, outil numérique, nom du dispositif">
```

```html
<!-- Dans le <head> de la page de l’article -->
<meta name="keywords" content="éducation, numérique, IA, pédagogie, technologie, apprentissage, société, innovation">
```

### Bonnes pratiques

- utiliser des mots-clés naturels et pertinents
- éviter la suite de mots non liés
- privilégier des termes qui correspondent à la thématique centrale
- rester cohérent avec le contenu de l’article

---

## 9. Vérifier l’URL et le nom du fichier HTML

### Objectif

Ensures que la page est bien accessible et proprement nommée.

### À faire

1. Donner un nom de fichier clair et lisible :
   - `nom-de-l-article.html`
2. Vérifier que le fichier est bien placé dans le bon dossier :
   - `articles/` pour les articles
3. Vérifier que les liens de l’index et de la page “Tous les articles” pointent vers ce bon nom.
4. Vérifier qu’il n’y a pas de conflit avec un autre fichier.

### Bonnes pratiques

- utiliser des minuscules
- remplacer les espaces par des tirets
- privilégier un nom court et explicite

---

## 10. Vérifier la cohérence globale

### Checklist finale

Avant de publier, il faut vérifier :

- [ ] le HTML de l’article est présent
- [ ] le `<title>` est correct
- [ ] la `<meta name="description">` est présente et pertinente
- [ ] la `<meta name="keywords">` est présente et pertinente
- [ ] la description de l’article est bien rédigée
- [ ] le sous-titre est présent et lisible
- [ ] le paragraphe de présentation est ajouté dans l’index
- [ ] le lien est cliquable et pointe vers la bonne page
- [ ] l’article est ajouté dans l’index principal
- [ ] l’article est ajouté dans `articles.html`
- [ ] les tags sont adaptés
- [ ] les disciplines sont cohérentes
- [ ] `data-motscles` est renseigné dans `articles.html`
- [ ] les images sont bien chargées
- [ ] les liens relatifs sont corrects
- [ ] la page s’ouvre sans erreur dans le navigateur

---

## 11. Modèle de publication rapide

### Lorsqu’un nouvel article arrive

1. Créer le fichier HTML dans `articles/`.
2. Ajouter le titre, le sous-titre et la description.
3. Vérifier les métadonnées du `<head>`.
4. Ajouter la méta-description si absente.
5. Ajouter le paragraphe de présentation dans `index.html` avec lien cliquable.
6. Ajouter l’article dans le bloc “Derniers articles”.
7. Ajouter l’article dans `articles.html` avec tags, disciplines et `data-motscles`.
8. Vérifier les images et les chemins.
9. Tester le rendu dans le navigateur.
10. Publier.

---

## 12. Exemple de séquence de publication

### Article

- Titre : "Le numérique à l’école : innovation ou rupture ?"
- Sous-titre : "Une analyse de la transformation pédagogique"
- Description : "L’essor du numérique dans les établissements scolaires redéfinit les apprentissages, les rôles des enseignants et les inégalités d’accès."

### Meta-title

- "Le numérique à l’école : innovation ou rupture ? | La Tortue"

### Meta-description

- "Le numérique transforme l’école. Analyse des effets sur les apprentissages, les enseignants et les inégalités d’accès aux savoirs."

### Tags

- Éducation
- Numérique
- Technologie
- Sociologie

### Mots-clés

- école
- numérique
- pédagogie
- innovation
- apprentissage
- inégalités

---

## 13. Référence de style

Pour rester cohérent avec le site :

- privilégier un ton sérieux et documenté
- garder les descriptions courtes et efficaces
- rester lisible à la fois pour le lecteur et pour les moteurs de recherche
- conserver une logique éditoriale commune entre les articles

---

## 14. Conclusion

La publication d’un nouvel article ne se résume pas seulement à l’ajout d’un fichier HTML. Il faut aussi penser à :

- la visibilité sur la page d’accueil
- la recherche sur le site
- le SEO
- la cohérence éditoriale
- l’intégration dans les listes d’articles

Une bonne publication est ainsi à la fois visible, lisible, cohérente et bien indexée.
