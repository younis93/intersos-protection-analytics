"""WebView2 lifecycle recovery without navigating healthy renderer sessions."""
import json
import threading
from datetime import datetime, timezone


class DesktopResume:
    def __init__(self, controller):
        self.controller=controller
        self.native=None
        self.minimized=False
        self.timer=None
        self.closed=False
        self.core=None
        self.sequence=0
        self.failure_prompted=False

    def log(self, event, **details):
        # Only lifecycle metadata belongs here. Never log JS messages or record values.
        try:
            from desktop_launcher import app_data_dir
            path=app_data_dir()/'window-lifecycle.log'
            if path.exists() and path.stat().st_size>512000:
                path.replace(path.with_suffix('.previous.log'))
            with path.open('a',encoding='utf-8') as output:
                output.write(json.dumps({'time':datetime.now(timezone.utc).isoformat(),'event':event,**details})+'\n')
        except OSError:pass

    def attach(self, native):
        self.native=native
        native.Resize += self.resized
        native.webview.CoreWebView2InitializationCompleted += self.initialized
        self.bind_core()

    def bind_core(self):
        core=self.native.webview.CoreWebView2
        if core is not None and core is not self.core:
            self.core=core
            core.ProcessFailed += self.failed

    def initialized(self, _sender, args):
        if args.IsSuccess:self.bind_core()

    def resized(self, _sender, _args):
        if self.closed:return
        state=str(self.native.WindowState)
        if state=='Minimized':
            if not self.minimized:self.log('minimized',fullscreen=self.controller.fullscreen)
            self.minimized=True
            if self.timer:self.timer.cancel()
        elif self.minimized:
            if self.timer:self.timer.cancel()
            self.timer=threading.Timer(.12,self.resume)
            self.timer.daemon=True;self.timer.start()

    def resume(self):
        if self.closed:return
        try:
            def recover(native):
                if self.closed or not self.minimized or str(native.WindowState)=='Minimized' or native.ClientSize.Width<=0 or native.ClientSize.Height<=0:return None
                self.minimized=False
                if self.controller.fullscreen:
                    # WinForms restores maximized fullscreen windows to the work area.
                    # Reapply monitor bounds without altering normal restore placement.
                    from System.Windows.Forms import Screen
                    bounds=Screen.FromHandle(native.Handle).Bounds
                    self.controller._frame._user32.SetWindowPos(native.Handle.ToInt64(),None,bounds.X,bounds.Y,bounds.Width,bounds.Height,0x0014)
                else:self.controller.refresh_work_area()
                native.PerformLayout()
                view=native.webview
                view.Visible=True
                view.Bounds=native.ClientRectangle
                view.Invalidate(True);view.Update()
                return {'width':view.ClientSize.Width,'height':view.ClientSize.Height,'state':str(native.WindowState),'fullscreen':self.controller.fullscreen}
            state=self.controller.on_native_ui(recover)
            if state is None:return
            self.minimized=False;self.sequence+=1
            self.log('resumed',**state)
            # The renderer performs one coordinated remeasurement after two frames.
            self.controller.window.evaluate_js('requestAnimationFrame(()=>requestAnimationFrame(()=>{if(innerWidth>0&&innerHeight>0)window.dispatchEvent(new CustomEvent("analysis-resume"))}))')
            self.controller.publish_state(force=True)
        except Exception as exc:self.log('resume-failed',kind=type(exc).__name__)

    def failed(self, _sender, args):
        kind=str(args.ProcessFailedKind)
        self.log('renderer-failed',kind=kind)
        if kind not in {'BrowserProcessExited','RenderProcessExited','RenderProcessUnresponsive'} or self.failure_prompted:return
        self.failure_prompted=True
        from System.Windows.Forms import MessageBox,MessageBoxButtons,DialogResult,MessageBoxIcon
        # Renderer failures cannot safely be repaired with a hidden page reload.
        answer=MessageBox.Show(self.native,'The view stopped responding. Restore view to reopen your saved analysis? Unsaved dialog changes may be lost.','Restore view',MessageBoxButtons.YesNo,MessageBoxIcon.Warning)
        if answer==DialogResult.Yes:
            self.log('restore-view-requested')
            try:
                self.native.webview.Reload()
                self.failure_prompted=False
            except Exception as exc:
                self.log('restore-view-failed',kind=type(exc).__name__)
                MessageBox.Show(self.native,'Windows could not restore this view. Close and reopen the app to return to your saved analysis.','Restore view',MessageBoxButtons.OK,MessageBoxIcon.Warning)

    def dispose(self):
        self.closed=True
        if self.timer:self.timer.cancel()
        if self.native is not None:
            self.native.Resize -= self.resized
            self.native.webview.CoreWebView2InitializationCompleted -= self.initialized
        if self.core is not None:self.core.ProcessFailed -= self.failed
