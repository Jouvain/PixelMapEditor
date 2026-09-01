# Architecture de l’éditeur

Le code est organisé autour d’un flux simple :

```text
Entrées utilisateur → tools.js → map-state.js → map-renderer.js
                                      ↓
                                  export.js
```

## Où chercher ?

- `app.js` : démarre l’application et relie les boutons HTML aux modules.
- `src/map-state.js` : contient les données de la carte et les opérations qui les modifient.
- `src/map-renderer.js` : dessine l’état courant dans le canvas. Il ne gère aucun clic.
- `src/tools.js` : transforme les clics et glissements en actions métier.
- `src/export.js` : sauvegarde, recharge et exporte le projet.
- `src/assets.js` : catalogue et dessin des meubles pixel art.
- `src/pixel-map-format.js` : construit et valide les documents Pixel Map v1.
- `src/project-adapter.js` : convertit l’état interne vers le format portable et inversement.
- `docs/PIXEL_MAP_V1.md` : spécification lisible du format.
- `docs/pixel-map-v1.schema.json` : schéma JSON structurel.

## Exemple : dessiner une pièce

1. `ToolController.pointerDown()` mémorise la cellule de départ.
2. `ToolController.pointerMove()` demande au renderer d’afficher un aperçu.
3. `ToolController.pointerUp()` appelle `paintRectangle()` dans l’état.
4. Le renderer relit l’état et redessine la carte.

## Ajouter un outil

1. Ajouter son bouton dans `index.html` avec un attribut `data-tool`.
2. Ajouter l’opération sur les données dans `map-state.js`.
3. Déclencher cette opération dans `tools.js`.
4. Ajouter son rendu dans `map-renderer.js` uniquement si nécessaire.

## Lancer et vérifier

```bash
npm start
npm run check
```

Ouvrir ensuite `http://localhost:8000`. Le petit serveur est nécessaire au chargement des modules JavaScript locaux.

## Dimensions dynamiques

Chaque projet porte sa propre configuration `state.grid` (`columns`, `rows`, `cellWidth`, `cellHeight`). Le renderer dimensionne le canvas à partir de cette configuration, les outils l’utilisent pour convertir les pointeurs en cases et l’adaptateur la conserve dans Pixel Map v1. Réduire une grille nécessite une confirmation si des données seraient rognées.

## Collision indépendante

`state.cells` décrit uniquement les surfaces graphiques du blueprint. `state.collisionCells` décrit les cases praticables de la couche logique, avec toutes les autres cases bloquées par défaut. L’outil Collision modifie uniquement cette seconde collection. L’adaptateur exporte et importe les deux couches séparément.

## Objets et zones génériques

En Habillage, `state.entityTool` choisit entre placement d’asset, création d’objet, dessin de zone et sélection. Les objets et zones possèdent un identifiant stable, un type opaque, un nom facultatif et des propriétés JSON libres. L’inspecteur ne donne aucun sens de jeu à ces données ; les adaptateurs futurs restent responsables de leur interprétation.

Les zones peuvent être rectangulaires ou polygonales. Un polygone est construit par sommets, sélectionné par un test point-dans-polygone et ses sommets sont éditables dans le canvas. Les coordonnées exportées restent des coordonnées logiques Pixel Map v1.
