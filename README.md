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
| `app.js` | Lecture du CSV, affichage, historique local (`localStorage`) |
| `style.css` | Mise en forme |
| `table_engrenages.csv` | Données de référence |

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
