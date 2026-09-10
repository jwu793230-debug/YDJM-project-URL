export function buildPointButtonDescriptors(points) {
  const seenIds = new Set();

  return points.map((point, index) => {
    if (seenIds.has(point.id)) {
      throw new Error(`重复的航拍点编号：${point.id}`);
    }
    seenIds.add(point.id);

    const shortLabel = String(index + 1).padStart(2, "0");
    return {
      id: point.id,
      shortLabel,
      label: `航拍点${shortLabel}：${point.name}`,
      title: point.name,
    };
  });
}
