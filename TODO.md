Le point central est le suivant : la correspondance ne doit pas se faire par nom de fichier, mais par identifiant public stable.
Asset du jeu ──export catalogue──▶ PixelMapEditor
     ▲                                  │
     └──── résolution par identifiant ──┘
                     carte .pmap.json
Par exemple, office:desk.standard doit désigner le même asset partout, même si Unity le stocke sous un GUID et Godot sous res://props/desk.tres.
Architecture cible
Il faut distinguer deux contrats :
1. Catalogue partagé : décrit ce que PixelMapEditor peut afficher et placer.
2. Registre propre au jeu : associe l’identifiant partagé à la ressource native du moteur.
Catalogue :
{
  "format": "pixel-map-assets",
  "version": "1.0",
  "id": "office",
  "resources": [
    {
      "id": "desk.standard",
      "type": "image",
      "source": "./previews/desk.png",
      "size": { "width": 64, "height": 48 },
      "anchor": { "x": 0.5, "y": 1 },
      "category": "furniture",
      "tags": ["desk", "office"],
      "properties": {}
    }
  ]
}
Registre Unity, par exemple :
{
  "office:desk.standard": {
    "guid": "42ab1f...",
    "addressable": "Props/Office/DeskStandard"
  }
}
La carte ne contient que la référence publique :
{
  "id": "desk-01",
  "type": "decoration",
  "resource": "office:desk.standard",
  "position": { "x": 128, "y": 96 },
  "properties": {}
}

Étape 1 — Fixer le contrat d’identification OK
C’est la décision à prendre avant d’écrire du code.
Je recommande :
Référence complète = <libraryId>:<resourceId>
Exemple             = office:desk.standard
Règles :
- libraryId est stable et unique dans le projet de jeu ;
- resourceId ne dépend pas du chemin physique ;
- déplacer ou renommer le fichier natif ne change pas l’identifiant ;
- deux bibliothèques peuvent contenir chacune desk.standard ;
- une ressource supprimée ne doit pas voir son identifiant immédiatement réutilisé ;
- les chemins source sont relatifs au fichier catalogue.
Le moteur conserve la correspondance avec ses propres identifiants :
office:desk.standard → Unity GUID
office:desk.standard → Godot UID
office:desk.standard → clé JavaScript
Ne mets pas ces GUID ou chemins natifs dans Pixel Map Assets. Ils appartiennent à l’adaptateur du jeu.

Étape 2 — Créer Pixel Map Assets v1 OK
Ajouter :
- docs/pixel-map-assets-v1.schema.json
- docs/PIXEL_MAP_ASSETS_V1.md
- src/pixel-map-assets-format.js
Le premier schéma devrait rester limité à :
- id, name ;
- type: image dans un premier temps ;
- source ;
- dimensions ;
- ancre normalisée ;
- catégorie et tags ;
- propriétés JSON libres.
Je repousserais atlas et animation à une seconde itération. Il vaut mieux valider tout le flux avec une image simple avant d’introduire les régions et les frames.
Le validateur devra notamment détecter :
- les identifiants dupliqués ;
- les sources invalides ;
- les dimensions incorrectes ;
- les ancres hors de [0, 1] ;
- les références complètes ambiguës ;
- les formats et versions inconnus.

Étape 3 — Faire exporter le catalogue par l’éditeur de jeu
L’éditeur de jeu devient idéalement la source d’autorité.
Son exporteur doit produire :
pixel-map-assets/
├── office.pmap-assets.json
└── previews/
    ├── desk.png
    ├── chair.png
    └── plant.png
Pour chaque asset exporté, il doit :
1. retrouver ou créer son identifiant public stable ;
2. générer une image utilisable par PixelMapEditor ;
3. exporter ses dimensions et son ancre ;
4. enregistrer localement la correspondance avec l’asset natif ;
5. ne pas modifier les identifiants lors des exports suivants.
Le fichier de correspondance interne pourrait ressembler à ceci :
{
  "version": "1.0",
  "mappings": {
    "office:desk.standard": {
      "engineAsset": "native-guid-or-uid"
    }
  }
}
Ce fichier peut rester dans le projet du jeu et ne pas être distribué à PixelMapEditor.

Étape 4 — Remplacer le catalogue statique de PixelMapEditor OK
Actuellement, la bibliothèque est codée dans [`src/assets.js`](C:\\Users\\cf\\source\\repos\\PixelMapEditor\\src\\assets.js), et l’interface utilise directement ASSETS et drawSprite dans [`app.js`](C:\\Users\\cf\\source\\repos\\PixelMapEditor\\app.js).
Il faut introduire une abstraction, par exemple :
class AssetRegistry {
  addLibrary(library) {}
  removeLibrary(libraryId) {}
  get(resourceRef) {}
  search(query, category) {}
  resolveSource(resourceRef) {}
}
Une entrée normalisée en mémoire pourrait être :
{
  ref: "office:desk.standard",
  libraryId: "office",
  id: "desk.standard",
  name: "Bureau standard",
  type: "image",
  resolvedSource: "blob:...",
  width: 64,
  height: 48,
  anchor: { x: 0.5, y: 1 },
  category: "furniture",
  tags: []
}
Ensuite :
- app.js remplit la palette depuis AssetRegistry ;
- map-state.js stocke la référence complète ;
- map-renderer.js demande l’image au registre ;
- project-adapter.js exporte cette même référence ;
- les assets intégrés actuels deviennent simplement une bibliothèque builtin.
Cela évite d’avoir deux systèmes parallèles.

Étape 5 — Généraliser le rendu
Le renderer actuel appelle directement drawSprite() dans [`src/map-renderer.js`](C:\\Users\\cf\\source\\repos\\PixelMapEditor\\src\\map-renderer.js). Pour des assets externes, il faudra un chargeur asynchrone :
const image = await assetLoader.load(asset.resolvedSource);
Le renderer devra gérer trois états :
- chargement ;
- image disponible ;
- image absente ou invalide.
Un asset manquant devrait rester sélectionnable et être représenté par un placeholder portant son identifiant. Il ne faut surtout pas supprimer silencieusement un objet dont l’image manque.
L’ancre intervient dans le calcul de dessin :
drawX = position.x - width * anchor.x;
drawY = position.y - height * anchor.y;
C’est également ici qu’il faudra décider si position désigne l’ancre de l’objet — choix que je recommande — ou son centre.

Étape 6 — Choisir le mode d’import dans le navigateur
C’est le principal piège technique. Une application web ne peut pas librement ouvrir les images voisines d’un fichier JSON sélectionné par l’utilisateur.
Trois solutions sont possibles :
- catalogue servi par HTTPS ;
- sélection d’un dossier avec la File System Access API ;
- paquet unique contenant catalogue et images.
Pour PixelMapEditor, je recommanderais :
1. MVP : URL HTTPS ou images en data: ;
2. ensuite : import d’un paquet .pmap-assets.zip ;
3. éventuellement : ouverture d’un dossier pour les navigateurs compatibles.
Le paquet est probablement la meilleure expérience utilisateur :
office.pmap-assets.zip
├── catalog.json
└── images/
    ├── desk.png
    └── chair.png
À l’import, PixelMapEditor crée des URL blob: pour l’affichage. Il ne doit toutefois jamais les enregistrer dans la carte, car elles ne survivent pas à la session.

Étape 7 — Adapter Pixel Map sans forcément créer tout de suite une v2
Deux stratégies sont possibles.
Variante A — Compatible avec Pixel Map v1
Conserver une entrée dans resources pour chaque asset utilisé :
{
  "id": "office:desk.standard",
  "type": "image",
  "source": "./previews/desk.png",
  "width": 64,
  "height": 48,
  "properties": {
    "library": "office",
    "assetId": "desk.standard"
  }
}
Cette approche fonctionne presque avec le schéma actuel et son mécanisme de validation des références dans [`src/pixel-map-format.js`](C:\\Users\\cf\\source\\repos\\PixelMapEditor\\src\\pixel-map-format.js).
Avantages :
- changement réduit ;
- cartes encore autonomes ou facilement regroupables ;
- l’éditeur de jeu peut résoudre directement resource.id.
C’est le meilleur premier jalon.
Variante B — Bibliothèques réellement liées
Ajouter à la carte :
{
  "assetLibraries": [
    {
      "id": "office",
      "source": "../assets/office.pmap-assets.json"
    }
  ]
}
Le validateur doit alors charger plusieurs documents avant de vérifier les références. Cela implique aussi versionnement, chemins relatifs, erreurs réseau et gestion des catalogues absents.
Je réserverais cette variante à Pixel Map 1.1 ou 2.0, car le schéma actuel interdit les propriétés supplémentaires.
Étape 8 — Adapter l’import dans PixelMapEditor
[`projectToState()`](C:\\Users\\cf\\source\\repos\\PixelMapEditor\\src\\project-adapter.js) reconnaît actuellement essentiellement les références commençant par asset.. Il devra devenir générique :
assetRef: object.resource ?? null
À l’ouverture d’une carte :
1. lire ses ressources ;
2. rechercher les références dans les catalogues chargés ;
3. associer les correspondances trouvées ;
4. afficher un placeholder pour les références inconnues ;
5. proposer de charger la bibliothèque manquante ;
6. préserver intégralement les ressources inconnues au prochain export.
L’état interne devrait utiliser assetRef, et non assetId, afin de rendre explicite le fait qu’il s’agit d’une référence qualifiée.
Étape 9 — Implémenter l’import côté éditeur de jeu
L’importeur du jeu suit ensuite un algorithme simple :
for (const object of map.objects) {
  if (!object.resource) continue;

  const nativeAsset = registry.resolve(object.resource);

  if (!nativeAsset) {
    reportMissingAsset(object.id, object.resource);
    continue;
  }

  instantiate(nativeAsset, {
    position: object.position,
    rotation: object.rotation,
    properties: object.properties
  });
}
L’importeur doit distinguer :
- ressource inconnue ;
- ressource connue mais fichier natif absent ;
- type incompatible ;
- propriété ignorée ;
- asset correctement instancié.
Les erreurs doivent mentionner à la fois l’objet et la référence :
objects[12] "desk-01":
impossible de résoudre "office:desk.standard"
Étape 10 — Ajouter la synchronisation contrôlée
Quand le catalogue du jeu change, PixelMapEditor doit pouvoir le recharger sans modifier les placements.
Une synchronisation devrait :
- mettre à jour noms, aperçus, tags et dimensions ;
- conserver les objets placés ;
- signaler les assets supprimés ;
- ne jamais remplacer automatiquement un identifiant absent par un asset « ressemblant » ;
- détecter une modification d’ancre susceptible de déplacer visuellement les objets.
Un champ facultatif d’empreinte peut aider :
{
  "revision": "2026-09-02",
  "contentHash": "sha256:..."
}
La référence stable reste toutefois l’identifiant, pas le hash.
Ordre de réalisation recommandé
Je découperais l’implémentation en quatre livraisons.
Livraison 1 — Boucle verticale minimale
- schéma Pixel Map Assets ;
- une bibliothèque ;
- images uniquement ;
- import par URL ou data: ;
- palette dynamique ;
- placement ;
- export avec identifiants stables ;
- petit importeur de démonstration côté jeu.
Objectif : prouver qu’un bureau exporté par le jeu revient correctement au même asset.
Livraison 2 — Robustesse
- plusieurs bibliothèques ;
- références qualifiées ;
- placeholders ;
- rapport de ressources manquantes ;
- cache d’images ;
- rechargement de catalogue ;
- tests de chemins et d’identifiants.
Livraison 3 — Distribution
- paquet ZIP ;
- export autonome contre export lié ;
- incorporation des ressources ;
- réécriture déterministe des chemins ;
- empreintes et révisions.
Livraison 4 — Formats avancés
- atlas et régions ;
- animations ;
- empreinte ou collision visuelle par défaut ;
- outils d’adaptation Unity/Godot ;
- migration éventuelle vers Pixel Map 1.1/2.0.
Tests d’acceptation indispensables
Le scénario principal devrait être automatisé :
1. le jeu exporte office:desk.standard ;
2. PixelMapEditor charge le catalogue ;
3. l’utilisateur place deux bureaux ;
4. la carte exportée contient deux références identiques ;
5. l’éditeur du jeu importe la carte ;
6. les deux objets résolvent le même asset natif ;
7. déplacer le fichier natif dans le projet du jeu ne casse pas la correspondance ;
8. supprimer la correspondance produit une erreur explicite ;
9. rouvrir puis réexporter la carte ne perd aucune donnée.
La meilleure première implémentation consiste donc à garder les resources de Pixel Map v1, rendre la bibliothèque interne dynamique, et utiliser leurs id comme clés de correspondance avec le jeu. Les catalogues externes liés peuvent venir ensuite : ils ne sont pas nécessaires pour démontrer et sécuriser l’aller-retour.