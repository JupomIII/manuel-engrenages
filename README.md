# Manuel interactif — Engrenages

Petit site statique (HTML/CSS/JS, sans build) : on saisit un pas diamétral et un
nombre de dents, et on obtient les cotes de l'engrenage. Les données de référence
viennent de `table_engrenages.csv` ; les calculs sont conservés dans le navigateur
et exportables en CSV.

## Lancer en local

Le chargement du CSV passe par `fetch`, donc il faut un serveur local
(ouvrir `index.html` en double-clic ne suffit pas) :

```sh
python -m http.server 8000
```

Puis ouvrir http://localhost:8000

## Publier sur GitHub Pages

1. Pousser les fichiers sur la branche `main`.
2. Dépôt → *Settings* → *Pages* → *Source* : « Deploy from a branch »,
   branche `main`, dossier `/ (root)`.
3. Le site est disponible sur `https://<utilisateur>.github.io/<dépôt>/`.

Aucune étape de compilation, aucun secret : tout est public.

## Organisation

| Fichier | Rôle |
| --- | --- |
| `index.html` | Structure de la page (formulaire, résultats, table, historique) |
| `calculs.js` | Formules pures, sans DOM — c'est ici qu'on ajoute des calculs |
| `tables.js` | Chargement des tables du registre, lecture CSV, évaluation des formules |
| `app.js` | Lecture du CSV, affichage, historique local (`localStorage`) |
| `style.css` | Mise en forme |
| `table_engrenages.csv` | Données de référence |
| `tables/registry.json` | Liste des tables du Handbook (valeurs et formules) |

### Tables du Handbook

Le menu « Table utilisée » est rempli par `tables/registry.json`. Chaque entrée
décrit soit un fichier CSV (`file`, `lookup`, `columns`), soit une table de
formules (`kind: "formulas"`, groupes de lignes `display` / `expr`).

- Tables de valeurs : Table 3, Table 5, Table 10 (une par angle), Table 11
  (une par angle), séries de fraises (régulière et demi-numéros) et tables de
  piges 1 et 2 (p. 2303-2306, dents paires puis impaires).
- Tables de formules : Table 1 (dimensions), Table 2 (proportions 20° et 25°),
  Table 6 (crémaillère 14½°). Leurs valeurs sont calculées avec les données du
  dernier calcul (P, N, p, angle) par `Tables.evaluate`.

Une table dont les lignes couvrent un intervalle (dents d'une fraise, dents à
enjamber) déclare `range: { min, max }` au lieu d'une correspondance exacte.

### Protocole de calcul (guide 241-HAL-07)

Le calcul suit les étapes du guide : `DP = 2C/(mG+1)`, `DG = mG·DP`,
`N = P·D` ; `a = 1/P`, `b = 1,157/P` à 14½° ou `1,250/P` à 20°, `ht = a + b`,
`p = π/P`, `t = p/2`, `T = D sin(90°/N)`, `H = a + D/2 (1 − cos 90°/N)` ; puis
fraise (p. 2231), pige `1,728/P`, `Mth` lu dans les tables de piges et divisé
par `P`, `M maxi/mini` par `ΔM = 0,001 cos φ / sin α` (roue amincie : −3ΔM et
−5ΔM ; pignon intact : 0 et −2ΔM), et mesure entre dents avec `k` de la Table 11.
La mesure à la corde de la Table 10 est elle aussi divisée par `P`.

### Ajouter un calcul

1. Écrire la fonction dans `calculs.js` et l'exposer dans `window.Calculs`.
2. Ajouter le formulaire et le tableau de résultats dans `index.html`.
3. Brancher l'événement et le rendu dans `app.js` (voir `compute`).

### Données

- Le CSV est lu tel quel ; ses en-têtes sont affichés comme dans le fichier.
- Le pas diamétral des lignes est recalculé depuis le pas circulaire
  (`P = π / p`) car la première ligne du fichier contient `0.1142` au lieu de
  `0.3142`.
- Le parseur CSV est volontairement minimal (pas de champs entre guillemets).
  À remplacer si les données se complexifient.
