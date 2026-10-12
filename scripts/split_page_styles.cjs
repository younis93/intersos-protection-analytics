// One-time conservative extraction: shared and ambiguous selectors stay global.
const fs=require('node:fs'),path=require('node:path'),postcss=require('../frontend/node_modules/postcss');
const root=path.resolve(__dirname,'..'),source=path.join(root,'frontend/src/styles.css');
const sheet=postcss.parse(fs.readFileSync(process.argv[2]||source,'utf8'));
const owners={workspace:/\.(?:legal-shell|legal-sidebar|legal-toolbar|legal-upload)/,studio:/\.(?:studio-|legal-analytics-studio)/,indicators:/\.indicator-/,detention:/\.detention-/};
const output=Object.fromEntries(Object.keys(owners).map(key=>[key,postcss.root()]));
const allowed={studio:['Studio.tsx','LegalStudioPage.tsx'],indicators:['LegalIndicatorsPage.tsx'],detention:['LegalDetentionPage.tsx'],lawyers:['LegalLawyersPage.tsx'],overview:['LegalOverviewPage.tsx'],deportation:['LegalDeportationPage.tsx']};
const sources=fs.readdirSync(path.join(root,'frontend/src')).filter(name=>name.endsWith('.tsx')&&!name.includes('.test.')).map(name=>({name,text:fs.readFileSync(path.join(root,'frontend/src',name),'utf8')}));
function owner(rule){
 if(rule.selector.includes(':root')||rule.selector.includes(':is(')||rule.selector.includes(':where('))return;
 // Group variants share an element and specificity with the global base group.
 if(rule.selector.includes('.indicator-group-'))return;
 const selectors=rule.selectors;
 const found=Object.entries(owners).filter(([,match])=>selectors.every(selector=>match.test(selector)));
 if(found.length!==1)return;
 const [key,match]=found[0];
 // Generic descendants can tie later shared rules in specificity. Keep their
 // original position in the global cascade instead of reordering them.
 if(!selectors.every(selector=>match.test(selector.split(/[\s>+~]+/).at(-1))))return;
 const names=[...rule.selector.matchAll(/\.([\w-]+)/g)].map(item=>item[1]).filter(name=>match.test('.'+name));
 if(key!=='workspace'&&names.some(name=>sources.some(source=>!allowed[key].includes(source.name)&&new RegExp('\\b'+name+'\\b').test(source.text))))return;
 return key;
}
function extract(container,wrappers=[]){
 for(const node of [...(container.nodes||[])]){
  if(node.type==='atrule'&&['media','supports','container'].includes(node.name))extract(node,[...wrappers,node]);
  else if(node.type==='rule'){
   const key=owner(node);if(!key)continue;
   let clone=node.clone();
   for(const wrapper of [...wrappers].reverse())clone=wrapper.clone({nodes:[clone]});
   output[key].append(clone);node.remove();
  }
 }
 if(container.type==='atrule'&&!container.nodes.length)container.remove();
}
extract(sheet);
for(const [key,css] of Object.entries(output)){
 if(!css.nodes.length)continue;
 fs.writeFileSync(path.join(root,`frontend/src/${key}.css`),`/* Deferred ${key} styles. Shared/theme overrides remain in styles.css. */\n${css.toString()}\n`);
 console.log(key,css.toString().length);
}
fs.writeFileSync(source,sheet.toString());
