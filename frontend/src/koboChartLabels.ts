// Bound display captions only. Original category values remain intact for hover and pivots.
export function chartTickIndices(count:number,availableWidth:number,font:number){
 const capacity=Math.max(1,Math.floor(availableWidth/Math.max(40,font*4)));
 const stride=count<=5?1:Math.max(1,Math.ceil(count/capacity));
 return Array.from({length:Math.ceil(count/stride)},(_,index)=>index*stride);
}

export function columnLabelSlot(labels:string[],font:number,mode:'wrap'|'truncate'|'rotate'){
 if(mode!=='wrap')return 0;
 let longest=0;
 for(const label of labels)for(const word of label.split(/\s+/u))longest=Math.max(longest,Array.from(word).length);
 return Math.min(480,longest*font*.67+16);
}

export function chartCaption(value:string,characters:number,maxLines=4,preferSeparators=false,keepWords=false){
 const limit=Math.max(4,Math.floor(characters)),lines:string[]=[];let current='';
 for(const word of value.trim().split(/\s+/u)){
  const letters=Array.from(word);
  if(current&&Array.from(current).length+letters.length+1>limit){lines.push(current);current=''}
  while(!keepWords&&letters.length>limit){
   if(current){lines.push(current);current=''}
   const prefix=preferSeparators?letters.slice(0,limit):[];
   const separator=Math.max(prefix.lastIndexOf('/'),prefix.lastIndexOf('-'));
   lines.push(letters.splice(0,separator>0?separator+1:limit).join(''));
  }
  const rest=letters.join('');if(rest)current=current?`${current} ${rest}`:rest;
 }
 if(current)lines.push(current);
 const shown=lines.slice(0,maxLines);if(lines.length>maxLines)shown[maxLines-1]=(keepWords?shown[maxLines-1]:Array.from(shown[maxLines-1]).slice(0,limit-1).join(''))+'…';
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

export function categoryCaption(value:string,characters:number,lines:number,mode:'wrap'|'truncate'|'rotate',horizontal=false,keepWords=false){
 if(mode==='wrap'||(horizontal&&mode==='rotate'))return chartCaption(value,characters,lines,true,keepWords);
 const text=Array.from(value.trim().replace(/\s+/g,' '));
 const limit=mode==='rotate'?40:Math.max(4,Math.floor(characters));
 const caption=text.length>limit?text.slice(0,limit-1).join('')+'…':text.join('');
 return chartCaption(caption,limit,1);
}

export function rotatedCategoryDepth(captions:string[],font:number){
 return Math.max(0,...captions.map(caption=>Array.from(caption.replace(/&(?:amp|lt|gt);/g,'&')).length))*font*.45;
}

export function fixedColumnCaptions(labels:string[],width:number,font:number,mode:Parameters<typeof categoryCaption>[3],maxLines:number){
 const slot=Math.max(1,width)/Math.max(1,labels.length);
 const wordSlot=columnLabelSlot(labels,font,mode);
 const targetSlot=Math.max(font*(mode==='rotate'?1.7:2.5),Math.min(wordSlot,width));
 const lanes=Math.max(1,Math.min(12,labels.length,Math.ceil(targetSlot/slot)));
 const laneWidth=slot*lanes;
 const characters=Math.min(32,(laneWidth-10)/(font*.67));
 const captions=labels.map(label=>categoryCaption(label,characters,maxLines,mode,false,wordSlot<=laneWidth+font*.67));
 const tallest=Math.max(1,...captions.map(caption=>caption.split('<br>').length));
 // Space adjacent captions onto separate rows without moving their tick or bar.
 const staggered=captions.map((caption,index)=>'<br>'.repeat(index%lanes*tallest)+caption);
 const depth=mode==='rotate'?rotatedCategoryDepth(captions,font)+(lanes-1)*font*1.3:tallest*lanes*font*1.3;
 return {captions:staggered,depth};
}

export const fixedSideLegendWidth=(width:number)=>Math.min(width*.35,240);

export function fittedLegendLabel(label:string,fixedWidth:boolean,width:number,font:number,side:boolean){
 if(!fixedWidth)return label;
 const available=side?fixedSideLegendWidth(width):Math.max(80,width-80);
 return chartCaption(label,(available-36)/(font*.65),Infinity,false,true);
}

export function fittedLegendHeight(labels:string[],width:number,font:number){
 let used=0,rowHeight=0,height=0;
 for(const label of labels){
  const lines=label.split('<br>');
  const longest=Math.max(...lines.map(line=>Array.from(line.replace(/&(?:amp|lt|gt);/g,'&')).length));
  const entryWidth=Math.min(width,longest*font*.65+44);
  if(used&&used+entryWidth>width){height+=rowHeight;used=0;rowHeight=0}
  used+=entryWidth;
  rowHeight=Math.max(rowHeight,lines.length*font*1.3+10);
 }
 return Math.ceil(height+rowHeight);
}
