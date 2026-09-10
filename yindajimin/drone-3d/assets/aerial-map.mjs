import {
  createLayerVisibilityController,
  deriveRouteOverview,
  findPanoramaById,
  placeSpatialPortal,
  sampleHeightGrid,
} from "./map-core.mjs?v=20260908-r1";
import { PANORAMA_POINTS, PANORAMA_PROJECT_URL } from "./panorama-data.mjs";
import { buildPointButtonDescriptors } from "./point-strip.mjs?v=20260909-r1";
import { createRoadSurfaceModel } from "./road-surface.mjs";
import { addRoadSurfaces } from "./road-renderer.mjs";
import { ADIT_1_PORTAL, BRIDGES, ROADS, WATER_BODIES } from "./site-features.mjs";

const Cesium = window.Cesium;
const mapStatus = document.getElementById("mapStatus");
const projectMapFrame = document.querySelector(".project-map-frame");
const spatialPanoramaPortal = document.getElementById("spatialPanoramaPortal");
const panoramaPortalTitle = document.getElementById("panoramaPortalTitle");
const spatialPanoramaIframe = document.getElementById("spatialPanoramaIframe");
const panoramaPortalAnchor = document.getElementById("panoramaPortalAnchor");
const panoramaPortalTether = document.getElementById("panoramaPortalTether");
const panoramaExpandButton = document.getElementById("panoramaExpandButton");
const panoramaCloseButton = document.getElementById("panoramaCloseButton");
const panoramaSyncStatus = document.getElementById("panoramaSyncStatus");
const openProjectPanoramaLink = document.getElementById("openProjectPanoramaLink");
const resetMapViewButton = document.getElementById("resetMapViewButton");
const toggleMapFullscreenButton = document.getElementById("toggleMapFullscreenButton");
const mapPointStrip = document.getElementById("mapPointStrip");

for (const descriptor of buildPointButtonDescriptors(PANORAMA_POINTS)) {
  const button = document.createElement("button");
  button.className = "map-point-button";
  button.type = "button";
  button.dataset.panoramaId = descriptor.id;
  button.title = descriptor.title;
  button.textContent = descriptor.shortLabel;
  button.setAttribute("aria-label", descriptor.label);
  button.setAttribute("aria-pressed", "false");
  mapPointStrip.append(button);
}

let selectedPoint = null;
let selectedAnchorPosition = null;

async function initializeAerialMap() {
  if (!Cesium) throw new Error("CesiumJS 本地资源未加载");
  const startedAt = performance.now();
  const [metadata, terrainBuffer] = await Promise.all([
    fetch("./assets/terrain/terrain-meta-lite.json?v=aerial-lite-20260908").then((response) => {
      if (!response.ok) throw new Error("轻量地形元数据加载失败");
      return response.json();
    }),
    fetch("./assets/terrain/terrain-grid-lite.bin?v=aerial-lite-20260908").then((response) => {
      if (!response.ok) throw new Error("轻量地形高程加载失败");
      return response.arrayBuffer();
    }),
  ]);
  const sourceHeights = new Int16Array(terrainBuffer);
  if (sourceHeights.length !== metadata.width * metadata.height) {
    throw new Error("轻量地形高程数据尺寸不匹配");
  }
  const roadModel = createRoadSurfaceModel(ROADS, BRIDGES, sourceHeights, metadata, {
    minimumElevation: WATER_BODIES[0].surfaceElevation + 6,
  });
  const heights = roadModel.heights;

  const rectangle = Cesium.Rectangle.fromDegrees(
    metadata.west, metadata.south, metadata.east, metadata.north,
  );
  const tilingScheme = new Cesium.GeographicTilingScheme({
    rectangle,
    numberOfLevelZeroTilesX: 1,
    numberOfLevelZeroTilesY: 1,
  });
  const tileSize = 33;
  const terrainMaximumLevel = 3;
  const terrainProvider = new Cesium.CustomHeightmapTerrainProvider({
    width: tileSize,
    height: tileSize,
    tilingScheme,
    credit: "地形数据：SRTM 1 Arc-Second",
    callback(x, y, level) {
      const tileRectangle = tilingScheme.tileXYToRectangle(x, y, level);
      const values = new Float32Array(tileSize * tileSize);
      for (let row = 0; row < tileSize; row += 1) {
        const latitude = Cesium.Math.toDegrees(
          Cesium.Math.lerp(tileRectangle.north, tileRectangle.south, row / (tileSize - 1)),
        );
        for (let column = 0; column < tileSize; column += 1) {
          const longitude = Cesium.Math.toDegrees(
            Cesium.Math.lerp(tileRectangle.west, tileRectangle.east, column / (tileSize - 1)),
          );
          values[row * tileSize + column] = sampleHeightGrid(
            heights, metadata, longitude, latitude,
          );
        }
      }
      return values;
    },
  });
  const requestTerrainTile = terrainProvider.requestTileGeometry.bind(terrainProvider);
  const extentMeters = Math.max(
    (metadata.north - metadata.south) * 111320,
    (metadata.east - metadata.west) * 111320
      * Math.cos(Cesium.Math.toRadians((metadata.north + metadata.south) / 2)),
  );
  terrainProvider.getLevelMaximumGeometricError = (level) =>
    level >= terrainMaximumLevel ? 0 : extentMeters / (tileSize - 1) / 2 ** level;
  terrainProvider.requestTileGeometry = async (x, y, level, request) => {
    const terrainData = await requestTerrainTile(x, y, level, request);
    if (terrainData && level >= terrainMaximumLevel) terrainData._childTileMask = 0;
    return terrainData;
  };

  const viewer = new Cesium.Viewer("cesiumContainer", {
    terrainProvider,
    baseLayer: false,
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    requestRenderMode: true,
    maximumRenderTimeChange: Number.POSITIVE_INFINITY,
  });
  const settledResolutionScale = Math.min(window.devicePixelRatio || 1, 1);
  const interactiveResolutionScale = Math.min(settledResolutionScale, 0.7);
  viewer.resolutionScale = settledResolutionScale;
  viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#061018");
  viewer.scene.skyBox.show = false;
  viewer.scene.sun.show = false;
  viewer.scene.moon.show = false;
  viewer.scene.skyAtmosphere.show = false;
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#041a31");
  viewer.scene.globe.showGroundAtmosphere = false;
  viewer.scene.globe.depthTestAgainstTerrain = true;
  const settledScreenSpaceError = 2.7;
  const interactiveScreenSpaceError = 5.4;
  viewer.scene.globe.maximumScreenSpaceError = settledScreenSpaceError;
  viewer.scene.globe.preloadAncestors = false;
  viewer.scene.globe.preloadSiblings = false;
  viewer.scene.globe.tileCacheSize = 48;
  viewer.scene.fog.enabled = true;
  viewer.scene.fog.density = 0.00017;
  viewer.scene.postProcessStages.fxaa.enabled = true;
  if (viewer.scene.msaaSupported) viewer.scene.msaaSamples = 1;

  let renderIdleTimer = 0;
  let manualRenderFrame = 0;
  function setInteractiveQuality(active) {
    const nextScale = active ? interactiveResolutionScale : settledResolutionScale;
    if (viewer.resolutionScale !== nextScale) viewer.resolutionScale = nextScale;
    viewer.scene.globe.maximumScreenSpaceError = active
      ? interactiveScreenSpaceError
      : settledScreenSpaceError;
    viewer.scene.postProcessStages.fxaa.enabled = !active;
    projectMapFrame.dataset.qualityMode = active ? "interactive" : "settled";
  }
  function pauseRenderer() {
    if (renderIdleTimer) window.clearTimeout(renderIdleTimer);
    setInteractiveQuality(false);
    if (!viewer.scene.globe.tilesLoaded) {
      viewer.scene.requestRender();
      renderIdleTimer = window.setTimeout(pauseRenderer, 250);
      return;
    }
    renderIdleTimer = 0;
    viewer.useDefaultRenderLoop = false;
    projectMapFrame.dataset.renderMode = "idle";
    viewer.resize();
    viewer.render();
  }
  function wakeRenderer(durationMs = 700) {
    if (renderIdleTimer) window.clearTimeout(renderIdleTimer);
    setInteractiveQuality(true);
    viewer.useDefaultRenderLoop = true;
    projectMapFrame.dataset.renderMode = "active";
    viewer.scene.requestRender();
    renderIdleTimer = window.setTimeout(pauseRenderer, durationMs);
  }
  function renderFrame() {
    if (viewer.useDefaultRenderLoop) {
      viewer.scene.requestRender();
      return;
    }
    if (manualRenderFrame) return;
    manualRenderFrame = window.requestAnimationFrame(() => {
      manualRenderFrame = 0;
      if (!viewer.useDefaultRenderLoop) viewer.render();
    });
  }
  viewer.scene.globe.tileLoadProgressEvent.addEventListener(() => wakeRenderer(350));
  viewer.scene.canvas.addEventListener("pointerdown", () => wakeRenderer(1200), { passive: true });
  viewer.scene.canvas.addEventListener("pointermove", (event) => {
    if (event.buttons) wakeRenderer(500);
  }, { passive: true });
  viewer.scene.canvas.addEventListener("wheel", () => wakeRenderer(800), { passive: true });
  window.addEventListener("pointerup", () => {
    if (projectMapFrame.dataset.renderMode === "active") wakeRenderer(250);
  }, { passive: true });

  const imagery = await Cesium.SingleTileImageryProvider.fromUrl(
    "./assets/terrain/terrain-shaded-lite.webp?v=aerial-lite-20260908",
    { rectangle, credit: "轻量三维地形着色图" },
  );
  viewer.imageryLayers.addImageryProvider(imagery);

  const waterEntities = WATER_BODIES.map((water) => viewer.entities.add({
    id: `landscape-water-${water.id}`,
    name: water.name,
    properties: { layer: "water", source: water.source },
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(
        Cesium.Cartesian3.fromDegreesArray(water.coordinates.flat()),
      ),
      height: water.surfaceElevation,
      heightReference: Cesium.HeightReference.NONE,
      material: Cesium.Color.fromCssColorString("#3e7f91").withAlpha(0.92),
      outline: false,
    },
  }));
  const surfaceLayers = addRoadSurfaces(Cesium, viewer, roadModel);

  const portalGround = Math.max(
    ADIT_1_PORTAL.elevation + 1,
    sampleHeightGrid(heights, metadata, ADIT_1_PORTAL.lon, ADIT_1_PORTAL.lat) + 1,
  );
  const heading = Cesium.Math.toRadians(12);
  const metersPerDegreeLatitude = 111320;
  const metersPerDegreeLongitude = metersPerDegreeLatitude
    * Math.cos(Cesium.Math.toRadians(ADIT_1_PORTAL.lat));
  const portalCorners = [
    [-16, -11], [16, -11], [16, 11], [-16, 11], [-16, -11],
  ].map(([forward, right]) => {
    const east = Math.sin(heading) * forward + Math.cos(heading) * right;
    const north = Math.cos(heading) * forward - Math.sin(heading) * right;
    return [
      ADIT_1_PORTAL.lon + east / metersPerDegreeLongitude,
      ADIT_1_PORTAL.lat + north / metersPerDegreeLatitude,
      portalGround,
    ];
  });
  const portalOutlineEntity = viewer.entities.add({
    id: "portal-outline-adit-1",
    name: "1#施工支洞洞口范围",
    properties: { layer: "portal-outline" },
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArrayHeights(portalCorners.flat()),
      width: 1.25,
      material: Cesium.Color.fromCssColorString("#a7adb2").withAlpha(0.88),
      depthFailMaterial: Cesium.Color.fromCssColorString("#70777d").withAlpha(0.55),
    },
  });

  const displayPoints = PANORAMA_POINTS.map((point) => {
    const groundHeight = sampleHeightGrid(heights, metadata, point.lon, point.lat);
    return { ...point, groundHeight, displayAlt: Math.max(point.alt, groundHeight + 90) };
  });
  const routeEntity = viewer.entities.add({
    id: "panorama-route",
    name: "无人机航拍点分布",
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArrayHeights(
        displayPoints.flatMap((point) => [point.lon, point.lat, point.displayAlt]),
      ),
      width: 3,
      material: new Cesium.PolylineGlowMaterialProperty({
        color: Cesium.Color.fromCssColorString("#35d0ff").withAlpha(0.92),
        glowPower: 0.22,
        taperPower: 0.8,
      }),
    },
  });
  const pointEntities = displayPoints.map((point, index) => viewer.entities.add({
    id: `panorama-${point.id}`,
    name: point.name,
    position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.displayAlt),
    properties: { panoramaId: point.id },
    point: {
      pixelSize: index === displayPoints.length - 1 ? 14 : 11,
      color: Cesium.Color.fromCssColorString(index === displayPoints.length - 1 ? "#ffd36a" : "#35d0ff"),
      outlineColor: Cesium.Color.fromCssColorString("#e9fbff"),
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: String(index + 1).padStart(2, "0"),
      font: "600 14px Microsoft YaHei",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.fromCssColorString("#021427"),
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -24),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  }));

  const hiddenLayers = new Set();
  const layerController = createLayerVisibilityController({
    "panorama-points": pointEntities,
    "panorama-route": [routeEntity],
    water: waterEntities,
    road: [surfaceLayers.road],
    bridge: [surfaceLayers.bridge],
    "portal-outline": [portalOutlineEntity],
  }, (layer, visible) => {
    if (visible) hiddenLayers.delete(layer);
    else hiddenLayers.add(layer);
    projectMapFrame.dataset.hiddenLayers = [...hiddenLayers].sort().join(",");
    renderFrame();
  });
  document.querySelectorAll(".legend-item[data-map-layer]").forEach((button) => {
    const layer = button.dataset.mapLayer;
    button.addEventListener("click", () => {
      const visible = layerController.toggle(layer);
      button.setAttribute("aria-pressed", String(visible));
      button.title = `点击${visible ? "隐藏" : "显示"}${button.textContent.trim()}`;
      renderFrame();
    });
  });

  const routeStart = displayPoints[0];
  const routeEnd = displayPoints.at(-1);
  const routeOverview = deriveRouteOverview(routeStart, routeEnd);
  const homeTarget = Cesium.Cartesian3.fromDegrees(
    routeStart.lon, routeStart.lat, routeStart.groundHeight + 40,
  );
  const homeOffset = new Cesium.HeadingPitchRange(
    Cesium.Math.toRadians(routeOverview.offsetHeading),
    Cesium.Math.toRadians(routeOverview.pitch),
    routeOverview.range,
  );
  viewer.camera.lookAt(homeTarget, homeOffset);
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  const homeCameraPosition = viewer.camera.positionCartographic;
  projectMapFrame.dataset.homeCameraLon = Cesium.Math.toDegrees(homeCameraPosition.longitude).toFixed(6);
  projectMapFrame.dataset.homeCameraLat = Cesium.Math.toDegrees(homeCameraPosition.latitude).toFixed(6);

  function updatePortalPosition() {
    if (spatialPanoramaPortal.dataset.open !== "true" || !selectedAnchorPosition) return;
    const anchor = Cesium.SceneTransforms.worldToWindowCoordinates(
      viewer.scene, selectedAnchorPosition, new Cesium.Cartesian2(),
    );
    if (!anchor) return;
    const placement = placeSpatialPortal(
      anchor,
      { width: spatialPanoramaPortal.offsetWidth, height: spatialPanoramaPortal.offsetHeight },
      { width: projectMapFrame.clientWidth, height: projectMapFrame.clientHeight },
    );
    spatialPanoramaPortal.style.setProperty("--portal-x", `${placement.x.toFixed(1)}px`);
    spatialPanoramaPortal.style.setProperty("--portal-y", `${placement.y.toFixed(1)}px`);
    const centerX = placement.x + spatialPanoramaPortal.offsetWidth / 2;
    const centerY = placement.y + spatialPanoramaPortal.offsetHeight / 2;
    const dx = centerX - anchor.x;
    const dy = centerY - anchor.y;
    panoramaPortalAnchor.style.left = `${anchor.x.toFixed(1)}px`;
    panoramaPortalAnchor.style.top = `${anchor.y.toFixed(1)}px`;
    panoramaPortalTether.style.left = `${anchor.x.toFixed(1)}px`;
    panoramaPortalTether.style.top = `${anchor.y.toFixed(1)}px`;
    panoramaPortalTether.style.width = `${Math.hypot(dx, dy).toFixed(1)}px`;
    panoramaPortalTether.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  }
  function openSpatialPanorama(point) {
    selectedPoint = point;
    selectedAnchorPosition = Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.displayAlt);
    panoramaPortalTitle.textContent = point.name;
    spatialPanoramaPortal.dataset.open = "true";
    spatialPanoramaPortal.dataset.expanded = "false";
    spatialPanoramaPortal.dataset.mode = "live";
    spatialPanoramaPortal.dataset.syncState = "direct";
    projectMapFrame.dataset.portalOpen = "true";
    panoramaExpandButton.textContent = "展开";
    panoramaSyncStatus.textContent = "真实720 · 已定位当前航拍点";
    spatialPanoramaIframe.src = point.panoramaUrl;
    openProjectPanoramaLink.href = point.panoramaUrl;
    renderFrame();
  }
  function closeSpatialPanorama() {
    spatialPanoramaPortal.dataset.open = "false";
    spatialPanoramaPortal.dataset.expanded = "false";
    spatialPanoramaPortal.dataset.syncState = "idle";
    projectMapFrame.dataset.portalOpen = "false";
    panoramaExpandButton.textContent = "展开";
    spatialPanoramaIframe.src = "about:blank";
    openProjectPanoramaLink.href = PANORAMA_PROJECT_URL;
  }
  function selectPoint(pointId) {
    const point = findPanoramaById(displayPoints, pointId);
    if (!point) return;
    document.querySelectorAll("[data-panorama-id]").forEach((button) => {
      const active = button.dataset.panoramaId === point.id;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    openSpatialPanorama(point);
    const target = Cesium.Cartesian3.fromDegrees(
      point.lon, point.lat, point.groundHeight + 30,
    );
    wakeRenderer(1300);
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 80), {
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(point.initialYaw ?? 315), Cesium.Math.toRadians(-48), 2500,
      ),
      duration: 0.9,
      complete: () => { updatePortalPosition(); renderFrame(); },
    });
  }

  const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  clickHandler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.position);
    const panoramaId = picked?.id?.properties?.panoramaId?.getValue(Cesium.JulianDate.now());
    if (panoramaId) selectPoint(panoramaId);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  document.querySelectorAll("[data-panorama-id]").forEach((button) => {
    button.addEventListener("click", () => selectPoint(button.dataset.panoramaId));
  });

  const mapHomeParent = projectMapFrame.parentNode;
  const mapHomeNextSibling = projectMapFrame.nextSibling;
  let fullscreenFallback = false;
  function refreshAfterFullscreen() {
    window.setTimeout(() => {
      viewer.resize();
      updatePortalPosition();
      wakeRenderer(500);
    }, 80);
  }
  function setFullscreenState(active) {
    projectMapFrame.dataset.fullscreen = String(active);
    toggleMapFullscreenButton.setAttribute("aria-pressed", String(active));
    toggleMapFullscreenButton.textContent = active ? "退出全屏" : "全屏地图";
    refreshAfterFullscreen();
  }
  function exitFallback() {
    fullscreenFallback = false;
    projectMapFrame.classList.remove("is-map-fullscreen-fallback");
    if (mapHomeNextSibling?.parentNode === mapHomeParent) {
      mapHomeParent.insertBefore(projectMapFrame, mapHomeNextSibling);
    } else {
      mapHomeParent.append(projectMapFrame);
    }
    setFullscreenState(false);
  }
  async function toggleFullscreen() {
    if (document.fullscreenElement === projectMapFrame) {
      await document.exitFullscreen();
    } else if (fullscreenFallback) {
      exitFallback();
    } else {
      try {
        await projectMapFrame.requestFullscreen();
        setFullscreenState(true);
      } catch {
        fullscreenFallback = true;
        projectMapFrame.classList.add("is-map-fullscreen-fallback");
        document.body.append(projectMapFrame);
        setFullscreenState(true);
      }
    }
  }
  document.addEventListener("fullscreenchange", () => {
    if (!fullscreenFallback) setFullscreenState(document.fullscreenElement === projectMapFrame);
  });
  resetMapViewButton.addEventListener("click", () => {
    closeSpatialPanorama();
    document.querySelectorAll("[data-panorama-id]").forEach((button) => {
      button.classList.remove("active");
      button.setAttribute("aria-pressed", "false");
    });
    wakeRenderer(1000);
    viewer.camera.lookAt(homeTarget, homeOffset);
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    renderFrame();
  });
  toggleMapFullscreenButton.addEventListener("click", toggleFullscreen);

  panoramaExpandButton.addEventListener("click", () => {
    const expanded = spatialPanoramaPortal.dataset.expanded !== "true";
    spatialPanoramaPortal.dataset.expanded = String(expanded);
    panoramaExpandButton.textContent = expanded ? "收起" : "展开";
    window.setTimeout(() => { updatePortalPosition(); renderFrame(); }, 300);
  });
  panoramaCloseButton.addEventListener("click", closeSpatialPanorama);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && spatialPanoramaPortal.dataset.open === "true") closeSpatialPanorama();
    if (event.key === "Escape" && fullscreenFallback) exitFallback();
  });
  viewer.scene.postRender.addEventListener(updatePortalPosition);
  window.addEventListener("resize", () => {
    viewer.resize();
    updatePortalPosition();
    wakeRenderer(450);
  });

  projectMapFrame.dataset.sceneMode = "aerial-context";
  projectMapFrame.dataset.homeView = "panorama-07-to-01";
  projectMapFrame.dataset.homeForwardHeading = routeOverview.offsetHeading.toFixed(2);
  projectMapFrame.dataset.terrainMaxLevel = String(terrainMaximumLevel);
  projectMapFrame.dataset.terrainGridBytes = String(terrainBuffer.byteLength);
  projectMapFrame.dataset.waterFeatureCount = String(WATER_BODIES.length);
  projectMapFrame.dataset.roadFeatureCount = String(roadModel.roads.length);
  projectMapFrame.dataset.bridgeFeatureCount = String(roadModel.bridges.length);
  projectMapFrame.dataset.portalOutlineCount = "1";
  projectMapFrame.dataset.roadSurfaceMode = "lite-meter-width-cut-fill";
  projectMapFrame.dataset.entityCount = String(viewer.entities.values.length);
  projectMapFrame.dataset.rendererProfile = "adaptive-resolution-request-render";
  projectMapFrame.dataset.hiddenLayers = "";
  projectMapFrame.dataset.loadMilliseconds = String(Math.round(performance.now() - startedAt));
  mapStatus.dataset.state = "ready";
  mapStatus.textContent = `${PANORAMA_POINTS.length}个航拍点 · 水体 / 道路 / 桥梁`;
  mapStatus.title = `${metadata.source}；高程范围 ${metadata.minimumHeight}—${metadata.maximumHeight}m；轻量显示采样`;
  wakeRenderer(2600);
}

initializeAerialMap().catch((error) => {
  mapStatus.dataset.state = "error";
  mapStatus.textContent = "三维航拍模型加载失败";
  mapStatus.title = error.message;
  console.error(error);
});
document.getElementById("openProjectPanoramaLink").href = PANORAMA_PROJECT_URL;
