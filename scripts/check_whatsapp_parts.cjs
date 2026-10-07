const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'C:/Users/youni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),fixture=path.join(root,'frontend/src/whatsappPartsBrowserCheck.tsx'),html=path.join(root,'frontend/whatsapp-parts-browser-check.html');
(async()=>{let browser;try{
  fs.writeFileSync(fixture,`import React from 'react';import {createRoot} from 'react-dom/client';import SendIssues from './SendIssues';import './styles.css';createRoot(document.getElementById('root')!).render(<SendIssues revision="browser-check"/>);`);
  fs.writeFileSync(html,'<div id="root"></div><script type="module" src="/src/whatsappPartsBrowserCheck.tsx"></script>');
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];let changed=false;
  page.on('pageerror',error=>errors.push(String(error)));
  await page.addInitScript(()=>{
    window.copied=[];window.launched=[];
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copied.push(text)}});
    window.pywebview={api:{open_issue_whatsapp:async phone=>{window.launched.push(phone);return true;}}};
  });
  const rows=Array.from({length:16},(_,index)=>({id:'f'+index,dataset:'awareness',rule:'Duplicate participant in session',ruleArabic:'تكرار مشارك في الجلسة',detail:'Original detail '+('long detail '.repeat(45)),detailArabic:'تفاصيل عربية '+('تفاصيل '.repeat(45)),affectedFields:['Participant Name','Session Topic'],caseId:'',awarenessId:'000'+index,lawyer:'Alice',row:index+2,recordId:'000'+index,severity:'Low',reviewPage:'Awareness Review',project:'P1',location:'L1',action:'Review'}));
  await page.route('**/api/legal/send-issues/**',async route=>{
    const contacts={contacts:{Alice:'alice@example.org'},whatsappNumbers:{Alice:'07701234567'}};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(route.request().url().endsWith('/contacts')?contacts:{...contacts,revision:changed?'r2':'r1',lawyers:['Alice'],rows,total:rows.length})});
  });
  const url=(process.env.APP_TEST_URL||'http://127.0.0.1:5176')+'/whatsapp-parts-browser-check.html';
  async function open(){await page.getByRole('checkbox',{name:'Select all filtered findings across all pages',exact:true}).check();await page.getByRole('button',{name:'WhatsApp (16)',exact:true}).click();await page.getByRole('heading',{name:'WhatsApp for Alice'}).waitFor();}
  await page.goto(url);await open();
  const language=page.getByLabel('Message language');assert.equal(await language.inputValue(),'bilingual');
  assert(await page.locator('.si-whatsapp-part').count()>1);
  await language.selectOption('ar');await page.getByLabel('Name',{exact:true}).fill('Sender');
  await page.getByRole('button',{name:'Save settings',exact:true}).click();
  await page.getByRole('button',{name:'Close WhatsApp message'}).click();await page.reload();await open();
  assert.equal(await language.inputValue(),'ar');assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Sender');
  await page.getByText('Edit message text',{exact:true}).click();const editor=page.getByLabel('Edit WhatsApp message');
  await editor.fill('Edited 😀 '+ 'text '.repeat(1800));await language.selectOption('en');assert((await editor.inputValue()).startsWith('Edited 😀'));
  page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Regenerate message',exact:true}).click();assert((await editor.inputValue()).startsWith('Edited 😀'));
  const second=page.locator('.si-whatsapp-part').nth(1);const exact=await second.locator('div[dir="auto"]').textContent();
  await second.getByRole('button',{name:/Copy Part/}).click();assert.equal(await page.evaluate(()=>window.copied.at(-1)),exact);
  assert((await page.locator('.si-whatsapp-actions').textContent()).includes('Part 2'));
  await page.getByRole('button',{name:'Copy and open WhatsApp',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.copied.at(-1)),exact);assert.deepEqual(await page.evaluate(()=>window.launched),['9647701234567']);
  for(const width of [1280,800,390]){
    await page.setViewportSize({width,height:900});
    const launch=page.getByRole('button',{name:'Copy and open WhatsApp',exact:true});await launch.scrollIntoViewIfNeeded();
    const bounds=await launch.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y+bounds.height<=900);
    await page.locator('.si-whatsapp-part').first().getByRole('button',{name:/Copy Part/}).scrollIntoViewIfNeeded();
    const overflow=await page.locator('.si-message-preview').evaluate(el=>el.scrollWidth>el.clientWidth+1);assert.equal(overflow,false);
    if(width===1280)await page.screenshot({path:path.join(root,'output/whatsapp-message-parts.png')});
  }
  const copies=await page.evaluate(()=>window.copied.length);changed=true;
  await page.getByRole('button',{name:'Copy and open WhatsApp',exact:true}).click();
  await page.getByRole('heading',{name:'WhatsApp for Alice'}).waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>window.copied.length),copies);assert.equal(await page.locator('.si-whatsapp-part').count(),0);
  assert.deepEqual(errors,[]);console.log('WhatsApp browser checks passed: settings restored, edits preserved, exact part copied/opened, stale data blocked, layouts at 1280/800/390px.');
}finally{await browser?.close();for(const file of [fixture,html])if(fs.existsSync(file))fs.unlinkSync(file);}})().catch(error=>{console.error(error);process.exit(1)});
