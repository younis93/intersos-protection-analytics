"""Isolated real WebView2 minimize/restore checks; never opens user projects."""
import json
from pathlib import Path
import sys
import time
import traceback
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import desktop_launcher as launcher
import webview

root=Path(__file__).resolve().parents[1]
fixture=json.loads((root/'output/analysis-features/fixture.json').read_text())
controller=launcher.NativeFullscreenController('Isolated analysis restore verification')
window=webview.create_window(controller.title,url='http://127.0.0.1:5397',js_api=launcher.DesktopApi(controller),frameless=True,easy_drag=False,hidden=True,width=1100,height=760)
controller.attach_window(window)
report={'checks':[]}
def js(code):return window.evaluate_js(code)
def run():
 try:
  window.events.loaded.wait(30)
  controller.on_native_ui(lambda native:setattr(native,'Opacity',0))
  window.show()
  for workspace in ('kobo','custom'):
   if '--large' in sys.argv:
    js("""window.originalNativeFetch ||= window.fetch.bind(window);window.fetch=async(...args)=>{const response=await originalNativeFetch(...args);if(!String(args[0]).endsWith('/analysis'))return response;const value=await response.json();const q=value.questions[0];if(q)value.questions=[q,...Array.from({length:31},(_,i)=>({...q,id:'native-stress-'+i,name:'Native stress '+i,chartProjection:null,chartTopN:null,rows:Array.from({length:240},(_,r)=>({id:'r'+r,label:'Answer '+r,count:240-r,percent:50,series:Array.from({length:48},(_,c)=>({id:'c'+c,count:(r+c)%20,percent:50}))})),breakdowns:Array.from({length:48},(_,c)=>({id:'c'+c,label:'Category '+c,labels:['Group '+Math.floor(c/8),'Category '+c],values:['g'+Math.floor(c/8),'c'+c],denominator:1000})),breakdownFields:[{id:'group',label:'Group'},{id:'category',label:'Category'}]}))];return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})}""")
   js(f'location.hash="/{workspace}/{fixture[workspace]["id"]}"')
   for _ in range(80):
    if js('!!document.querySelector(".kobo-question")'):break
    time.sleep(.25)
   assert js('!!document.querySelector(".kobo-question")')
   js('window.restoreEvents=0;window.restoreErrors=[];if(window.nativeResumeListener)window.removeEventListener("analysis-resume",window.nativeResumeListener);window.nativeResumeListener=()=>restoreEvents++;window.addEventListener("analysis-resume",window.nativeResumeListener);window.addEventListener("error",e=>restoreErrors.push(e.message));window.addEventListener("unhandledrejection",()=>restoreErrors.push("rejection"));')
   # Exercise the analysis and an unsaved native-dialog draft.
   js('document.querySelector("[aria-label^=Configure]").click()')
   time.sleep(1.5)
   assert js('!!document.querySelector("dialog[open]")')
   js('window.dialogEvents=[];document.addEventListener("cancel",e=>dialogEvents.push("cancel"),true);document.addEventListener("close",e=>dialogEvents.push("close"),true)')
   for mode in ('normal','maximized','fullscreen'):
    if mode=='maximized':controller.toggle_maximize()
    if mode=='fullscreen':controller.toggle()
    time.sleep(.3)
    before=controller.on_native_ui(lambda n:[str(n.WindowState),n.Bounds.X,n.Bounds.Y,n.Bounds.Width,n.Bounds.Height])
    for _ in range(3):
     window.minimize()
     for wait in range(30):
      if controller.on_native_ui(lambda n:str(n.WindowState))=='Minimized':break
      time.sleep(.1)
     controller.on_native_ui(lambda n:setattr(n,'WindowState',__import__('System.Windows.Forms',fromlist=['FormWindowState']).FormWindowState.Maximized if before[0]=='Maximized' else __import__('System.Windows.Forms',fromlist=['FormWindowState']).FormWindowState.Normal))
     time.sleep(.6)
     after=controller.on_native_ui(lambda n:[str(n.WindowState),n.Bounds.X,n.Bounds.Y,n.Bounds.Width,n.Bounds.Height])
     state=js('({width:innerWidth,height:innerHeight,cards:document.querySelectorAll(".kobo-question").length,dialog:!!document.querySelector("dialog[open]"),errors:restoreErrors,resumes:restoreEvents,cells:document.querySelectorAll(".kobo-pivot-table td").length,dialogs:Array.from(document.querySelectorAll("dialog")).map(d=>({label:d.getAttribute("aria-label"),open:d.open})),hash:location.hash,dialogEvents})')
     assert before==after,(before,after)
     assert state['width']>0 and state['height']>0 and state['dialog'] and state['cards'] and not state['errors'],state
    report['checks'].append({'workspace':workspace,'mode':mode,'bounds':after,'renderer':state})
    if mode=='fullscreen':controller.toggle()
    if mode=='maximized':controller.toggle_maximize()
   js('document.querySelector("dialog[open]")?.dispatchEvent(new Event("cancel",{cancelable:true}))')
 except Exception:report['error']=traceback.format_exc()
 finally:window._export_close_allowed=True;window.destroy()
webview.start(run,gui='edgechromium',private_mode=True)
target=root/'output/analysis-features'/('native-restore-'+('before' if '--before' in sys.argv else 'after')+('-large' if '--large' in sys.argv else '')+'.json')
target.write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
if 'error' in report:sys.exit(1)
