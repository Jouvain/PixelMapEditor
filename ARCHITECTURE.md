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
