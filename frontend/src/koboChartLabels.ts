// Bound display captions only. Original category values remain intact for hover and pivots.
export function chartCaption(value:string,characters:number,maxLines=4){
 const limit=Math.max(4,Math.floor(characters)),lines:string[]=[];let current='';
 for(const word of value.trim().split(/\s+/u)){
  const letters=Array.from(word);
  if(current&&Array.from(current).length+letters.length+1>limit){lines.push(current);current=''}
  while(letters.length>limit){if(current){lines.push(current);current=''}lines.push(letters.splice(0,limit).join(''))}
  const rest=letters.join('');if(rest)current=current?`${current} ${rest}`:rest;
 }
 if(current)lines.push(current);
 const shown=lines.slice(0,maxLines);if(lines.length>maxLines)shown[maxLines-1]=Array.from(shown[maxLines-1]).slice(0,limit-1).join('')+'…';
 const escape=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 return shown.map(escape).join('<br>');
}

export function barCategoryGutter(captions:string[],fontSize:number,maximum:number){
 let longestLine=0;
 for(const caption of captions)for(const line of caption.split('<br>')){
  longestLine=Math.max(longestLine,Array.from(line.replace(/&(?:amp|lt|gt);/g,'&')).length);
 }
 return Math.min(maximum,Math.max(32,Math.ceil(longestLine*fontSize*.6+24)));
}

export function categoryCaption(value:string,characters:number,lines:number,mode:'wrap'|'truncate'|'rotate',horizontal=false){
 if(mode==='wrap'||(horizontal&&mode==='rotate'))return chartCaption(value,characters,lines);
 const text=Array.from(value.trim().replace(/\s+/g,' '));
 const limit=mode==='rotate'?40:Math.max(4,Math.floor(characters));
 const caption=text.length>limit?text.slice(0,limit-1).join('')+'…':text.join('');
 return chartCaption(caption,limit,1);
}

export function rotatedCategoryDepth(captions:string[],font:number){
 return Math.max(0,...captions.map(caption=>Array.from(caption.replace(/&(?:amp|lt|gt);/g,'&')).length))*font*.45;
}
