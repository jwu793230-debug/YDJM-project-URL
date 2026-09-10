import { roadEdges } from './road-surface.mjs';

// Meter-scale decks, shoulders and slab sides. No screen-space road stripes.
export function addRoadSurfaces(Cesium,viewer,model) {
  const layers={road:new Cesium.PrimitiveCollection(),bridge:new Cesium.PrimitiveCollection()};
  Object.values(layers).forEach(layer=>viewer.scene.primitives.add(layer));
  function ribbon(profile,width,color,id,collection,offset=0,thickness=0) {
    const {left,right}=roadEdges(profile,width),vertices=[],indices=[];
    for(let i=0;i<left.length;i++) {
      for(const [p,dz] of [[left[i],offset],[right[i],offset],[left[i],offset-thickness],[right[i],offset-thickness]]) {
        const v=Cesium.Cartesian3.fromDegrees(p[0],p[1],p[2]+dz);vertices.push(v.x,v.y,v.z);
      }
      if(i===0)continue;
      const a=(i-1)*4,b=i*4;
      indices.push(a,a+1,b,a+1,b+1,b);
      if(thickness>0)indices.push(a,b,a+2,a+2,b,b+2,a+1,a+3,b+1,a+3,b+3,b+1);
    }
    const values=new Float64Array(vertices);
    collection.add(new Cesium.Primitive({
      geometryInstances:new Cesium.GeometryInstance({id,geometry:new Cesium.Geometry({
        attributes:{position:new Cesium.GeometryAttribute({componentDatatype:Cesium.ComponentDatatype.DOUBLE,componentsPerAttribute:3,values})},
        indices:Cesium.IndexDatatype.createTypedArray(vertices.length/3,indices),
        primitiveType:Cesium.PrimitiveType.TRIANGLES,boundingSphere:Cesium.BoundingSphere.fromVertices(values)
      }),attributes:{color:Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString(color))}}),
      appearance:new Cesium.PerInstanceColorAppearance({flat:true,translucent:false,closed:false,renderState:{depthTest:{enabled:true},cull:{enabled:false}}}),
      asynchronous:false,allowPicking:false
    }));
  }
  for(const road of model.roads) {
    if(road.isTunnel)continue; // Context road tunnel stays underground, never drawn across a hillside.
    ribbon(road.profile,road.widthMeters+3,'#8f8b76',`road-bed-${road.id}`,layers.road,-0.14,1.1);
    ribbon(road.profile,road.widthMeters,road.category==='main'?'#a2a49a':'#b9b39b',`road-deck-${road.id}`,layers.road,0.02);
  }
  for(const bridge of model.bridges) {
    ribbon(bridge.profile,bridge.widthMeters+1.2,'#b8b8a9',`bridge-bed-${bridge.id}`,layers.bridge,0,1.2);
    ribbon(bridge.profile,bridge.widthMeters-0.9,'#a2a49a',`bridge-deck-${bridge.id}`,layers.bridge,0.04);
    for(const [i,edge] of [bridge.left,bridge.right].entries()) {
      ribbon(edge,0.48,'#d1cdb9',`bridge-parapet-${bridge.id}-${i}`,layers.bridge,0.85,0.95);
    }
  }
  return layers;
}
