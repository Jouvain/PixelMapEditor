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
- `src/asset-registry.js` : registre les bibliothèques et expose leurs ressources par référence qualifiée.
- `src/asset-image-loader.js` : charge et met en cache les images externes avec leurs états de disponibilité.
- `src/assets.js` : déclare la bibliothèque `builtin` et son renderer pixel art.
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

`src/asset-catalog-import.js` charge les catalogues Pixel Map Assets depuis HTTPS, un JSON autonome, un paquet ZIP ou, si le navigateur le permet, un dossier. Il sépare la source portable de l’URL `blob:` de session et libère cette dernière au retrait de la bibliothèque.

L’interface, le renderer et l’adaptateur partagent une instance unique d’`AssetRegistry`. L’état stocke `assetRef` sous forme qualifiée, par exemple `builtin:desk`, et non un identifiant dépendant du catalogue interne. Le registre normalise les catalogues Pixel Map Assets, recherche les ressources et résout leurs sources. Le renderer propre à chaque bibliothèque reste une dépendance d’exécution et ne fait pas partie du catalogue portable.

Les images sans renderer spécialisé passent par `AssetImageLoader`. Une ressource est successivement `loading`, `ready` ou `error`; chaque changement redéclenche le dessin de la carte et de la palette. La position logique d’un objet désigne l’ancre normalisée de son asset. Une référence absente du registre et une image en erreur restent visibles sous forme de placeholders étiquetés, afin que l’objet demeure sélectionnable et ne soit jamais perdu silencieusement.

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

## Modifications non sauvegardées

`unsaved-changes.js` centralise l’état propre/modifié et le libellé affiché. Un remplacement par Nouveau ou Importer passe par la même confirmation. L’événement navigateur `beforeunload` est armé uniquement quand cet état est modifié, ce qui protège le rechargement, la navigation et la fermeture de l’onglet sans afficher d’avertissement après une sauvegarde réussie.

## Rapport de validation

Sauvegarde, import et exports présentent toutes les anomalies dans un dialogue commun, regroupées par sévérité. Chaque ligne conserve le chemin JSON et le message produits par le validateur. `validation-report.js` traduit aussi certains chemins en cibles d’éditeur : objets, zones, cellules de collision et tuiles Blueprint peuvent ainsi être affichés directement. Les problèmes globaux ou liés aux ressources restent documentés sans action lorsque aucune sélection pertinente n’existe.

## Portes

Une porte possède un identifiant stable, une case, un côté, un nom facultatif et des propriétés JSON libres. L’outil Porte sélectionne une porte existante et permet de la déplacer vers une autre cellule de bord ; l’inspecteur autorise aussi l’édition précise de sa position et de son orientation. Ces données sont exportées comme un objet `architecture.door`.

La propriété réservée `collisionPolicy` peut valoir `unchanged`, `walkable` ou `blocked`. Elle demande à l’éditeur de préserver, libérer ou bloquer la case lors de l’application ou du déplacement de la porte. Il s’agit uniquement d’un état statique de conception : aucun mécanisme d’ouverture, de fermeture ou de verrouillage propre à un jeu n’est implémenté.

## Outils de collision

La couche de collision propose un pinceau rectangulaire et un remplissage contigu, ainsi que les opérations globales inverser, tout bloquer et tout rendre praticable. `showCollisionOverlay` permet de conserver sa visualisation lorsqu’un autre outil Blueprint est actif. Ces préférences appartiennent au projet de l’éditeur, pas au document portable.

`analyzeCollisionConsistency` compare la surface graphique et les cases praticables en distinguant les surfaces bloquées des cases praticables hors Blueprint. Ce compteur est seulement diagnostique : aucune correction automatique n’est effectuée. `copyCollisionFromBlueprint` constitue l’unique synchronisation globale et ne s’exécute qu’à la demande explicite de l’utilisateur.
