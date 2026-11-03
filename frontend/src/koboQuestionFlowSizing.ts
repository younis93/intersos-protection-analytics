/** Group titles use the same width, font and line height in ELK and the cards. */
export function flowGroupCardHeight(label:string,measure:(text:string)=>number=text=>[...text].length*8){
 const available=260;
 let lines=1,line='';
 for(const word of label.trim().split(/\s+/)){
  const candidate=line?`${line} ${word}`:word;
  if(measure(candidate)<=available){line=candidate;continue}
  if(line)lines++;
  line='';
  for(const character of word){if(line&&measure(line+character)>available){lines++;line=''}line+=character}
 }
 return Math.max(140,96+lines*20);
}
