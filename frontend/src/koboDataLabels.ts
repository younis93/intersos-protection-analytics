/** Contrast against the actual series fill, rather than the page theme. */
export function labelInk(color:string){
 const hex=color.replace('#','');
 const full=hex.length===3?hex.split('').map(part=>part+part).join(''):hex;
 if(!/^[\da-f]{6}$/i.test(full))return '#ffffff';
 const channels=[0,2,4].map(index=>parseInt(full.slice(index,index+2),16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
 const luminance=channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
 const darkLuminance=[8,24,39].map(value=>value/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
 return (luminance+.05)/(darkLuminance+.05)>=1.05/(luminance+.05)?'#081827':'#ffffff';
}
export function barValueLabel(text:string,value:number,maximum:number,extent:number,thickness:number,font:number,horizontal:boolean,stacked:boolean){
 const length=maximum>0?value/maximum*extent:0;
 const fits=horizontal?length>=text.length*font*.64+16&&thickness>=font*1.3:length>=font*1.7&&thickness>=text.length*font*.64+10;
 return {text:stacked&&!fits?'':text,position:fits||stacked?'inside' as const:'outside' as const};
}
