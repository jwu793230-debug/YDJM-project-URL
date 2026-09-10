import { buildElevatedSurfacePath, sampleHeightGrid } from './map-core.mjs';

const metersLat = 111320;
const metersLon = lat => metersLat * Math.cos(lat * Math.PI / 180);
const distance = (a,b) => Math.hypot((a[0]-b[0])*metersLon((a[1]+b[1])/2),(a[1]-b[1])*metersLat);

// A road has a horizontal cross-section, not a stripe draped over a cliff.
export function roadEdges(profile, width) {
  const left=[],right=[];
  profile.forEach((p,i)=>{
    const a=profile[Math.max(0,i-1)], b=profile[Math.min(profile.length-1,i+1)];
    const mx=metersLon(p[1]),dx=(b[0]-a[0])*mx,dy=(b[1]-a[1])*metersLat;
    const length=Math.hypot(dx,dy)||1;
    const x=-dy/length*width/2/mx, y=dx/length*width/2/metersLat;
    left.push([p[0]+x,p[1]+y,p[2]]);
    right.push([p[0]-x,p[1]-y,p[2]]);
  });
  return {left,right};
}

// Keeps the source SRTM untouched. Only the narrow road corridor is cut/filled.
// Elevation and width remain demonstration assumptions pending survey control.
export function createRoadSurfaceModel(roads, bridges, originalHeights, metadata, options={}) {
  const floor=options.minimumElevation??-Infinity;
  const rawSurface=(lon,lat)=>{
    const z=Math.max(floor,sampleHeightGrid(originalHeights,metadata,lon,lat)+2.4);
    return options.surfaceTransform?.(lon,lat,z)??z;
  };
  const key=p=>`${p[0].toFixed(9)},${p[1].toFixed(9)}`;
  const overrides=new Map(),approaches=new Set();
  const bridgeEnds=new Set(bridges.flatMap(b=>[key(b.coordinates[0]),key(b.coordinates.at(-1))]));
  for(const road of roads) {
    const a=road.coordinates[0],b=road.coordinates.at(-1);
    const length=road.coordinates.slice(1).reduce((s,p,i)=>s+distance(road.coordinates[i],p),0);
    if(length>40||length===0)continue;
    const bridgeIndex=bridgeEnds.has(key(a))?0:bridgeEnds.has(key(b))?1:-1;
    if(bridgeIndex<0)continue;
    const end=bridgeIndex===0?a:b,outer=bridgeIndex===0?b:a;
    const base=rawSurface(...outer),rise=length*0.12;
    overrides.set(key(end),Math.max(base-rise,Math.min(base+rise,rawSurface(...end))));
    approaches.add(road.id);
  }
  const surface=(lon,lat)=>overrides.get(key([lon,lat]))??rawSurface(lon,lat);
  const modeledRoads=roads.map(road=>{
    const width=road.widthMeters??8;
    let profile=buildElevatedSurfacePath(road.coordinates,surface,0,6);
    if(approaches.has(road.id)) {
      // Short bridge approaches are graded continuously; coarse SRTM must not
      // create an 11 m drop over a 16 m connection. 12% is a demo slope cap,
      // not a claim about the as-built road gradient.
      const distances=[0];
      for(let i=1;i<profile.length;i++)distances.push(distances[i-1]+distance(profile[i-1],profile[i]));
      const start=profile[0][2],end=profile.at(-1)[2];
      profile.forEach((p,i)=>p[2]=start+(end-start)*distances[i]/distances.at(-1));
    }
    profile=options.profileTransform?.(profile,road)??profile;
    return {...road,widthMeters:width,profile,...roadEdges(profile,width)};
  });
  const modeledBridges=bridges.map(bridge=>{
    const width=bridge.widthMeters??8;
    const profile=buildElevatedSurfacePath(bridge.coordinates,()=>0,0,6);
    const cumulative=[0];
    for(let i=1;i<profile.length;i++) cumulative.push(cumulative[i-1]+distance(profile[i-1],profile[i]));
    const start=surface(...bridge.coordinates[0]),end=surface(...bridge.coordinates.at(-1));
    profile.forEach((p,i)=>p[2]=start+(end-start)*cumulative[i]/(cumulative.at(-1)||1));
    // Both ends use the exact same sampled datum as adjoining roads.
    profile[0][2]=start;profile.at(-1)[2]=end;
    return {...bridge,widthMeters:width,profile,...roadEdges(profile,width)};
  });
  const heights=Float32Array.from(originalHeights);
  const nearest=new Float32Array(heights.length).fill(Infinity);
  const {west,east,south,north,width,height}=metadata;
  const mx=metersLon((north+south)/2),dx=(east-west)/(width-1),dy=(north-south)/(height-1);
  let modifiedCells=0;
  for(const road of modeledRoads) {
    if(road.isTunnel)continue;
    const flat=road.widthMeters/2+3, radius=flat+10;
    for(let i=1;i<road.profile.length;i++) {
      const a=road.profile[i-1],b=road.profile[i];
      const vx=(b[0]-a[0])*mx,vy=(b[1]-a[1])*metersLat,l2=vx*vx+vy*vy;
      const x0=Math.max(0,Math.floor((Math.min(a[0],b[0])-radius/mx-west)/dx));
      const x1=Math.min(width-1,Math.ceil((Math.max(a[0],b[0])+radius/mx-west)/dx));
      const y0=Math.max(0,Math.floor((north-Math.max(a[1],b[1])-radius/metersLat)/dy));
      const y1=Math.min(height-1,Math.ceil((north-Math.min(a[1],b[1])+radius/metersLat)/dy));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) {
        const px=(west+x*dx-a[0])*mx,py=(north-y*dy-a[1])*metersLat;
        const t=Math.max(0,Math.min(1,l2?(px*vx+py*vy)/l2:0));
        const d=Math.hypot(px-vx*t,py-vy*t),j=y*width+x;
        if(d>radius||d>=nearest[j])continue;
        if(nearest[j]===Infinity)modifiedCells++;
        nearest[j]=d;
        const u=Math.max(0,Math.min(1,(d-flat)/(radius-flat)));
        const blend=u*u*(3-2*u),bed=a[2]+(b[2]-a[2])*t-1.1;
        heights[j]=bed*(1-blend)+originalHeights[j]*blend;
      }
    }
  }
  // Bilinear cells can still protrude through the inside edge of a tight bend.
  // Cut the four supporting grid corners to the deck's underside, including
  // shoulders; this also resolves competing nearest-segment heights at junctions.
  for(const road of modeledRoads) {
    if(road.isTunnel)continue;
    const shoulders=roadEdges(road.profile,road.widthMeters+3);
    for(const p of [...road.left,...road.right,...shoulders.left,...shoulders.right]) {
      const x=Math.max(0,Math.min(width-1,(p[0]-west)/dx));
      const y=Math.max(0,Math.min(height-1,(north-p[1])/dy));
      for(const cx of [Math.floor(x),Math.ceil(x)])for(const cy of [Math.floor(y),Math.ceil(y)]) {
        const j=cy*width+cx;
        heights[j]=Math.min(heights[j],p[2]-1.3);
      }
    }
  }
  return {roads:modeledRoads,bridges:modeledBridges,heights,modifiedCells};
}
