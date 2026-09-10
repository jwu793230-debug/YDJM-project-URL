export function buildPanoramaGeoJson(points) {
  const route = {
    type: "Feature",
    properties: {
      kind: "panorama-route",
      name: "航拍点分布示意",
    },
    geometry: {
      type: "LineString",
      coordinates: points.map(({ lon, lat, alt }) => [lon, lat, alt]),
    },
  };

  const markers = points.map((point, index) => ({
    type: "Feature",
    properties: {
      ...point,
      kind: "panorama-point",
      order: index + 1,
    },
    geometry: {
      type: "Point",
      coordinates: [point.lon, point.lat, point.alt],
    },
  }));

  return {
    type: "FeatureCollection",
    features: [route, ...markers],
  };
}

export function findPanoramaById(points, id) {
  return points.find((point) => point.id === id) ?? null;
}

export function deriveRouteOverview(start, end, options = {}) {
  const toRadians = (value) => value * Math.PI / 180;
  const startLatitude = toRadians(start.lat);
  const endLatitude = toRadians(end.lat);
  const longitudeDelta = toRadians(end.lon - start.lon);
  const latitudeDelta = endLatitude - startLatitude;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const distance = 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  const bearing = (from, to) => {
    const fromLatitude = toRadians(from.lat);
    const toLatitude = toRadians(to.lat);
    const delta = toRadians(to.lon - from.lon);
    return normalizeDegrees(Math.atan2(
      Math.sin(delta) * Math.cos(toLatitude),
      Math.cos(fromLatitude) * Math.sin(toLatitude)
        - Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(delta),
    ) * 180 / Math.PI);
  };

  return {
    forwardHeading: bearing(start, end),
    offsetHeading: bearing(end, start),
    distance,
    pitch: options.pitch ?? -20,
    range: Math.max(options.minimumRange ?? 6200, distance * (options.rangeScale ?? 1.9)),
  };
}

export function sampleHeightGrid(heights, metadata, longitude, latitude) {
  const { width, height, west, east, south, north } = metadata;
  const x = Math.min(width - 1, Math.max(0, ((longitude - west) / (east - west)) * (width - 1)));
  const y = Math.min(height - 1, Math.max(0, ((north - latitude) / (north - south)) * (height - 1)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const tx = x - x0;
  const ty = y - y0;
  const top = heights[y0 * width + x0] * (1 - tx) + heights[y0 * width + x1] * tx;
  const bottom = heights[y1 * width + x0] * (1 - tx) + heights[y1 * width + x1] * tx;

  return top * (1 - ty) + bottom * ty;
}

export function buildElevatedSurfacePath(coordinates, sampleHeight, offsetMeters = 0, maximumStepMeters = Infinity) {
  const sampledCoordinates = [];
  for (let index = 0; index < coordinates.length; index += 1) {
    const start = coordinates[index];
    sampledCoordinates.push(start);
    const end = coordinates[index + 1];
    if (!end || !Number.isFinite(maximumStepMeters) || maximumStepMeters <= 0) continue;
    const steps = Math.ceil(horizontalSegmentDistanceMeters(start, end) / maximumStepMeters);
    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      sampledCoordinates.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]);
    }
  }
  return sampledCoordinates.map(([longitude, latitude]) => [
    longitude,
    latitude,
    sampleHeight(longitude, latitude) + offsetMeters,
  ]);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function horizontalSegmentDistanceMeters(start, end) {
  const earthRadius = 6_371_000;
  const averageLatitude = ((start[1] + end[1]) / 2) * Math.PI / 180;
  const latitudeDelta = (end[1] - start[1]) * Math.PI / 180;
  const longitudeDelta = (end[0] - start[0]) * Math.PI / 180;
  return earthRadius * Math.hypot(latitudeDelta, longitudeDelta * Math.cos(averageLatitude));
}

export function buildTunnelProfile({ coordinates, startElevation, endElevation }) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return { positions: [], horizontalLengthMeters: 0 };
  }

  const cumulativeDistances = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulativeDistances.push(
      cumulativeDistances[index - 1] +
      horizontalSegmentDistanceMeters(coordinates[index - 1], coordinates[index]),
    );
  }
  const horizontalLengthMeters = cumulativeDistances.at(-1);
  const elevationDelta = endElevation - startElevation;
  const positions = coordinates.map(([longitude, latitude], index) => {
    const progress = horizontalLengthMeters > 0 ? cumulativeDistances[index] / horizontalLengthMeters : 0;
    return [longitude, latitude, startElevation + elevationDelta * progress];
  });

  return { positions, horizontalLengthMeters };
}

export function shouldSynchronizePtzMap(followEnabled, syncMap) {
  return Boolean(followEnabled && syncMap);
}

export function deriveCameraPose(panoramaPose, calibration) {
  const {
    headingOffset = 0,
    basePitch = -46,
    pitchScale = 0.55,
    minPitch = -70,
    maxPitch = -18,
    baseRange = 2100,
    baseFov = 75,
    minRange = 1200,
    maxRange = 3200,
  } = calibration;

  return {
    heading: normalizeDegrees(panoramaPose.yaw + headingOffset),
    pitch: clamp(basePitch + panoramaPose.pitch * pitchScale, minPitch, maxPitch),
    range: clamp(baseRange * (panoramaPose.fov / baseFov), minRange, maxRange),
  };
}

export function placeSpatialPortal(anchor, portal, viewport, margin = 16, offsetX = 28) {
  const desiredX = anchor.x + offsetX;
  const desiredY = anchor.y - portal.height / 2;
  const maximumX = Math.max(margin, viewport.width - portal.width - margin);
  const maximumY = Math.max(margin, viewport.height - portal.height - margin);
  const x = clamp(desiredX, margin, maximumX);
  const y = clamp(desiredY, margin, maximumY);

  return {
    x,
    y,
    clampedX: x !== desiredX,
    clampedY: y !== desiredY,
  };
}

export function derivePtzMapView(ptzState, calibration) {
  const {
    northOffset = 0,
    basePitch = -38,
    tiltScale = 0.4,
    minPitch = -62,
    maxPitch = -16,
    baseRange = 900,
    minRange = 160,
    maxRange = 900,
  } = calibration;
  const safeZoom = Math.max(1, ptzState.zoom);

  return {
    heading: normalizeDegrees(ptzState.pan + northOffset),
    pitch: clamp(basePitch + ptzState.tilt * tiltScale, minPitch, maxPitch),
    range: clamp(baseRange / Math.sqrt(safeZoom), minRange, maxRange),
  };
}

export function derivePtzPanoramaWindow(ptzState, calibration = {}) {
  const {
    headingOffset = 0,
    sourceOffset = headingOffset,
    baseHorizontalFov = 92,
    minHorizontalFov = 12,
  } = calibration;
  const safeZoom = clamp(ptzState.zoom || 1, 1, 16);
  const heading = normalizeDegrees(ptzState.pan + headingOffset);
  const sourceHeading = normalizeDegrees(ptzState.pan + sourceOffset);
  const directions = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];

  return {
    heading,
    centerX: sourceHeading / 360,
    centerY: clamp(0.5 - (clamp(ptzState.tilt, -45, 45) / 45) * 0.22, 0.28, 0.72),
    horizontalFov: clamp(baseHorizontalFov / safeZoom, minHorizontalFov, baseHorizontalFov),
    direction: directions[Math.round(heading / 45) % directions.length],
  };
}

export function createLayerVisibilityController(layerEntities, onChange = () => {}) {
  const layers = new Map(
    Object.entries(layerEntities).map(([layer, entities]) => [
      layer,
      { entities: Array.from(entities), visible: true },
    ]),
  );

  function setVisible(layer, visible) {
    const target = layers.get(layer);
    if (!target) return null;
    target.visible = Boolean(visible);
    for (const entity of target.entities) entity.show = target.visible;
    onChange(layer, target.visible);
    return target.visible;
  }

  return {
    isVisible(layer) {
      return layers.get(layer)?.visible ?? null;
    },
    setVisible,
    toggle(layer) {
      const target = layers.get(layer);
      return target ? setVisible(layer, !target.visible) : null;
    },
  };
}
