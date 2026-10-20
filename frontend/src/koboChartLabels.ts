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
