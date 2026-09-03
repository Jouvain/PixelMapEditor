# Pixel Map Assets v1

Pixel Map Assets est un format JSON portable décrivant les ressources visuelles qu’un éditeur de jeu met à disposition de PixelMapEditor. La version 1.0 traite uniquement les images statiques. Elle ne décrit ni comportement, ni objet de moteur, ni chargement GPU.

## Fichier

L’extension recommandée est `.pmap-assets.json`. Le contenu utilise UTF-8 et suit le schéma `pixel-map-assets-v1.schema.json`.

```json
{
  "format": "pixel-map-assets",
  "version": "1.0",
  "id": "office",
  "name": "Mobilier de bureau",
  "resources": [
    {
      "id": "desk.standard",
      "name": "Bureau standard",
      "type": "image",
      "source": "./previews/desk.png",
      "size": { "width": 64, "height": 48 },
      "anchor": { "x": 0.5, "y": 1 },
      "category": "furniture",
      "tags": ["desk", "office"],
      "properties": {}
    }
  ],
  "properties": {}
}
```

## Identité

`id` à la racine est le `libraryId`. L’identifiant d’une ressource reste local au catalogue. Sa référence publique est calculée, elle n’est pas stockée dans la ressource :

```text
office + desk.standard = office:desk.standard
```

Un `resource.id` contenant `:` est invalide et ambigu. Les règles complètes de stabilité, de tombstone et de séparation avec les identifiants natifs figurent dans `PIXEL_MAP_ASSET_IDENTIFIERS.md`.

## Sources et chemins

`source` accepte :

- une URI `data:image/...` embarquée ;
- une URL HTTPS ;
- un chemin relatif vers une image PNG, JPEG, GIF, WebP ou SVG.

Un chemin relatif est toujours résolu depuis le répertoire du fichier `.pmap-assets.json`. Il ne dépend ni de la carte qui consomme le catalogue, ni du répertoire courant du moteur. Les URI temporaires `blob:`, les chemins absolus et les URI propres à un moteur ne sont pas portables et sont refusés.

## Import dans PixelMapEditor

L’éditeur accepte trois formes d’import :

- une URL HTTPS vers un catalogue, dont les sources relatives sont résolues depuis cette URL ;
- un fichier `.pmap-assets.json` autonome, si toutes ses images utilisent `data:image/...` ou HTTPS ;
- un paquet `.pmap-assets.zip` contenant exactement un catalogue et ses images.

```text
office.pmap-assets.zip
├── catalog.json
└── images/
    ├── desk.png
    └── chair.png
```

Dans les navigateurs compatibles, un dossier présentant la même arborescence peut aussi être ouvert directement. Les paquets et dossiers sont limités à 500 fichiers et 100 Mio décompressés ; un ZIP ne peut pas dépasser 25 Mio.

PixelMapEditor crée des URL `blob:` temporaires pour afficher les images d’un paquet ou d’un dossier. Elles sont révoquées lorsque la bibliothèque est retirée et ne sont jamais sérialisées : une carte exportée conserve la source portable du catalogue.

## Dimensions et ancre

`size` contient les dimensions intrinsèques de présentation en pixels. `width` et `height` sont des entiers strictement positifs.

`anchor` est normalisée : `x` et `y` sont compris entre `0` et `1`. La position d’une instance désigne ce point dans l’image. Par exemple :

- `{ "x": 0, "y": 0 }` : coin supérieur gauche ;
- `{ "x": 0.5, "y": 0.5 }` : centre ;
- `{ "x": 0.5, "y": 1 }` : milieu du bord inférieur.

## Classement et propriétés

`category` est une chaîne non vide utilisée pour le classement principal. `tags` contient des chaînes non vides et uniques servant à la recherche. Leur vocabulaire appartient au producteur du catalogue.

`properties` accepte des données JSON libres. Aucun script, GUID Unity, UID Godot, chemin de ressource natif ou autre correspondance runtime ne doit y être stocké.

## Validation

Une erreur rend le catalogue invalide. Le validateur de référence vérifie notamment :

- le format et la version ;
- la grammaire du `libraryId` et des `resourceId` ;
- l’unicité des identifiants locaux ;
- l’absence de référence déjà qualifiée dans `resource.id` ;
- le type `image` ;
- la portabilité de la source ;
- les dimensions strictement positives ;
- l’ancre normalisée ;
- les tags uniques ;
- la sérialisabilité JSON des propriétés.

Le schéma vérifie la structure d’un document. Les invariants comme l’unicité des identifiants sont vérifiés par `src/pixel-map-assets-format.js`.

Une fixture complète avec plusieurs ressources et des previews relatives est disponible dans `tests/fixtures/pixel-map-assets/`. Elle sert de contrat d’intégration aux futurs chargeurs de catalogues.

## Hors périmètre de la version 1.0

Les atlas, animations, collisions par asset, templates d’objets et correspondances propres aux moteurs sont volontairement exclus. Ils pourront être ajoutés par une version ultérieure sans modifier la signification des références publiques existantes.
