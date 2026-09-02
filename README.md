# PixelMapEditor

PixelMapEditor est un petit éditeur web de cartes 2D en pixel art. Il permet de construire une carte visuelle et ses données logiques sans dépendre d’un moteur de jeu.

L’éditeur produit des documents **Pixel Map v1** : un format JSON portable décrivant la grille, les couches graphiques, les collisions, les objets et les zones. Les futurs jeux restent responsables de l’interprétation de ces données au moyen de leurs propres adaptateurs. PixelMapEditor n’implémente donc aucun comportement de jeu.

## Fonctionnement

L’édition se déroule en deux écrans.

### 1. Blueprint

Le Blueprint définit la structure de la carte :

- création et effacement de surfaces sur une grille configurable ;
- sélection, déplacement, duplication, copie et suppression de cellules ;
- placement et édition des portes ;
- édition d’une couche de collision indépendante du dessin ;
- redimensionnement de la grille et des cases logiques.

La collision n’est jamais synchronisée automatiquement avec le Blueprint. Une commande explicite permet de la recopier lorsque cela est souhaité.

### 2. Habillage

L’écran Habillage complète la carte :

- choix du sol et placement d’assets pixel art ;
- création et déplacement d’objets génériques ;
- placement libre ou aligné sur la grille ;
- création de zones rectangulaires ou polygonales ;
- déplacement, redimensionnement et édition des sommets ;
- modification du type, du nom et des propriétés JSON libres.

Les objets et les zones n’ont aucun comportement prédéfini. Par exemple, une zone de type `spawn`, `danger` ou `dialogue` ne prend son sens que dans le jeu qui consomme la carte.

## Projets, sauvegarde et exports

L’éditeur distingue quatre sorties :

- **Sauvegarder** stocke le projet complet dans le `localStorage` du navigateur ;
- **Projet** télécharge un fichier `.pmap-project.json`, qui comprend la carte et les préférences de l’éditeur afin de reprendre le travail ;
- **Export Map** télécharge un fichier `.pmap.json` indépendant de l’éditeur, destiné aux adaptateurs et aux jeux ;
- **PNG** produit une image de la carte sans grille de travail, sélection ni autre overlay d’édition.

Les ressources graphiques intégrées sont exportées sous forme d’URI `data:image/svg+xml`. Elles restent donc portables sans dépendre du catalogue interne de PixelMapEditor. Le format accepte également les URL HTTPS et les chemins d’image relatifs.

Les imports et exports sont validés selon Pixel Map v1. Le rapport de validation présente toutes les erreurs, tous les avertissements et toutes les informations avec leur chemin JSON. Lorsqu’une anomalie correspond à un élément éditable, le rapport peut le sélectionner dans la carte.

La spécification détaillée se trouve dans [docs/PIXEL_MAP_V1.md](docs/PIXEL_MAP_V1.md), avec son schéma dans [docs/pixel-map-v1.schema.json](docs/pixel-map-v1.schema.json).

Le contrat des identifiants publics destinés aux futurs catalogues d’assets et aux adaptateurs de jeux est défini dans [docs/PIXEL_MAP_ASSET_IDENTIFIERS.md](docs/PIXEL_MAP_ASSET_IDENTIFIERS.md).

Le format des catalogues d’images réutilisables est spécifié dans [docs/PIXEL_MAP_ASSETS_V1.md](docs/PIXEL_MAP_ASSETS_V1.md), avec son schéma dans [docs/pixel-map-assets-v1.schema.json](docs/pixel-map-assets-v1.schema.json).

## Démarrage

Prérequis :

- Node.js et npm pour les tests ;
- Python pour le petit serveur HTTP local.

Installer les dépendances :

```bash
npm install
```

Lancer l’éditeur :

```bash
npm start
```

Puis ouvrir <http://localhost:8000>.

Un serveur HTTP est nécessaire, car l’application charge des modules JavaScript ES. Ouvrir directement `index.html` avec une URL `file://` n’est pas pris en charge.

## Commandes utiles

| Commande | Utilité |
| --- | --- |
| `npm start` | Démarre l’application sur le port 8000. |
| `npm run check` | Vérifie la syntaxe des modules JavaScript. |
| `npm test` | Exécute les 48 tests du modèle, du format et des conversions. |
| `npm run test:browser` | Exécute les interactions réelles dans Chromium avec Playwright. |
| `npm run test:all` | Exécute les tests du modèle puis les tests navigateur. |

Avant le premier lancement des tests navigateur, installer Chromium pour Playwright :

```bash
npx playwright install chromium
```

La suite navigateur couvre notamment le clic-glissement, le zoom, le redimensionnement réel du canvas, les polygones, l’import de fichier, les téléchargements JSON et PNG ainsi que la sauvegarde dans `localStorage`.

## Architecture

Le code suit le flux suivant :

```text
Entrées utilisateur → outils → état de la carte → rendu canvas
                                      ↓
                              validation et export
```

Les principaux fichiers sont :

- `app.js` : initialise l’application et relie l’interface aux modules ;
- `src/map-state.js` : contient l’état et les opérations métier ;
- `src/tools.js` : transforme les interactions du pointeur en opérations ;
- `src/map-renderer.js` : dessine l’état courant dans le canvas ;
- `src/export.js` : sauvegarde, importe et exporte les projets ;
- `src/pixel-map-format.js` : construit et valide Pixel Map v1 ;
- `src/project-adapter.js` : convertit l’état interne vers le format portable et inversement ;
- `src/assets.js` et `src/portable-assets.js` : gèrent le catalogue graphique et sa portabilité.

Une description plus détaillée est disponible dans [ARCHITECTURE.md](ARCHITECTURE.md).

## Principes du projet

- Le format exporté reste indépendant de PixelMapEditor et de tout moteur de jeu.
- Le Blueprint, les collisions, les objets et les zones sont des données distinctes.
- Les modifications susceptibles d’écraser un travail non sauvegardé demandent confirmation.
- Les données importées que l’éditeur ne sait pas modifier sont conservées lors d’un nouvel export.
- Les comportements dynamiques — ouverture d’une porte, déclenchement d’une zone ou logique de collision en jeu — appartiennent aux adaptateurs et non à l’éditeur.
