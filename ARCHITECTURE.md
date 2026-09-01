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

## Ressources graphiques portables

Les ressources produites par l’éditeur sont embarquées directement dans le JSON sous forme d’URI `data:image/svg+xml`. Un consommateur Pixel Map n’a donc besoin ni du catalogue de PixelMapEditor, ni d’un résolveur propriétaire. Le format accepte aussi une URL HTTPS ou un chemin relatif vers un fichier image, afin de permettre à un autre producteur de distribuer un JSON accompagné de ses images.

Les anciennes URI internes `asset://objects/...` et `asset://floors/...` du catalogue connu sont converties à l’import. Toute autre URI `asset://` est rejetée par la validation, puisqu’elle ne peut pas être résolue de manière indépendante.

## Position et profondeur des objets

Un objet conserve `x` et `y` comme index de case pour les opérations de grille, ainsi que `pixelX` et `pixelY` comme position logique exacte de son centre. L’adaptateur Pixel Map utilise toujours la position exacte. Les anciens états qui ne possèdent que les index de case sont complétés automatiquement.

En mode Sélection, le pointeur déplace l’objet choisi. `objectSnapToGrid` détermine si le centre est aimanté sur une case ou suit librement le pointeur. L’ordre de `state.objects` constitue l’ordre d’affichage : le dernier objet est au premier plan. Quand plusieurs objets occupent le même emplacement, des sélections successives les parcourent du premier plan vers l’arrière-plan.

## Édition géométrique des zones

Une zone sélectionnée se déplace par glissement, en restant dans les limites de la carte. Les rectangles exposent quatre poignées de redimensionnement. Les polygones exposent leurs sommets ; l’inspecteur peut insérer un point au milieu de l’arête sélectionnée — ou de la plus longue arête — et supprimer le point sélectionné tant qu’il en reste au moins trois. Pendant la création, le dernier sommet peut être retiré avec le bouton dédié ou Retour arrière.

La détection d’auto-intersection est isolée dans `geometry.js`. Elle empêche la création et le déplacement invalides et constitue également une erreur de validation Pixel Map v1, afin qu’un polygone croisé importé ne passe pas silencieusement à l’export.

## Sélection Blueprint

`state.blueprintSelection` contient les clés des cellules graphiques sélectionnées. L’outil Sélection construit cet ensemble par rectangle, puis permet de le déplacer, dupliquer, supprimer, copier et coller. Les portes situées sur les cellules sélectionnées accompagnent les transformations ; les collisions restent volontairement inchangées car elles constituent une couche indépendante.

Le presse-papiers Blueprint est interne au projet en cours et stocke les cellules et portes avec des coordonnées relatives. Un collage crée une nouvelle sélection et reste automatiquement dans les limites de la grille. Les raccourcis disponibles sont Suppr, Ctrl+C, Ctrl+V et Ctrl+D.

## Nouveau projet

Sans sauvegarde locale, l’application démarre sur une carte vide. La commande Nouveau ouvre un dialogue pour choisir le nom, la grille logique et un modèle (`empty` ou `demo`). Elle demande confirmation si l’état courant contient des modifications non sauvegardées, remplace entièrement l’état et vide l’historique afin qu’une annulation ne puisse pas restaurer le projet abandonné.
