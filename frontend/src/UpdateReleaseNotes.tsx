import {Check,Download} from 'lucide-react';
import './updateReleaseNotes.css';

export const formatUpdateSize=(bytes?:number)=>`${((bytes||0)/1_000_000).toFixed(1)} MB`;

export function parseReleaseNotes(notes:string){
  return notes.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!/^#{1,6}\s/.test(line)).map(line=>{
    const content=line.replace(/^(?:\d+[.)]|[-*])\s+/, '').replace(/\*\*/g,'');
    const separator=content.indexOf(': ');
    return separator>0?{title:content.slice(0,separator),description:content.slice(separator+2)}:{title:'',description:content};
  });
}

export function UpdateReleaseNotes({notes,sizeBytes}:{notes?:string;sizeBytes?:number}){
  const items=parseReleaseNotes(notes||'A new signed version of Iraq Data Analysis is ready to install.');
  return <section className="update-release-notes" aria-label="Release notes">
    <header><h3>What’s new</h3>{typeof sizeBytes==='number'&&<span className="update-download-size"><Download aria-hidden="true"/>{(sizeBytes/1_000_000).toFixed(1)} MB</span>}</header>
    <ul>{items.map((item,index)=><li key={index}><span className="release-note-check" aria-hidden="true"><Check/></span><div>{item.title&&<h4>{item.title}</h4>}<p>{item.description}</p></div></li>)}</ul>
  </section>;
}
