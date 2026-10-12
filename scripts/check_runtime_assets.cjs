// Run after a production build. Also records reproducible size inventories.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'frontend/dist'),publicDir=path.join(root,'frontend/public');
const files=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(path.join(dir,item.name)):[path.join(dir,item.name)]);
for(const file of files(dist))assert(!/\.(blend\d*|psd|xcf|bak)$/i.test(file),'Design file packaged: '+file);
for(const name of ['guardian-fox','guardian-fox-3d','spider-mascot-3d','avatar','intersos-symbol.png','intersos-logo.png'])assert(!fs.existsSync(path.join(dist,name)),'Archived runtime assets packaged: '+name);
for(const file of files(path.join(root,'frontend/src')).filter(file=>/\.(tsx?|css)$/.test(file)&&!file.includes('.test.'))){
 const text=fs.readFileSync(file,'utf8');
 assert(!text.includes("from 'plotly.js-dist-min'")&&!text.includes('from "plotly.js-dist-min"'),'Full Plotly dependency');
 for(const match of text.matchAll(/["'(](\/[\w./-]+\.(?:png|webp|svg|geojson|js))["')]/g))assert(fs.existsSync(path.join(publicDir,match[1])),'Missing runtime asset '+match[1]);
}
for(const action of ['idle','walk','jump','wave','swing'])assert(fs.existsSync(path.join(publicDir,`lego-spiderman-3d/${action}.webp`)));
for(const poster of ['idle','wave'])assert(fs.existsSync(path.join(publicDir,`lego-spiderman-3d/${poster}-poster.webp`)));
for(const asset of ['favicon.png','intersos-symbol-transparent.png','intersos-symbol-clear.png','processing-ring-field.js'])assert(fs.existsSync(path.join(dist,asset)),'Missing startup/runtime '+asset);
const assets=files(path.join(dist,'assets')).map(file=>({name:path.basename(file),bytes:fs.statSync(file).size,gzip_bytes:zlib.gzipSync(fs.readFileSync(file),{level:9}).length}));
assert.equal(assets.filter(a=>/^plotlyEngine-.*\.js$/.test(a.name)).length,1,'Expected one shared chart engine');
assert(!assets.some(a=>/^plotly\.min-/.test(a.name)),'Full Plotly engine packaged');
const result={total_bytes:files(dist).reduce((sum,file)=>sum+fs.statSync(file).size,0),public_bytes:files(publicDir).reduce((sum,file)=>sum+fs.statSync(file).size,0),assets};
fs.writeFileSync(path.join(root,'output/performance/build-size-after.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({totalBytes:result.total_bytes,publicBytes:result.public_bytes,engine:assets.find(a=>a.name.startsWith('plotlyEngine-')),assetAudit:'passed'}));
