# Mode d'emploi : transformer un fichier Word en article HTML (La Tortue)

Ce document s'adresse à une IA. Il explique comment convertir un fichier `.docx` en une page d'article du site **La Tortue**, avec la même mise en forme que les articles déjà publiés.

**À fournir à l'IA :** uniquement ce document et le fichier `.docx` à convertir. Rien d'autre : ce document est autosuffisant.

**Fichiers du site que l'IA n'a pas à demander ni à recréer.** Ils existent déjà sur le site, et les articles s'y réfèrent par les chemins du squelette (section 3) : `charte.css`, `article.css`, `menu.js`, `schema-descriptions.js`, `logo.svg` et le dossier `favicon/`. Tout ce qu'il faut savoir sur eux est écrit ici. Ne jamais les modifier ni les réécrire.

**L'IA doit rendre :**

1. le fichier HTML de l'article ;
2. les images extraites du Word, dans un dossier `images/` (ou à défaut la liste de ce qu'il faut exporter à la main) ;
3. si l'article contient des formules ou des listes numérotées, le bloc CSS correspondant de l'annexe en fin de document, à coller une seule fois dans `article.css` ;
4. une courte liste des points à vérifier (voir section 11).

---

## 1. Principes

1. **Fidélité au texte.** Ne pas reformuler, ne pas corriger le style, ne pas ajouter de phrases ni d'intertitres. Seule la mise en forme change. Si le texte contient une anomalie (doublon, parenthèse non fermée, note manquante, chiffre incohérent), la conserver et la signaler à la fin.
2. **Pas de style en ligne, pas de nouvelle classe.** Utiliser uniquement les classes listées en section 3. Si un élément du Word n'a pas d'équivalent, choisir l'élément HTML le plus proche et le signaler dans le message final, plutôt que d'inventer du CSS.
3. **Rien d'externe** sauf KaTeX, et seulement si l'article contient des formules.
4. **Ne rien inventer.** Titre, sous-titre, date, descriptions de graphiques : si le Word ne les fournit pas, les proposer clairement comme provisoires dans le message final.

---

## 2. Lire le fichier Word sans rien perdre

Une lecture « texte seul » du `.docx` **perd les formules de mathématiques** (elles sont stockées en OMML, pas en texte). Utiliser pandoc, qui les convertit en LaTeX et récupère aussi les notes de bas de page :

```bash
pandoc source.docx -t markdown --wrap=none --extract-media=./media -o source.md
```

Si pandoc n'est pas installé : `pip install pypandoc_binary` (il embarque pandoc), puis `pypandoc.convert_file("source.docx", "markdown", extra_args=["--wrap=none", "--extract-media=./media"], outputfile="source.md")`. Si aucun code ne peut être exécuté, lire le `.docx` comme on peut, mais dire clairement à l'utilisateur que les formules et les images n'ont pas pu être extraites, au lieu de les deviner.

Puis contrôler ce que pandoc ne voit pas :

```bash
unzip -l source.docx | grep -E 'word/(media|charts|embeddings)/'   # images, graphiques natifs Word
unzip -p source.docx word/document.xml | grep -o '<m:oMath>' | wc -l   # nombre de formules
unzip -p source.docx word/document.xml | grep -o '<w:tbl>' | wc -l     # nombre de tableaux
unzip -p source.docx word/footnotes.xml | grep -o '<w:footnote ' | wc -l   # notes (moins 2 séparateurs)
```

**Graphiques natifs Word.** Si le dossier `word/charts/` existe, ces graphiques ne sont pas des images : pandoc les ignore. Soit demander à l'utilisateur de les exporter en PNG, soit les redessiner fidèlement à partir des données du `chartN.xml` (mêmes séries, mêmes axes, mêmes titres) et l'indiquer dans le message final.

---

## 3. Squelette de la page

Le fichier se place dans le même dossier que les autres articles ; tous les chemins commencent donc par `../`. Nom du fichier : titre abrégé, en minuscules, sans accents, avec des tirets (`mon-article.html`).

```html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>TITRE — La Tortue</title>
<meta name="description" content="Une phrase qui résume l'article">
<link rel="stylesheet" href="../charte.css">
<script src="../menu.js" defer></script>
<link rel="stylesheet" href="../article.css">
<script src="../schema-descriptions.js" defer></script>   <!-- seulement s'il y a des figures -->
<!-- bloc KaTeX (section 8) : seulement s'il y a des formules -->
<link rel="icon" type="image/png" href="../favicon/favicon-96x96.png" sizes="96x96" />
<link rel="icon" type="image/svg+xml" href="../favicon/favicon.svg" />
<link rel="shortcut icon" href="../favicon/favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="../favicon/apple-touch-icon.png" />
<link rel="manifest" href="../favicon/site.webmanifest" />
</head>
<body>
  <div class="progression" aria-hidden="true"></div>
  <div class="page">

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
        <a href="../a-propos.html#contact">Contact</a>
        <a href="../newsletter.html">Newsletter</a>
      </nav>
    </header>

    <article>
      <div class="billet-entete">
        <h1>TITRE</h1>
        <div class="ornement"></div>
        <p class="sous-titre">SOUS-TITRE</p>
        <p class="billet-meta"><time datetime="AAAA-MM-JJ">J mois AAAA</time><span>N min de lecture</span></p>
        <div class="billet-actions">
          <button type="button" onclick="window.print()">
            Télécharger l’article en PDF
          </button>
        </div>
      </div>

      <div class="billet-texte">
        <!-- CORPS DE L'ARTICLE (sections 4 à 8) -->
      </div>

      <section class="notes" aria-label="Notes">
        <ol>
          <!-- NOTES (section 5) -->
        </ol>
      </section>
    </article>

    <div class="billet-fin">
      <div class="ornement"></div>
      <a class="lien" href="../index.html">Retour à l'accueil</a>
    </div>

    <footer>© 2026 La Tortue</footer>

  </div>
</body>
</html>
```

- **Temps de lecture** : nombre de mots du corps ÷ 200, arrondi à l'entier supérieur (notes exclues ; majorer d'une minute pour un article très chargé en formules).
- **Date** : celle donnée par l'utilisateur, sinon la date du jour (à signaler).
- Si l'article n'a ni note ni source, supprimer entièrement le bloc `<section class="notes">`.
- Si l'article n'a pas de sous-titre, supprimer la ligne `sous-titre`.

**Classes disponibles** (définies dans `charte.css` et `article.css`, à utiliser telles quelles) : `page`, `progression`, `marque`, `logo`, `menu-toggle`, `menu-toggle-icon`, `navigation`, `billet-entete`, `ornement`, `sous-titre`, `billet-meta`, `billet-actions`, `billet-texte`, `footnote-ref`, `footnote-back`, `notes`, `tableau-defile`, `large`, `texte`, `total`, `formule`, `numerotee`, `billet-fin`, `lien`. Le bloc « description du graphique » sous les figures est produit par `schema-descriptions.js` (section 6) : ne pas l'écrire à la main.

---

## 4. Correspondances Word → HTML

| Dans le Word | En HTML |
|---|---|
| Titre du document | `<h1>` unique, dans `.billet-entete` |
| Sous-titre | `<p class="sous-titre">` |
| Titre 1 | `<h2>` |
| Titre 2 | `<h3>` |
| Titre 3 et suivants | `<h3>` (aplatir) et le signaler |
| Paragraphe | `<p>` (aucun alinéa, aucun style) |
| Gras | `<strong>` (rendu : violet foncé souligné d'un filet, sans gras). Ne pas l'employer pour imiter un titre |
| Italique | `<em>` |
| Exposant (1er, 2e, ¹) | `<sup>er</sup>`, `<sup>e</sup>`… |
| Liste à puces | `<ul><li>…</li></ul>` |
| Liste numérotée | `<ol><li>…</li></ol>` (joindre le CSS « listes numérotées » de l'annexe B) |
| Citation en retrait | `<blockquote><p>…</p></blockquote>` |
| Lien hypertexte | `<a href="…">texte</a>` |
| Note de bas de page ou de fin | voir section 5 |
| Image / graphique | voir section 6 |
| Tableau | voir section 7 |
| Formule | voir section 8 |
| Saut de page, paragraphes vides, mise en page | ignorer |
| Annexe | `<h2 id="annexe">Annexe</h2>` en fin de corps ; si le texte y renvoie, ajouter un lien `<a href="#annexe">` |

**La lettrine** (grande initiale violette) est ajoutée automatiquement par la feuille de style au premier `<p>` du corps. Ne rien faire pour elle, et ne pas placer de `<p>` parasite avant le vrai premier paragraphe.

**Caractères à normaliser** (le texte ne change pas, seulement sa typographie) :

- apostrophes droites `'` → `’` ;
- guillemets `"…"` → `«` `…` `»` ;
- espace insécable (U+00A0) avant `:` `;` `?` `!` `%` et à l'intérieur des guillemets français, pour éviter qu'une ligne ne commence par un signe de ponctuation ;
- `...` → `…` ; `oe` ligaturé → `œ` quand le Word le fait ;
- supprimer les doubles espaces ;
- échapper `&` en `&amp;` et `<` en `&lt;` dans le texte (pas de `<` ou `&` bruts).

---

## 5. Notes et sources

**Appel de note**, placé juste après le mot et avant la ponctuation, comme dans le modèle :

```html
…une pratique courante<a href="#fn3" class="footnote-ref" id="fnref3" role="doc-noteref"><sup>3</sup></a> pour les groupes…
```

**Liste des notes**, en fin d'article, dans l'ordre d'apparition :

```html
<li id="fn3">Erik Neveu, <em>Sociologie des mouvements sociaux</em>.<a href="#fnref3" class="footnote-back" role="doc-backlink">↩</a></li>
<li id="fn4"><a href="https://exemple.fr/page">Titre de la page - NOM DU SITE</a><a href="#fnref4" class="footnote-back" role="doc-backlink">↩</a></li>
```

- Une note qui est une simple source en ligne : le texte du lien est le titre de la page, suivi si possible du nom du site, comme dans le Word.
- Les titres d'ouvrages, de revues et de journaux sont en `<em>`.
- Le lien de retour `↩` termine toujours l'élément `<li>`.
- Numérotation continue `1, 2, 3…` ; chaque `fnN` a exactement un `fnrefN` et réciproquement.
- **Cas d'une numérotation manuelle** (`[1]`, `(1)` dans le texte, liste « Références » à la fin) : la convertir en vraies notes, sauf consigne contraire, et le signaler. S'il s'agit d'une vraie bibliographie sans renvois dans le texte, la garder comme section `<h2>Sources</h2>` suivie d'un `<ul>`, avant le bloc des notes.

---

## 6. Graphiques et figures

Pour **chaque** image ou graphique du Word :

```html
<figure><img src="../images/SLUG-1.png" alt="DESCRIPTION DÉTAILLÉE" width="1182" height="665" loading="lazy"><figcaption>Légende courte</figcaption></figure>
```

- **Fichier** : `../images/SLUG-N.png`, où `SLUG` est le nom de l'article et `N` l'ordre d'apparition. Lire les vraies dimensions de l'image pour `width` et `height`. Les images doivent faire au moins 1200 px de large pour être nettes sur écran haute définition (le signaler si elles sont plus petites ; ne jamais les agrandir artificiellement).
- **`figcaption`** : la légende du Word, courte, sans « Figure N ». S'il n'y en a pas, la rédiger sobrement à partir du titre du graphique ou la supprimer si l'image est purement illustrative.
- **`alt`** : description détaillée, obligatoire.

### Rédiger la description détaillée

La description doit permettre à une personne qui ne voit pas le graphique d'en comprendre le message. Dans l'ordre :

1. le type de graphique (courbes, histogramme, diagramme circulaire, nuage de points…) ;
2. ce que représentent les axes, avec leurs unités et la période ;
3. les séries ou catégories représentées ;
4. la forme générale (hausse, baisse, rupture, pic) ;
5. les valeurs clés (maximum, minimum, point de rupture, parts principales) ;
6. ce que le graphique montre, sans interprétation que le texte n'a pas faite.

Règles : uniquement des valeurs lisibles sur l'image ou présentes dans le texte ou les tableaux du Word. **Ne jamais deviner une valeur.** Si une valeur n'est pas lisible, décrire la tendance sans chiffre. Longueur : 1 à 4 phrases denses, avec les chiffres clés.

### Le bloc visible sous le graphique

Sur le site, c'est `schema-descriptions.js` qui affiche sous chaque figure un bloc déroulant de description, construit à partir de l'attribut `alt`. **Ne pas écrire ce bloc à la main** (pas de `<details>`) : l'`alt` est la seule description à fournir, donc la soigner. Garder la ligne `<script src="../schema-descriptions.js" defer></script>` dans le `<head>` dès que l'article contient une figure.

### Exemples d'`alt` déjà publiés sur le site

- Diagramme circulaire : `alt="Diagramme circulaire de la répartition du temps d’antenne consacré aux manifestations lycéennes au journal de 20 heures de France Télévisions, du 1er au 8 octobre 2026 : violences urbaines 49,3 %, violences policières 17,6 %, revendications 17,5 %, neutre 15,6 %."`
- Courbes : `alt="Courbes de l’évolution quotidienne, en secondes, du temps consacré à chaque thème du 1er au 8 octobre : les violences urbaines dominent au début de la période (620 s le 1er octobre), les violences policières culminent à 340 s le 6 octobre, jour où les violences urbaines tombent à 0 s et les revendications atteignent 410 s."`

---

## 7. Tableaux

```html
<div class="tableau-defile">
<table class="large">
<caption>Tableau 1 : titre du tableau</caption>
<thead>
<tr><th></th><th>Colonne A</th><th>Colonne B</th></tr>
</thead>
<tbody>
<tr><td>Ligne 1</td><td>1949</td><td>170</td></tr>
<tr class="total"><td>Total</td><td>…</td><td>…</td></tr>
</tbody>
</table>
</div>
```

- Toujours envelopper le tableau dans `<div class="tableau-defile">` (il défile horizontalement sur mobile).
- `<caption>` : le titre du Word, avec sa numérotation (« Tableau 1 »). Le chiffre en exposant du Word reste en `<sup>`.
- La première ligne du Word devient `<thead>` avec des `<th>`. La case en haut à gauche, si elle est vide, reste `<th></th>`.
- `class="large"` sur `<table>` à partir de 5 colonnes ; `class="texte"` si les cellules contiennent surtout du texte (alignement à gauche) ; `class="total"` sur la ligne de total ou de moyenne.
- Les nombres sont alignés à droite automatiquement. Les reproduire tels quels (virgule décimale, espaces des milliers), sans les recalculer ni les arrondir.
- Cellules fusionnées : `colspan` / `rowspan`.
- Pas de `style`, pas de `bgcolor`, pas de `width` sur les cellules.

---

## 8. Formules de mathématiques

Les formules s'écrivent **en LaTeX directement dans le HTML** ; le navigateur les affiche avec KaTeX.

- **Dans une phrase** : `\( B_i = \beta_0 \cdot v_i^{\alpha} \)`
- **Isolée et centrée** : `<div class="formule">\[ V_{ij} = B_i \cdot \varepsilon_{ij} \]</div>` (jamais à l'intérieur d'un `<p>`)
- **Numérotée** (seulement si le Word numérote ses équations) : `<div class="formule numerotee">\[ … \]</div>`
- N'utiliser ni `$…$` ni `$$…$$`.

**Bloc à ajouter dans le `<head>`** (version pinnée, avec contrôle d'intégrité) :

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.css" integrity="sha384-nH0MfJ44wi1dd7w6jinlyBgljjS8EJAh2JBoRad8a3VDw2K69vfaaqm4WnR+gXtA" crossorigin="anonymous">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.js" integrity="sha384-CwjPRVHTvLiMBFjEoij+QZViMV5rhTOIp7CJzl24JEqpRDA1sJFHVXXLURktbYYp" crossorigin="anonymous"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/contrib/auto-render.min.js" integrity="sha384-bjyGPfbij8/NDKJhSGZNP/khQVgtHUE5exjm4Ydllo42FwIgYsdLO2lXGmRBf5Mz" crossorigin="anonymous" onload="renderMathInElement(document.querySelector('.billet-texte'), { throwOnError: false })"></script>
```

**Nettoyer le LaTeX produit par pandoc** sans changer le sens :

- `{\ln v}_{i}` → `\ln v_i` ; `{\ln r}_{i}^{*}` → `\ln r_i^{*}` ;
- `\left\lbrack … \right\rbrack` → `\left[ … \right]` ;
- accolades superflues autour d'une lettre indicée : `B_{i}` → `B_i` (garder les accolades dès que l'indice ou l'exposant a plusieurs caractères) ;
- les mots dans une formule : `\text{…}`.

**Dans le HTML**, le texte des formules est lu après décodage des entités : écrire `&amp;` pour chaque `&` (environnements `aligned`, matrices) et `&lt;` pour chaque `<`.

**Vérifier** que chaque formule est valide avant de livrer :

```bash
npm install katex@0.16.47
node -e "require('katex').renderToString(String.raw\`FORMULE\`, {throwOnError:true})"
```

**Feuille de style.** La mise en forme des formules est dans l'annexe A. Quand l'article contient des formules, la rappeler à l'utilisateur dans le message final (à coller une seule fois dans `article.css`).

---

## 9. Ce qu'il ne faut pas faire

- Pas d'attribut `style`, pas de balise `<font>`, `<center>`, `<br>` pour espacer.
- Pas de nouvelle classe, pas de `<div>` décoratif.
- Pas d'images de formules (captures) : toujours du LaTeX.
- Pas de bibliothèque externe en dehors de KaTeX.
- Pas de modification de `charte.css` ni d'`article.css`, et pas de demande de fichiers au site (CSS, JS).
- Pas d'intertitres, de résumé ou de conclusion ajoutés.
- Pas de réécriture, de correction de style ou de recalcul des chiffres.

---

## 10. Contrôles avant de livrer

Compter dans le HTML et comparer au Word :

```bash
grep -o 'class="footnote-ref"' article.html | wc -l    # appels de note
grep -o 'class="footnote-back"' article.html | wc -l   # notes (doit être égal)
grep -c '<figure>' article.html                         # figures
grep -o '<table' article.html | wc -l                   # tableaux
grep -o '\\(' article.html | wc -l                      # formules dans une phrase
grep -o '\\\[' article.html | wc -l                     # formules isolées
```

- Formules : (dans une phrase + isolées) doit correspondre au nombre de `<m:oMath>` du Word, à quelques unités près si une formule a été découpée.
- Notes : chaque `fnrefN` pointe vers un `fnN` qui existe, et réciproquement.
- Figures : chaque `src` correspond à un fichier réel dans `../images/`, chaque image a un `alt` détaillé et des `width` / `height`.
- Tableaux : tous enveloppés dans `.tableau-defile`, légendes numérotées.
- Titres : un seul `<h1>` ; les `<h2>` / `<h3>` suivent l'ordre du Word.
- Aucun `$` brut, aucun `\(` ou `\[` non refermé, aucun `style=`.
- Le premier élément `<p>` du corps est bien le premier paragraphe du texte (lettrine).

---

## 11. Message final attendu

L'IA termine par une réponse courte :

1. les fichiers rendus ;
2. si l'article contient des formules ou des listes numérotées, le bloc CSS de l'annexe correspondante, avec la phrase « à coller une seule fois dans `article.css`, avant la section 7 (NOTES), s'il n'y est pas déjà » ;
3. ce qui est provisoire : titre, sous-titre, date, temps de lecture, légendes ou descriptions rédigées à partir des images ;
4. les anomalies repérées dans le texte, sans les avoir corrigées (doublons, parenthèses, notes manquantes, graphiques natifs redessinés…).

---

## Message à coller avec les fichiers

> Voici un fichier Word et un mode d'emploi. Suis le mode d'emploi pour produire l'article HTML du site, sans me demander d'autres fichiers. Rends-moi le fichier HTML, les images extraites et, si besoin, le bloc CSS à ajouter.

---

## Annexe A : CSS des formules de mathématiques

À coller une seule fois dans `article.css`, juste avant la section « 7. NOTES ».

```css
/* 6 quater. FORMULES DE MATHÉMATIQUES */
.billet-texte .katex {
  font-size: 1.1em;
  color: var(--texte);
  text-indent: 0;
  hyphens: manual;
}
.billet-texte .formule {
  margin: 1.7em 0;
  padding: .2em 0;
  overflow-x: auto;
  overflow-y: hidden;
  text-align: center;
  text-indent: 0;
  break-inside: avoid;
}
.billet-texte .formule .katex-display { margin: 0; }
.billet-texte .formule .katex { font-size: 1.2em; }

.billet-texte { counter-reset: formule; }
.billet-texte .formule.numerotee { position: relative; counter-increment: formule; padding-right: 3em; }
.billet-texte .formule.numerotee::after {
  content: "(" counter(formule) ")";
  position: absolute; right: 0; top: 50%; transform: translateY(-50%);
  font-size: var(--t-petit); font-style: italic; color: var(--texte-doux);
}
```

Dans le bloc `@media (max-width: 640px)` : `.billet-texte .formule { margin: 1.4em 0; font-size: .88em; }`
Dans le bloc `@media print` : `.billet-texte .formule { overflow: visible; }`

---

## Annexe B : CSS des listes numérotées

À coller une seule fois dans `article.css`, après la règle `.billet-texte li::before`.

```css
.billet-texte ol { margin: 2em 0; padding: 0; list-style: none; counter-reset: etape; }
.billet-texte ol > li { counter-increment: etape; }
.billet-texte ol > li::before {
  content: counter(etape) ".";
  top: 0; width: auto; height: auto;
  background: none; font-style: italic; color: var(--violet);
}
```
