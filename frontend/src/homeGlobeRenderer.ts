// Natural Earth 1:110m land is public domain. The bundled SVG is the only
// texture input; no map services or animation dependencies are used at runtime.
const landUrl = new URL('./assets/home-globe-land.svg', import.meta.url).href;

interface GlobeMap {width:number;height:number;land:Uint8Array}
let pendingMap:Promise<GlobeMap>|undefined;

export function loadGlobeMap():Promise<GlobeMap>{
  if(pendingMap)return pendingMap;
  pendingMap=(async()=>{
    const image=new Image();
    image.src=landUrl;
    await image.decode();
    const texture=document.createElement('canvas');
    texture.width=1024;texture.height=512;
    const context=texture.getContext('2d',{willReadFrequently:true});
    if(!context)throw new Error('Canvas is unavailable');
    context.drawImage(image,0,0,texture.width,texture.height);
    const rgba=context.getImageData(0,0,texture.width,texture.height).data;
    const land=new Uint8Array(texture.width*texture.height);
    for(let pixel=0;pixel<land.length;pixel++)land[pixel]=rgba[pixel*4+3];
    return {width:texture.width,height:texture.height,land};
  })().catch(error=>{pendingMap=undefined;throw error});
  return pendingMap;
}

/** Raycast a small textured sphere, with all geometry prepared once per turn. */
export function createGlobeRenderer(canvas:HTMLCanvasElement,map:GlobeMap){
  const context=canvas.getContext('2d');
  if(!context)throw new Error('Canvas is unavailable');
  const pixelRatio=Math.min(window.devicePixelRatio||1,3);
  const width=Math.max(96,Math.min(256,Math.round(canvas.clientWidth*pixelRatio)));
  // Match the slightly elliptical globe in the original INTERSOS artwork.
  const height=Math.round(width*745/711);
  canvas.width=width;canvas.height=height;
  const frame=context.createImageData(width,height);
  const offsets:number[]=[],longitudes:number[]=[],rows:number[]=[],fractions:number[]=[],lights:number[]=[],edges:number[]=[];
  const tilt=15*Math.PI/180,heading=20*Math.PI/180;
  const sinTilt=Math.sin(tilt),cosTilt=Math.cos(tilt);
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      const nx=(x+.5-width/2)/(width/2),ny=-(y+.5-height/2)/(height/2);
      const radius=Math.hypot(nx,ny);
      if(radius>=1)continue;
      const nz=Math.sqrt(1-radius*radius);
      const latitude=Math.asin(ny*cosTilt+nz*sinTilt);
      const longitude=Math.atan2(nx,nz*cosTilt-ny*sinTilt)+heading;
      const v=Math.max(0,Math.min(map.height-1,(.5-latitude/Math.PI)*map.height));
      offsets.push((y*width+x)*4);
      longitudes.push((.5+longitude/(Math.PI*2))*map.width);
      rows.push(Math.floor(v)*map.width);
      fractions.push(v-Math.floor(v));
      lights.push(.84+.14*nz-.065*nx+.035*ny);
      edges.push(Math.min(1,(1-radius)*Math.min(width,height)/2));
    }
  }
  const pixelOffsets=Int32Array.from(offsets),u=Float32Array.from(longitudes),row=Int32Array.from(rows),fy=Float32Array.from(fractions),light=Float32Array.from(lights),edge=Float32Array.from(edges);
  return (angle:number)=>{
    const shift=angle/(Math.PI*2)*map.width;
    for(let pixel=0;pixel<pixelOffsets.length;pixel++){
      const longitude=((u[pixel]+shift)%map.width+map.width)%map.width;
      const x=Math.floor(longitude),nextX=(x+1)%map.width,fx=longitude-x;
      const top=row[pixel],bottom=Math.min(top+map.width,(map.height-1)*map.width);
      const north=map.land[top+x]*(1-fx)+map.land[top+nextX]*fx;
      const south=map.land[bottom+x]*(1-fx)+map.land[bottom+nextX]*fx;
      const land=(north*(1-fy[pixel])+south*fy[pixel])/255;
      const offset=pixelOffsets[pixel],shade=light[pixel];
      frame.data[offset]=39*shade;
      frame.data[offset+1]=146*shade;
      frame.data[offset+2]=210*shade;
      frame.data[offset+3]=255*(1-land)*edge[pixel];
    }
    context.putImageData(frame,0,0);
  };
}
