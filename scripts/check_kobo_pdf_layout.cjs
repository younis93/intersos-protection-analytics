// Synthetic fixtures exercise the production PDF worker without user data.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {mock}=require('./benchmark_kobo_scroll.cjs');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
 fs.mkdirSync('output/pdf',{recursive:true});fs.mkdirSync('tmp/pdfs',{recursive:true});
 for(const language of ['en','ar']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));let fixture;
  const calls=await mock(page,8,f=>{
   fixture=f;f.settings.language=language;f.settings.hideEmpty=false;
   const ar=language==='ar';
   f.groups=[{id:'g',name:'household',label:ar?'تقييم الأسرة':'Household assessment',labels:{en:'Household assessment',ar:'تقييم الأسرة'},parent:'',repeat:false},{id:'section',name:'section',label:ar?'القسم أ: معلومات الأسرة واحتياجات الحماية':'Section A: Household profile and protection needs',labels:{en:'Section A: Household profile and protection needs'},parent:'g',repeat:false}];
   const titles=ar?['١. جنس المستجيب','٢. عمر المستجيب','٣. احتياجات الحماية حسب المنطقة والجنس','٤. ملاحظات المستجيبين حول الخدمات المتاحة والعوائق التي تواجه الأسر في الحصول على الدعم','٥. عدد أفراد الأسرة','٦. مصادر المعلومات المتاحة','٧. سؤال دون إجابات','٨. سؤال مطول حول الاحتياجات والتحديات التي تواجه الأسر في الوصول إلى الخدمات الأساسية والدعم المجتمعي وسبل تحسين جودة المساعدة المقدمة لأفراد الأسرة']:['1. Sex of the respondent','2. Age of the respondent','3. Protection needs by location and sex','4. Respondent feedback about available services and the barriers households face when seeking support','5. Household size','6. Available information sources','7. An unanswered question','8. A longer question about household needs, barriers to accessing essential services, community support and opportunities to improve the quality of assistance provided to family members'];
   f.results.forEach((r,i)=>{
    r.group='section';r.label=titles[i];r.name='technical_q'+i;r.kind=['category','category','multiple','text','number','category','text','category'][i];r.breakdowns=[];r.breakdownFields=[];r.statistics={};r.chart=i===5?'donut':i===4||i===3?'column':'bar';r.appearance={height:i===4?720:i===1?320:420};
    r.rows=Array.from({length:i===3?34:i===2?12:4},(_,j)=>({id:'answer'+j,label:ar?['متابعة الحماية','الدعم القانوني','الرعاية الصحية','الدعم المجتمعي'][j%4]+` (${i+1}.${j+1})`:`Answer ${i+1}.${j+1} - `+['Protection follow-up','Legal support','Healthcare access','Community support'][j%4],count:80-j,percent:(80-j)/320*100}));
    if(i===0){r.rows=[{id:'male',label:ar?'ذكر':'Male',count:145,percent:54.1},{id:'female',label:ar?'أنثى':'Female',count:123,percent:45.9}];r.denominator=268}
    if(i===1||i===2){r.breakdowns=Array.from({length:i===1?2:8},(_,j)=>({id:'b'+j,label:ar?`المجموعة ${j+1} - احتياجات الأسر`:`Category ${j+1} - Household needs`,denominator:40}));r.rows.forEach((row,j)=>row.series=r.breakdowns.map((b,k)=>({id:b.id,count:10+j+k,percent:(10+j+k)/40*100})));r.chart='column';f.settings.questions[r.id]={breakdownDisplay:i===1?'count':'both'};}
    if(i===3){r.rows[2].label=(ar?'ملاحظة مطولة حول الوصول إلى الخدمات والحماية ومتابعة الاحتياجات المتعددة للأسرة. ':'A detailed response about access to services, protection concerns and follow-up for household needs. ').repeat(48)+' END_OF_LONG_RESPONSE';r.denominator=34;}
    if(i===4){r.statistics={count:320,mean:4.25,median:4,min:1,max:9,standardDeviation:1.3};r.rows=r.rows.map((row,j)=>({...row,label:String(j+1)}));}
    if(i===6){r.rows=[];r.denominator=0;}
    f.questions[i].labels={en:titles[i],ar:titles[i]};f.questions[i].group=r.group;f.questions[i].kind=r.kind;
   });
  });
  await page.goto((process.argv[2]||'http://127.0.0.1:5359')+'/#/kobo/scroll');await page.locator('#question-technical_q0').waitFor({timeout:10000}).catch(async e=>{console.error(errors);console.error((await page.locator('body').innerText()).slice(-2000));throw e});
  const download=page.waitForEvent('download',{timeout:180000});await page.getByRole('button',{name:'Export',exact:true}).click();await page.getByRole('button',{name:'Report PDF',exact:true}).click();await(await download).saveAs(`output/pdf/kobo-report-${language}.pdf`);
  fs.writeFileSync(`tmp/pdfs/fixture-${language}.json`,JSON.stringify(fixture));
  if(language==='en'){const single=page.waitForEvent('download',{timeout:120000});await page.locator('#question-technical_q0').getByRole('button',{name:'Export question',exact:true}).click();await page.locator('#question-technical_q0').getByRole('button',{name:'Question PDF',exact:true}).click();await(await single).saveAs('tmp/pdfs/single-question.pdf');}
  assert.equal(calls(),1,'PDF export must reuse the captured analysis');assert.deepEqual(errors,[]);console.log('Saved '+language+' PDF and verified worker export without extra analysis.');await page.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
