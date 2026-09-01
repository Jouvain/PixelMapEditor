const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const between = (value, a, b) => value >= Math.min(a, b) && value <= Math.max(a, b);

function segmentsIntersect(a, b, c, d) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true;
  if (abC === 0 && between(c.x, a.x, b.x) && between(c.y, a.y, b.y)) return true;
  if (abD === 0 && between(d.x, a.x, b.x) && between(d.y, a.y, b.y)) return true;
  if (cdA === 0 && between(a.x, c.x, d.x) && between(a.y, c.y, d.y)) return true;
  return cdB === 0 && between(b.x, c.x, d.x) && between(b.y, c.y, d.y);
}

export function polygonSelfIntersects(points) {
  if (!Array.isArray(points) || points.length < 4) return false;
  for (let i = 0; i < points.length; i += 1) {
    const nextI = (i + 1) % points.length;
    for (let j = i + 1; j < points.length; j += 1) {
      const nextJ = (j + 1) % points.length;
      if (i === j || nextI === j || nextJ === i) continue;
      if (segmentsIntersect(points[i], points[nextI], points[j], points[nextJ])) return true;
    }
  }
  return false;
}
