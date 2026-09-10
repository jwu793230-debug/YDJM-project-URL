import { createAditAlignment, localToGeo } from "./site-layout-geometry.mjs";
export { ROADS } from "./road-network-data.mjs";

export const FEATURE_ATTRIBUTION = "总平面布置图 / OpenStreetMap contributors / 720云航拍影像校核";

export const SCENE_PALETTE = {
  water: "#738e85",
  waterLine: "#b5c3b7",
  mainRoad: "#d6cbb5",
  mountainRoad: "#b9b4a1",
  constructionRoad: "#ef8157",
  bridge: "#ff6b55",
  bridgePier: "#9fb8bf",
  site: "#62c98f",
  tunnel: "#ffd36a",
  underground: "#69e6ff",
  undergroundProjection: "#f6cf62",
  mainTunnel: "#8ea9bd",
};

export const ADIT_1_PORTAL = {
  lon: 102.21842,
  lat: 29.97755,
  elevation: 1385,
};

export const UNDERGROUND_TUNNELS = [
  {
    id: "adit-1",
    name: "1#施工支洞",
    role: "construction-scope",
    lengthMeters: 344.22,
    startElevation: 1385,
    endElevation: 1365.4,
    source: "用户施工总平面图曲线走向、施组起终高程与总长；转弯半径/方位为演示配准，断面为示意",
    coordinates: createAditAlignment(ADIT_1_PORTAL, 344.22),
  },
];

export const CONTEXT_TUNNELS = [
  {
    id: "erlangshan-main-tunnel",
    name: "二郎山主隧洞",
    role: "context-only",
    startElevation: 1365.4,
    endElevation: 1365.4,
    source: "总平面布置图1:2000相对关系示意",
    coordinates: (() => {
      const [lon, lat] = UNDERGROUND_TUNNELS[0].coordinates.at(-1);
      const join={lon,lat};
      return [localToGeo([0,-230],join,12),[lon,lat],localToGeo([0,230],join,12)];
    })(),
  },
];

export const WATER_BODIES = [
  {
    id: "luding-reservoir",
    name: "泸定水电站库区",
    source: "OpenStreetMap 877739630，720云航拍影像校核",
    surfaceElevation: 1375,
    coordinates: [
      [102.1895, 30.01995],
      [102.192, 30.0155],
      [102.1950978, 30.0105001],
      [102.1958891, 30.0090856],
      [102.1981005, 30.0070811],
      [102.200234, 30.0055365],
      [102.2028802, 30.0033984],
      [102.2062826, 30.0009839],
      [102.2080033, 29.9988608],
      [102.2092035, 29.9969142],
      [102.2096515, 29.9952544],
      [102.2096381, 29.993432],
      [102.2099867, 29.9917107],
      [102.2106734, 29.9904736],
      [102.2116953, 29.9878474],
      [102.2133704, 29.9865487],
      [102.2129828, 29.9834379],
      [102.2150776, 29.9797741],
      [102.2173186, 29.9781652],
      [102.2178121, 29.9768571],
      [102.2192538, 29.9739424],
      [102.2189292, 29.9713958],
      [102.2179717, 29.9679802],
      [102.2177249, 29.9654265],
      [102.21782, 29.965],
      [102.21085, 29.965],
      [102.2110999, 29.965],
      [102.2123525, 29.9676316],
      [102.2127521, 29.9697763],
      [102.2124812, 29.9713702],
      [102.2129559, 29.9755781],
      [102.2115585, 29.9784568],
      [102.209563, 29.9809776],
      [102.208246, 29.9827665],
      [102.2076599, 29.9850805],
      [102.2061244, 29.989901],
      [102.2058561, 29.992159],
      [102.2052781, 29.9945215],
      [102.2042656, 29.996726],
      [102.2033711, 29.998992],
      [102.2018905, 30.0006169],
      [102.2006674, 30.0017237],
      [102.1986182, 30.0025471],
      [102.1954545, 30.0049872],
      [102.192834, 30.0066607],
      [102.1910443, 30.0080706],
      [102.187, 30.0148],
      [102.183, 30.01995],
      [102.1895, 30.01995],
    ],
  },
];

export const BRIDGES = [
  {
    id: "lanan-bridge",
    name: "岚安大桥",
    source: "OpenStreetMap 877739797，720云航拍影像校核",
    widthMeters: 8,
    structure: "beam",
    coordinates: [
      [102.2015228, 30.0007673],
      [102.2033469, 30.0033462],
      [102.2034395, 30.0034368],
    ],
  },
  {
    id: "yaoshuigou-bridge",
    name: "药水沟小桥",
    source: "720云第7航拍点命名与现场关系示意",
    structure: "beam",
    deckLift: 8,
    coordinates: [
      [102.21798, 29.97764],
      [102.21826, 29.9774],
    ],
  },
];

export const SITE_ZONES = [
  { id: "village", name: "沿河村镇", lon: 102.1918, lat: 30.0088, radius: 145, kind: "context" },
  { id: "site-2", name: "2#场坪", lon: 102.21555, lat: 29.9812, radius: 90, kind: "site" },
  { id: "site-1", name: "1#场坪", lon: 102.21905, lat: 29.97675, radius: 90, kind: "site" },
  { id: "adit-1", name: "1#施工支洞", lon: ADIT_1_PORTAL.lon, lat: ADIT_1_PORTAL.lat, radius: 38, kind: "tunnel" },
];
