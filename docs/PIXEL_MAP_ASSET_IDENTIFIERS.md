# Identifiants publics des assets Pixel Map

Ce document fixe le contrat d’identification partagé entre PixelMapEditor, les catalogues d’assets et les adaptateurs de moteurs de jeu. Il ne définit pas encore le format d’un catalogue.

## Référence qualifiée

Une référence publique complète suit la forme :

```text
<libraryId>:<resourceId>
```

Exemple :

```text
office:desk.standard
```

`libraryId` identifie le catalogue. `resourceId` identifie durablement une ressource à l’intérieur de ce catalogue. Leur concaténation constitue l’identité portable utilisée dans les cartes et par les adaptateurs.

## Grammaire normative

Les identifiants utilisent uniquement les caractères ASCII minuscules afin que leur comparaison soit identique sur toutes les plateformes.

```text
segment     = lettre minuscule ou chiffre,
              puis lettres minuscules, chiffres ou tirets,
              puis éventuellement une lettre minuscule ou un chiffre

libraryId   = segment
resourceId  = segment *("." segment)
reference   = libraryId ":" resourceId
```

En expression régulière :

```text
libraryId  ^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$
resourceId ^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$
```

Le séparateur `:` est réservé à la qualification. Le point organise un identifiant de ressource en espaces de noms lisibles ; il n’a aucune sémantique de chemin.

## Stabilité et propriété

- L’éditeur de jeu ou son pipeline d’assets est l’autorité qui attribue `libraryId` et `resourceId`.
- Un `libraryId` doit être unique parmi les catalogues chargés dans un même projet de jeu.
- Un `resourceId` doit être unique dans sa bibliothèque.
- L’identité ne doit être dérivée ni d’un chemin de fichier, ni d’un nom affiché, ni d’un index de tableau.
- Renommer ou déplacer la ressource native ne modifie jamais sa référence publique.
- La suppression d’une ressource réserve son ancien identifiant. Le registre de l’éditeur de jeu doit conserver cet identifiant comme tombeau (`tombstone`) et ne pas l’attribuer à une autre ressource.
- Un renommage d’identité est une migration explicite. Il nécessite une table ancien identifiant → nouvel identifiant ; il ne doit pas être déduit automatiquement.

Deux catalogues peuvent donc déclarer le même identifiant local :

```text
office:desk.standard
school:desk.standard
```

Ces références désignent deux ressources distinctes.

## Séparation avec les identifiants natifs

Les GUID Unity, UID Godot, chemins `res://`, clés Addressables, URLs de bundles et autres identifiants natifs ne font pas partie de l’identité Pixel Map. Ils restent dans le registre ou l’adaptateur propre au jeu :

```text
office:desk.standard → Unity GUID
office:desk.standard → Godot UID
office:desk.standard → clé JavaScript
```

Un catalogue transportable peut contenir une image de présentation et des métadonnées visuelles, mais pas ces correspondances natives.

## Chemins des ressources

Une valeur `source` est un emplacement de contenu, jamais une identité. Lorsqu’elle est relative, elle est résolue relativement au fichier catalogue qui la déclare, et non relativement à la carte, à la page web ou au répertoire courant du moteur.

Modifier `source` ne change donc pas la référence publique.

## Compatibilité avec Pixel Map v1

Pixel Map v1 accepte actuellement des identifiants de ressources non qualifiés comme `asset.desk`. Ils restent valides pour préserver la compatibilité. Les nouveaux catalogues externes et leurs adaptateurs doivent utiliser les références qualifiées définies ici. La migration du catalogue intégré fera l’objet d’une étape séparée.

L’implémentation de référence se trouve dans `src/asset-reference.js`.
