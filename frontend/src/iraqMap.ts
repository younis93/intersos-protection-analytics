export type Coordinate = [number, number];
export type MapGeometry = {type:"Polygon"|"MultiPolygon";coordinates:any};
export type MapFeature = {properties?:{shapeName?:string};geometry:MapGeometry};
export type ProjectedShape = {name:string;path:string;label:[number,number]};

const LABEL_OFFSETS:Record<string,[number,number]>={
  Babil:[5,13],"Salah al-Din":[-8,-8],
  Kirkuk:[-9,-7],"Al-Sulaimaniyah":[17,4],
};

export function geometryRings(geometry:MapGeometry):Coordinate[][] {
  if(geometry.type==="Polygon")return geometry.coordinates as Coordinate[][];
  return (geometry.coordinates as Coordinate[][][]).flat();
}

export function projectGovernorates(features:MapFeature[],width=760,height=700,padding=28):ProjectedShape[] {
  const all=features.flatMap((feature)=>geometryRings(feature.geometry).flat());
  if(!all.length)return [];
  const meanLat=all.reduce((sum,point)=>sum+point[1],0)/all.length;
  const longitudeScale=Math.cos(meanLat*Math.PI/180);
  const xs=all.map((point)=>point[0]*longitudeScale),ys=all.map((point)=>point[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const scale=Math.min((width-padding*2)/Math.max(maxX-minX,.001),(height-padding*2)/Math.max(maxY-minY,.001));
  const drawnWidth=(maxX-minX)*scale,drawnHeight=(maxY-minY)*scale;
  const offsetX=(width-drawnWidth)/2,offsetY=(height-drawnHeight)/2;
  const project=([longitude,latitude]:Coordinate):Coordinate=>[
    offsetX+(longitude*longitudeScale-minX)*scale,
    height-offsetY-(latitude-minY)*scale,
  ];
  return features.map((feature)=>{
    const rings=geometryRings(feature.geometry),projected=rings.map((ring)=>ring.map(project));
    const path=projected.map((ring)=>ring.map((point,index)=>`${index?"L":"M"}${point[0].toFixed(2)},${point[1].toFixed(2)}`).join(" ")+" Z").join(" ");
    const outer=projected.reduce((largest,ring)=>ring.length>largest.length?ring:largest,projected[0]||[]);
    const centroid=polygonCentroid(outer),name=String(feature.properties?.shapeName||"");
    const adjustment=LABEL_OFFSETS[name]||[0,0];
    return {name,path,label:[centroid[0]+adjustment[0],centroid[1]+adjustment[1]]};
  });
}

export function polygonCentroid(points:Coordinate[]):Coordinate {
  if(points.length<3)return points[0]||[0,0];
  let area=0,x=0,y=0;
  for(let index=0;index<points.length;index++){
    const current=points[index],next=points[(index+1)%points.length],cross=current[0]*next[1]-next[0]*current[1];
    area+=cross;x+=(current[0]+next[0])*cross;y+=(current[1]+next[1])*cross;
  }
  if(Math.abs(area)<.0001){
    const xs=points.map((point)=>point[0]),ys=points.map((point)=>point[1]);
    return[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];
  }
  return[x/(3*area),y/(3*area)];
}

export function mapIntensity(count:number,max:number):number {
  if(count<=0||max<=0)return 0;
  return Math.max(1,Math.min(5,Math.ceil(Math.sqrt(count/max)*5)));
}
