export const ABILITY_ICONS=[
  {color:'#ffd18a',rows:['.######.','########','##....##','##.##.##','##.##.##','.##..##.','..####..','...##...']},
  {color:'#dea0ff',rows:['...##...','..#..#..','.#.##.#.','#.#..#.#','#.#..#.#','.#.##.#.','..#..#..','...##...']},
  {color:'#92e8ef',rows:['....##..','.....##.','.##...##','...#####','...#####','###...##','.....##.','....##..']},
  {color:'#b9b2ff',rows:['#..##..#','##.##.##','.######.','..####..','...###..','..####..','....##..','...##...']},
] as const;

export function abilityPixels(index:number,draw:(x:number,y:number)=>void){
  ABILITY_ICONS[index].rows.forEach((row,y)=>{
    for(let x=0;x<row.length;x++)if(row[x]==='#')draw(x,y);
  });
}
