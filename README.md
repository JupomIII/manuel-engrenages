# Manuel interactif — Engrenages

Petit site statique (HTML/CSS/JS, sans build) : on saisit le rapport de
transmission, l'entraxe, le pas diamétral et l'angle de pression d'un train, et
on obtient les cotes du pignon et de la roue, du diamètre primitif à la mesure
sur piges. Les données de référence viennent des tables du Machinery's Handbook
décrites dans `tables/registry.json`, consultables dans la section « Données de
référence ».

## Lancer en local

Ouvrir `index.html` en double-clic fonctionne : les tables sont aussi intégrées
dans `tables_embedded.js`, utilisé quand le navigateur refuse `fetch` sur
`file://`. Pour recharger les données depuis les fichiers, servir le dossier :

```sh
python -m http.server 8000
```

Puis ouvrir http://localhost:8000

Les scripts portent un numéro de version (`app.js?v=5`) : après une modification,
incrémenter ce numéro dans `index.html` évite qu'un navigateur garde l'ancien
fichier en cache.

Après avoir modifié `tables/registry.json` ou un CSV, régénérer la copie
intégrée :

```sh
python tools/embed_tables.py
```

## Publier sur GitHub Pages

1. Pousser les fichiers sur la branche `main`.
2. Dépôt → *Settings* → *Pages* → *Source* : « Deploy from a branch »,
   branche `main`, dossier `/ (root)`.
3. Le site est disponible sur `https://<utilisateur>.github.io/<dépôt>/`.

Aucune étape de compilation, aucun secret : tout est public.

## Organisation

| Fichier | Rôle |
| --- | --- |
| `index.html` | Structure de la page (train d'engrenages, tables de référence) |
| `calculs.js` | Formules pures, sans DOM — c'est ici qu'on ajoute des calculs |
| `tables.js` | Chargement des tables du registre, lecture CSV, évaluation des formules |
| `app.js` | Lecture des tables, affichage, export du résultat |
| `math.js` | Rendu des formules LaTeX (KaTeX), avec repli sur le texte lisible |
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
- Tables de formules : Table 1 (dimensions, p. 2212), Table 2 (20° et 25° à
  pas grossier, p. 2212–2213), Table 4 (pas fin, droits et hélicoïdaux,
  p. 2216) et Table 6 (ancienne norme 14½° et stub 20°, p. 2218). Les
  colonnes de formules sont évaluées avec les données du dernier train droit
  ou, pour la partie hélicoïdale, du dernier calcul hélicoïdal séparé. Les
  coefficients décimaux du Handbook sont arrondis : de petits écarts avec les
  formules employant π sont normaux.

Une table dont les lignes couvrent un intervalle (dents d'une fraise, dents à
enjamber) déclare `range: { min, max }` au lieu d'une correspondance exacte.

### Protocole de calcul (guide 241-HAL-07)

Le calcul suit les étapes du guide : `DP = 2C/(mG+1)`, `DG = mG·DP`,
`N = P·D` ; `a = 1/P`, `b = 1,157/P` à 14½° ou `1,250/P` à 20°, `ht = a + b`,
`p = π/P`, `t = p/2`, `T = D sin(90°/N)`, `H = a + D/2 (1 − cos 90°/N)` ; puis
fraise (p. 2231), pige `1,728/P`, `Mth` lu dans les tables de piges et divisé
par `P`, `M maxi/mini` par `ΔM` interpolé de la Table 9, p. 2316 du
Handbook et p. 46–48 des notes (roue amincie : −3ΔM et −5ΔM ; pignon intact :
0 et −2ΔM), et mesure entre dents avec `k` de la Table 11. La mesure entre dents
est calculée par la formule de développante ; le cours lit la Table 10 et divise
par `P`, ce qui peut introduire de petits écarts d'arrondi.

Les notes de cours p. 41 emploient également la table T/H de la fraise
(Handbook p. 2224). Elle est affichée séparément des T/H géométriques calculés
avec le nombre réel de dents. La table ne couvre que les pas diamétraux
indiqués et les dents usinées pleine profondeur non arasées ; ses valeurs sont
exactes pour le nombre de dents de référence de la fraise, et approximatives
pour les autres dents de sa plage (Handbook p. 2228). Elle n'est pas extrapolée.
Pour `P = 12`, roue 72 dents/fraise 2 : `T = 0,1309`, `H = 0,0842` po, contre
`T = 0,13089`, `H = 0,08405` po en géométrie théorique. Ce n'est pas simplement
un écart d'arrondi : la table utilise 55 dents, la référence de la fraise 2.

L'interpolation de ΔM est limitée aux 5–200 dents de la Table 9 ; au-delà les
limites dépendant de ΔM ne sont pas fournies (M maxi du pignon reste M théorique). Les valeurs de cours 0,00288
(24 dents) et 0,003332 (72 dents) sont reproduites avant arrondi. L'exemple de
jeu 0,003 po et de tolérance 0,002 po n'est pas une prescription générale.

Pour une denture commune au pas grossier (P ≤ 20), le site applique les
proportions du guide et de la Table 2 : `a = 1/P`, `b = 1,157/P` à 14½°,
`1,250/P` à 20° ou 25°, ou `1,350/P` à 20° ou 25° pour la finition
arasée/rectifiée. Le creux de la forme 14½° est un minimum. La colonne « Min.
Dedendum » de la Table 3 concerne les profils 20° et 25° et ne constitue pas
une source pour le 14½°. La denture trapue utilise `a = 0,8/P`, `b = 1/P` ;
la finition arasée/rectifiée n'est pas définie pour cette option.

Pour le pas fin (P > 20), le site utilise le creux arrondi de la Table 5 si le
pas est tabulé, sinon les formules minimales de la Table 4 du Handbook p. 2216 :
`b = 1,200/P + 0,002` ou, pour une denture arasée/rectifiée,
`b = 1,350/P + 0,002` (pouces), à 14½°, 20° ou 25°. À P = 20 les deux systèmes
existent ; le formulaire permet de choisir. La saillie reste calculée exactement.
Le guide §9.4 utilise toutefois `b = 1,250/22 = 0,05682 po` pour son exemple
à P = 22 : le site applique la Table 4 à pas fin et donne `0,05655 po`. Le
système exigé doit être confirmé sur le plan ; ces valeurs ne sont pas interchangeables.

T, H, t et la mesure entre dents sont théoriques, sans amincissement ni déport.
Les limites sur piges reproduisent l'exemple du guide (jeu de 0,003 po sur la
roue et tolérance de 0,002 po), et ne remplacent pas les exigences du plan.
Le rayon de raccordement `rf = 0,300/P` est celui de la crémaillère de base,
pas celui du pied fini ; il est affiché uniquement pour la Table 2, et pas pour
le cas 25° avec jeu supérieur à `0,250/P`, où le Handbook impose une réduction.
La Table 2 précise aussi que le prétaillage à la mortaiseuse peut exiger un
creux supérieur : cette option n'est pas calculée automatiquement.

La Table 4 pour engrenages hélicoïdaux est calculée séparément avec le pas
normal `Pn`, l'angle d'hélice et les nombres de dents. Son creux et son jeu
sont des minima ; la géométrie, le sens des hélices, les tolérances et la
compatibilité du couple ne sont pas vérifiés. Les formules de Fellows stub
(mentionnées p. 2218 avec deux pas distincts) ne font pas partie de la Table 6
et ne sont pas prises en charge.

Ces résultats ne valident ni les interférences, ni les outils ou les piges, ni
les tolérances de fabrication. La Table 11 est limitée aux plages indiquées ;
au-delà, et pour l'angle 25° non couvert par les tables de mesure entre dents
fournies, k et la mesure entre dents ne sont pas fournis, même si le guide
§9.3 extrapole k = 10 à 88 dents et 20°. La table de référence
CSV Table 10 à 14½° contient une valeur suspecte à 34 dents (7,7683, contre
7,7863 environ par la formule du guide pour P = 1) ; cette valeur est bien
imprimée dans le Handbook p. 2318, malgré l'incohérence. Le calcul principal utilise la
formule et non cette cellule. Les CSV de piges présentent aussi de petits
écarts avec la formule ; ils ne sont pas tous certifiés conformes au PDF.

### Ajouter un calcul

1. Écrire la fonction dans `calculs.js` et l'exposer dans `window.Calculs`.
2. Ajouter le formulaire et le tableau de résultats dans `index.html`.
3. Brancher l'événement et le rendu dans `app.js` (voir `compute`).

### Données

- Le CSV est lu tel quel ; ses en-têtes sont affichés comme dans le fichier.
- La Table 3 reproduit également les 14 premières lignes du Handbook p. 2215,
  pour des pas diamétraux inférieurs à 1 (pas circulaires de 3,5 à 10 po).
  Elles avaient été retirées à tort ; les valeurs sont arrondies dans le PDF.
- Le parseur CSV est volontairement minimal (pas de champs entre guillemets).
  À remplacer si les données se complexifient.
