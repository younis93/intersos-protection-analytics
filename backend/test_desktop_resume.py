from types import SimpleNamespace
from unittest.mock import Mock
import sys
from desktop_resume import DesktopResume


def fixture(width=900,height=600):
    view=Mock(ClientSize=SimpleNamespace(Width=width,Height=height))
    native=Mock(WindowState='Normal',ClientSize=SimpleNamespace(Width=width,Height=height),webview=view,ClientRectangle=(0,0,width,height))
    controller=Mock(fullscreen=False)
    controller.on_native_ui.side_effect=lambda callback:callback(native)
    resume=DesktopResume(controller);resume.native=native;resume.log=Mock();resume.minimized=True
    return resume,controller,view


def test_resume_repairs_visible_viewport_once_and_does_not_reload():
    resume,controller,view=fixture()
    resume.resume();resume.resume()
    assert view.Bounds==(0,0,900,600) and view.Visible
    view.Invalidate.assert_called_once_with(True)
    view.Reload.assert_not_called()
    controller.window.evaluate_js.assert_called_once()
    assert 'analysis-resume' in controller.window.evaluate_js.call_args.args[0]
    assert resume.sequence==1


def test_zero_viewport_and_closed_window_do_not_notify_or_reload():
    resume,controller,view=fixture(width=0)
    resume.resume()
    controller.window.evaluate_js.assert_not_called()
    assert resume.minimized
    resume.closed=True;resume.resume()
    view.Reload.assert_not_called()


def test_resume_diagnostics_contain_only_geometry_and_lifecycle_fields():
    resume,controller,view=fixture()
    resume.resume()
    args=resume.log.call_args
    assert args.args==('resumed',)
    assert set(args.kwargs)=={'width','height','state','fullscreen'}


def test_renderer_failure_requires_explicit_confirmation_and_gpu_recovery_does_not_prompt(monkeypatch):
    prompt=Mock(return_value='No')
    forms=SimpleNamespace(MessageBox=SimpleNamespace(Show=prompt),MessageBoxButtons=SimpleNamespace(YesNo='YesNo',OK='OK'),DialogResult=SimpleNamespace(Yes='Yes'),MessageBoxIcon=SimpleNamespace(Warning='Warning'))
    monkeypatch.setitem(sys.modules,'System.Windows.Forms',forms)
    resume,controller,view=fixture()
    resume.failed(None,SimpleNamespace(ProcessFailedKind='GpuProcessExited'))
    prompt.assert_not_called()
    resume.failed(None,SimpleNamespace(ProcessFailedKind='RenderProcessExited'))
    prompt.assert_called_once();view.Reload.assert_not_called()
    resume.failed(None,SimpleNamespace(ProcessFailedKind='RenderProcessExited'))
    prompt.assert_called_once()
    resume.failure_prompted=False;prompt.return_value='Yes'
    resume.failed(None,SimpleNamespace(ProcessFailedKind='RenderProcessExited'))
    view.Reload.assert_called_once()
