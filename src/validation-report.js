export function summarizeValidation(validation) {
  const counts = { error: 0, warning: 0, info: 0 };
  (validation?.issues || []).forEach((item) => {
    const severity = item.severity === 'information' ? 'info' : item.severity;
    if (severity in counts) counts[severity] += 1;
  });
  return counts;
}

export function validationIssueTarget(issue, document) {
  if (!document || !issue?.path) return null;
  const path = issue.path.replace(/^document\./, '');
  let match = /^objects\[(\d+)\]/.exec(path);
  if (match) {
    const object = document.objects?.[Number(match[1])];
    if (!object || object.type === 'architecture.door') return null;
    return { kind: 'object', id: object.id };
  }
  match = /^zones\[(\d+)\]/.exec(path);
  if (match) {
    const zone = document.zones?.[Number(match[1])];
    return zone ? { kind: 'zone', id: zone.id } : null;
  }
  match = /^collision\.cells\[(\d+)\]/.exec(path);
  if (match) {
    const cell = document.collision?.cells?.[Number(match[1])];
    return cell ? { kind: 'collision', x: cell.x, y: cell.y } : null;
  }
  match = /^layers\[(\d+)\]\.tiles\[(\d+)\]/.exec(path);
  if (match) {
    const tile = document.layers?.[Number(match[1])]?.tiles?.[Number(match[2])];
    return tile ? { kind: 'blueprint', x: tile.x, y: tile.y } : null;
  }
  return null;
}
