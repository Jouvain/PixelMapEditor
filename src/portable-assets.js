const svgDataUri = (body, viewBox = '0 0 96 96') => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" shape-rendering="crispEdges">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const rect = (x, y, width, height, fill) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`;

const OBJECTS = {
  desk: `${rect(6, 28, 84, 39, '#713d20')}${rect(10, 31, 76, 32, '#b96b36')}${rect(14, 42, 68, 3, '#dc9254')}${rect(14, 67, 7, 20, '#33251f')}${rect(75, 67, 7, 20, '#33251f')}`,
  chair: `${rect(34, 34, 28, 26, '#142936')}${rect(38, 37, 20, 18, '#2d5062')}${rect(33, 55, 30, 7, '#111c23')}`,
  computer: `${rect(31, 27, 34, 23, '#15232b')}${rect(36, 31, 24, 14, '#1798c1')}${rect(40, 34, 16, 7, '#42c3e1')}${rect(36, 57, 24, 4, '#333')}`,
  shelf: `${rect(19, 33, 58, 30, '#3d2619')}${rect(23, 36, 50, 24, '#8e5430')}${rect(30, 40, 6, 16, '#cf7140')}${rect(40, 40, 6, 16, '#d8b34f')}${rect(50, 40, 6, 16, '#4c7780')}${rect(60, 40, 6, 16, '#cf7140')}`,
  plant: `${rect(39, 52, 18, 17, '#95502d')}${rect(42, 55, 12, 11, '#c4713c')}<circle cx="48" cy="40" r="14" fill="#38653f"/><circle cx="36" cy="45" r="7" fill="#477b4d"/><circle cx="60" cy="45" r="7" fill="#477b4d"/>`,
  sofa: `${rect(8, 34, 80, 29, '#304f54')}${rect(12, 37, 72, 23, '#4d7c78')}${rect(9, 31, 8, 32, '#233b3e')}${rect(79, 31, 8, 32, '#233b3e')}`,
  cabinet: `${rect(19, 33, 58, 30, '#554031')}${rect(23, 36, 50, 24, '#aaa49a')}${rect(48, 36, 2, 24, '#5d5e59')}`,
  lamp: `${rect(45, 45, 6, 21, '#373b3a')}${rect(36, 64, 24, 5, '#252827')}${rect(35, 34, 26, 13, '#d3a74d')}`,
};

const FLOORS = {
  blue: `${rect(0, 0, 32, 32, '#08718b')}${rect(0, 0, 32, 32, '#0c5a70')}<path d="M0 8h32M0 16h32M0 24h32M8 0v32M16 0v32M24 0v32" stroke="#147f94" stroke-width="1" opacity=".45"/>`,
  wood: `${rect(0, 0, 32, 32, '#8b572f')}<path d="M0 8h32M0 16h32M0 24h32M8 0v8M24 8v8M12 16v8M28 24v8" stroke="#5f391f" stroke-width="1"/><path d="M2 4h12M18 12h10M3 20h16M16 28h13" stroke="#b87943" stroke-width="1"/>`,
  stone: `${rect(0, 0, 32, 32, '#c8c5bc')}<path d="M0 16h32M16 0v16M8 16v16M24 16v16" stroke="#9e9b94" stroke-width="1"/>`,
};

export function portableAssetSource(kind, id) {
  if (kind === 'objects' && OBJECTS[id]) return svgDataUri(OBJECTS[id]);
  if (kind === 'floors' && FLOORS[id]) return svgDataUri(FLOORS[id], '0 0 32 32');
  return null;
}

export function migrateLegacyAssetSource(source) {
  const match = /^asset:\/\/(objects|floors)\/([a-z0-9-]+)$/.exec(source || '');
  return match ? portableAssetSource(match[1], match[2]) : null;
}

export function migrateLegacyAssetSources(document) {
  let migrated = 0;
  (document?.resources || []).forEach((resource) => {
    const source = migrateLegacyAssetSource(resource.source);
    if (!source) return;
    resource.source = source;
    resource.properties = { ...(resource.properties || {}), embedded: true, mediaType: 'image/svg+xml' };
    migrated += 1;
  });
  return migrated;
}

export function isPortableImageSource(source) {
  return typeof source === 'string' && (
    source.startsWith('data:image/')
    || /^https:\/\//i.test(source)
    || /^(?![a-z][a-z0-9+.-]*:)[^?#]+\.(png|jpe?g|gif|webp|svg)([?#].*)?$/i.test(source)
  );
}
