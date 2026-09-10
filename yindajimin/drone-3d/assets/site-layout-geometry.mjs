const M=6371000*Math.PI/180;
export function localToGeo([x,y],origin,heading=20){
 const h=heading*Math.PI/180,e=x*Math.cos(h)+y*Math.sin(h),n=-x*Math.sin(h)+y*Math.cos(h);
 return [origin.lon+e/(M*Math.cos(origin.lat*Math.PI/180)),origin.lat+n/M];
}
export function geoToLocal([lon,lat],origin,heading=20){
 const h=heading*Math.PI/180,e=(lon-origin.lon)*M*Math.cos(origin.lat*Math.PI/180),n=(lat-origin.lat)*M;
 return [e*Math.cos(h)-n*Math.sin(h),e*Math.sin(h)+n*Math.cos(h)];
}
export function createAditAlignment(origin,length=344.22){
 // Plan-view shape traced from the supplied layout: entry straight, right bend,
 // long oblique connection. Radius/azimuth are illustrative, not survey control.
 const p=[[0,0],[0,13]],r=55,a=55*Math.PI/180,straight=70,tail=length-straight-r*a;
 for(let y=19;y<straight;y+=6)p.push([0,y]);p.push([0,straight]);
 for(let i=1;i<=16;i++){const t=a*i/16;p.push([r*(1-Math.cos(t)),straight+r*Math.sin(t)]);}
 const corner=p.at(-1);
 for(let i=1,n=Math.ceil(tail/6);i<=n;i++)p.push([corner[0]+tail*i/n*Math.sin(a),corner[1]+tail*i/n*Math.cos(a)]);
 const measure=points=>points.slice(1).reduce((s,b,i)=>{const a=points[i],la=(b[1]-a[1])*Math.PI/180,lo=(b[0]-a[0])*Math.PI/180;const h=Math.sin(la/2)**2+Math.cos(a[1]*Math.PI/180)*Math.cos(b[1]*Math.PI/180)*Math.sin(lo/2)**2;return s+6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));},0);
 const initial=p.map(q=>localToGeo(q,origin));const scale=length/measure(initial);
 return p.map(([x,y])=>localToGeo([x*scale,y*scale],origin));
}
export function insidePolygon([x,y],poly){
 let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
 const a=poly[i],b=poly[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;
}
export function platformAt(lon,lat,platforms){return platforms.find(p=>insidePolygon([lon,lat],p.coordinates));}
function distanceToPlatform(lon,lat,platform){
 if(insidePolygon([lon,lat],platform.coordinates))return 0;
 const mx=M*Math.cos(lat*Math.PI/180),poly=platform.coordinates;
 let distance=Infinity;
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],dx=(b[0]-a[0])*mx,dy=(b[1]-a[1])*M;
  const x=(lon-a[0])*mx,y=(lat-a[1])*M,t=Math.max(0,Math.min(1,(x*dx+y*dy)/(dx*dx+dy*dy||1)));
  distance=Math.min(distance,Math.hypot(x-t*dx,y-t*dy));
 }return distance;
}

export function gradePlatformRoadProfile(profile,platforms){
 const result=profile.map(p=>p.slice()),distance=[0];
 for(let i=1;i<profile.length;i++){
  const a=profile[i-1],b=profile[i];
  distance.push(distance[i-1]+Math.hypot((b[0]-a[0])*M*Math.cos(a[1]*Math.PI/180),(b[1]-a[1])*M));
 }
 for(const platform of platforms){
  const within=profile.map(p=>distanceToPlatform(p[0],p[1],platform)<=9);
  for(let first=0;first<profile.length;first++){
   if(!within[first])continue;
   let last=first;while(last+1<profile.length&&within[last+1])last++;
   const z=platform.elevation+.16;
   for(let i=first;i<=last;i++)result[i][2]=z;
   // Ease over a meaningful length of road, rather than switching back to raw
   // SRTM at the polygon edge. These approach grades remain display assumptions.
   for(const [edge,step] of [[first,-1],[last,1]]){
    let end=edge;
    while(end+step>=0&&end+step<profile.length&&Math.abs(distance[end]-distance[edge])<220)end+=step;
    const length=Math.abs(distance[end]-distance[edge]);if(!length)continue;
    const far=profile[end][2];
    for(let i=edge+step;i!==end+step;i+=step){
     if(within[i])break;
     const u=Math.abs(distance[i]-distance[edge])/length,t=u*u*(3-2*u);
     result[i][2]=z+(far-z)*t;
    }
   }
   first=last;
  }
 }
 return result;
}
export function gradePlatforms(original,meta,platforms){
 const result=Float32Array.from(original),{west,east,south,north,width,height}=meta;
 for(const platform of platforms){
  const poly=platform.coordinates,xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]);
  const mx=M*Math.cos((north+south)*Math.PI/360),blend=30;
  const x0=Math.max(0,Math.floor((Math.min(...xs)-blend/mx-west)/(east-west)*(width-1)));
  const x1=Math.min(width-1,Math.ceil((Math.max(...xs)+blend/mx-west)/(east-west)*(width-1)));
  const y0=Math.max(0,Math.floor((north-Math.max(...ys)-blend/M)/(north-south)*(height-1)));
  const y1=Math.min(height-1,Math.ceil((north-Math.min(...ys)+blend/M)/(north-south)*(height-1)));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const lon=west+x/(width-1)*(east-west),lat=north-y/(height-1)*(north-south);
   let d=Infinity;
   for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],vx=(b[0]-a[0])*mx,vy=(b[1]-a[1])*M,px=(lon-a[0])*mx,py=(lat-a[1])*M;
    const t=Math.max(0,Math.min(1,(px*vx+py*vy)/(vx*vx+vy*vy||1)));d=Math.min(d,Math.hypot(px-t*vx,py-t*vy));
   }
   const within=insidePolygon([lon,lat],poly);if(!within&&d>blend)continue;
   const u=within?0:Math.max(0,Math.min(1,(d-10)/(blend-10))),alpha=u*u*(3-2*u),index=y*width+x;
   result[index]=(platform.elevation-0.8)*(1-alpha)+result[index]*alpha;
  }
 }
 return result;
}
