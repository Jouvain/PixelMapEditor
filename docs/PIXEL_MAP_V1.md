# Pixel Map v1

Pixel Map est un format JSON indépendant de tout moteur de jeu. L’éditeur crée, modifie, valide et exporte les données. Les jeux les interprètent avec leurs propres adaptateurs.

## Fichiers

- `.pmap.json` : document portable `pixel-map`.
- `.pmap-project.json` : enveloppe `pixel-map-project` contenant le document et l’état non essentiel de l’éditeur.
- `.png` : aperçu rendu, sans données métier.

Les fichiers utilisent UTF-8. L’origine des coordonnées est en haut à gauche. Les cases sont indexées à partir de zéro.

## Document portable

```json
{
  "format": "pixel-map",
  "version": "1.0",
  "id": "office-floor-01",
  "name": "Bureau — Étage 01",
  "map": { "width": 1152, "height": 768, "background": "#f8f7f2" },
  "grid": { "columns": 36, "rows": 24, "cellWidth": 32, "cellHeight": 32 },
  "resources": [],
  "layers": [],
  "collision": { "encoding": "sparse", "defaultBlocked": true, "cells": [], "properties": {} },
  "objects": [],
  "zones": [],
  "properties": {}
}
```

En v1, `map.width = grid.columns × grid.cellWidth` et `map.height = grid.rows × grid.cellHeight`.

## Couches

Les couches sont ordonnées du fond vers le premier plan. Les types v1 sont `tile`, `sprite` et `image`. Elles ont un `id`, un `name`, `visible`, une `opacity` entre 0 et 1, un `offset` et des `properties` libres.

Une tuile utilise des coordonnées de grille et référence une ressource. Sa rotation vaut `0`, `90`, `180` ou `270`. Un sprite utilise des coordonnées logiques, une échelle et un point d’ancrage.

## Collision

La collision est une couche logique par cases, indépendante du rendu. `defaultBlocked` définit la valeur implicite et `cells` contient uniquement les exceptions. L’éditeur interprète seulement le booléen `blocked`; `type` et `properties` restent opaques.

## Objets et zones

Un objet possède un `id` unique, un `type` libre, une position logique et des propriétés JSON. Il peut facultativement référencer une couche et une ressource.

Une zone possède un `id`, un `type`, des propriétés et une forme `rectangle` ou `polygon`. Une zone ne déclenche aucun comportement par elle-même.

## Projet d’édition

```json
{
  "format": "pixel-map-project",
  "version": "1.0",
  "document": { "format": "pixel-map", "version": "1.0" },
  "editor": {
    "activeStep": "blueprint",
    "activeTool": "room",
    "selectedLayer": "floor",
    "selectedAsset": "builtin:desk",
    "zoom": 1,
    "showGrid": true,
    "properties": {}
  }
}
```

Supprimer `editor` ne doit jamais modifier le contenu exportable de la carte.

## Propriétés et adaptateurs

Les propriétés libres acceptent uniquement des valeurs JSON. Les clés spécifiques à un jeu devraient être préfixées, par exemple `officeGame:capacity`. Aucun script, contrôle, IA, score, inventaire, règle physique ou comportement de porte n’appartient au format.

## Validation

Une `error` interdit l’export, une `warning` l’autorise avec avertissement et une `info` est non bloquante. Sont notamment validés : version, dimensions, identifiants uniques, références, limites de la grille, opacité, rotations, formes et sérialisabilité JSON.

Le schéma structurel de référence est `pixel-map-v1.schema.json`. Les invariants croisés, comme dimensions/grille et références, sont validés par `src/pixel-map-format.js`.
