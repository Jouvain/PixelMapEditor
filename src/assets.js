import { AssetRegistry } from './asset-registry.js';
import { createPixelMapAssets } from './pixel-map-assets-format.js';
import { portableAssetSource } from './portable-assets.js';

const BUILTIN_ASSETS = [
  { id: 'desk', name: 'Bureau', category: 'work' },
  { id: 'chair', name: 'Chaise', category: 'work' },
  { id: 'computer', name: 'Ordinateur', category: 'work' },
  { id: 'shelf', name: 'Étagère', category: 'work' },
  { id: 'plant', name: 'Plante', category: 'nature' },
  { id: 'sofa', name: 'Canapé', category: 'nature' },
  { id: 'cabinet', name: 'Armoire', category: 'other' },
  { id: 'lamp', name: 'Lampe', category: 'other' },
];

export const BUILTIN_LIBRARY_ID = 'builtin';
export const DEFAULT_ASSET_REF = `${BUILTIN_LIBRARY_ID}:desk`;

export const BUILTIN_ASSET_LIBRARY = createPixelMapAssets({
  id: BUILTIN_LIBRARY_ID,
  name: 'Assets intégrés',
  resources: BUILTIN_ASSETS.map((asset) => ({
    id: asset.id,
    name: asset.name,
    type: 'image',
    source: portableAssetSource('objects', asset.id),
    size: { width: 96, height: 96 },
    anchor: { x: 0.5, y: 0.5 },
    category: asset.category,
    tags: [asset.id, asset.category],
    properties: { builtin: true },
  })),
});

function drawBuiltinSprite(context, type, x, y, scale = 0.6, rotation = 0) {
  const rectangle = (left, top, width, height, color) => {
    context.fillStyle = color;
    context.fillRect(left, top, width, height);
  };
  context.save();
  context.translate(x, y);
  context.rotate(rotation * Math.PI / 2);
  context.scale(scale, scale);

  if (type === 'desk') {
    rectangle(-42, -20, 84, 39, '#713d20'); rectangle(-38, -17, 76, 32, '#b96b36');
    rectangle(-34, -6, 68, 3, '#dc9254'); rectangle(-34, 19, 7, 20, '#33251f'); rectangle(27, 19, 7, 20, '#33251f');
  } else if (type === 'chair') {
    rectangle(-14, -12, 28, 26, '#142936'); rectangle(-10, -9, 20, 18, '#2d5062'); rectangle(-15, 9, 30, 7, '#111c23');
  } else if (type === 'computer') {
    rectangle(-17, -14, 34, 23, '#15232b'); rectangle(-12, -10, 24, 14, '#1798c1'); rectangle(-8, -7, 16, 7, '#42c3e1'); rectangle(-12, 16, 24, 4, '#333');
  } else if (type === 'shelf') {
    rectangle(-29, -15, 58, 30, '#3d2619'); rectangle(-25, -12, 50, 24, '#8e5430');
    for (let i = -18; i < 22; i += 10) rectangle(i, -8, 6, 16, ['#cf7140', '#d8b34f', '#4c7780'][Math.abs(i) % 3]);
  } else if (type === 'plant') {
    rectangle(-9, 4, 18, 17, '#95502d'); rectangle(-6, 7, 12, 11, '#c4713c'); context.fillStyle = '#38653f';
    for (let i = 0; i < 6; i += 1) { context.beginPath(); context.arc(Math.cos(i) * 9, -3 + Math.sin(i) * 7, 7, 0, 7); context.fill(); }
  } else if (type === 'sofa') {
    rectangle(-40, -14, 80, 29, '#304f54'); rectangle(-36, -11, 72, 23, '#4d7c78'); rectangle(-39, -17, 8, 32, '#233b3e'); rectangle(31, -17, 8, 32, '#233b3e');
  } else if (type === 'cabinet') {
    rectangle(-29, -15, 58, 30, '#554031'); rectangle(-25, -12, 50, 24, '#aaa49a'); rectangle(0, -12, 2, 24, '#5d5e59');
  } else if (type === 'lamp') {
    rectangle(-3, -3, 6, 21, '#373b3a'); rectangle(-12, 16, 24, 5, '#252827'); rectangle(-13, -14, 26, 13, '#d3a74d');
  }
  context.restore();
}

export const assetRegistry = new AssetRegistry();
assetRegistry.addLibrary(BUILTIN_ASSET_LIBRARY, {
  draw: (context, asset, x, y, scale, rotation) => drawBuiltinSprite(context, asset.id, x, y, scale, rotation),
});
