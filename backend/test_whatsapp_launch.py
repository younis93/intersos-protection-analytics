import ctypes
from unittest.mock import patch

import pytest
from desktop_launcher import DesktopApi, _whatsapp_protocol_available


@pytest.mark.parametrize("available,failed,expected", [
    (True, False, ["whatsapp://send?phone=9647701234567"]),
    (False, False, ["https://web.whatsapp.com/send?phone=9647701234567"]),
    (True, True, ["whatsapp://send?phone=9647701234567", "https://web.whatsapp.com/send?phone=9647701234567"]),
])
def test_native_app_and_web_fallback(available, failed, expected):
    with patch("desktop_launcher.sys.platform", "win32"), \
         patch("desktop_launcher._whatsapp_protocol_available", return_value=available), \
         patch("desktop_launcher.os.startfile", side_effect=[OSError("App missing"), None] if failed else None) as launch:
        assert DesktopApi(None).open_issue_whatsapp("9647701234567")
    assert [call.args[0] for call in launch.call_args_list] == expected


@pytest.mark.parametrize("recipient", ["07701234567", "123", "+9647701234567", "9647701234567?text=hello", "9647701234567\n", None, "١٢٣٤٥٦٧٨٩"])
def test_invalid_recipient_never_launches(recipient):
    with patch("desktop_launcher.os.startfile") as launch:
        with pytest.raises(ValueError):
            DesktopApi(None).open_issue_whatsapp(recipient)
    launch.assert_not_called()


@pytest.mark.parametrize("registered", [True, False])
def test_windows_protocol_query_supports_store_registration(registered):
    def query(flags, kind, protocol, verb, output, size):
        assert (flags, kind, protocol, verb) == (0x1000, 20, "whatsapp", None)
        if not registered:
            return -1
        ctypes.cast(size, ctypes.POINTER(ctypes.c_ulong)).contents.value = 64
        if output is None:
            return 1
        output.value = "AppX.WhatsApp"
        return 0

    with patch("desktop_launcher.sys.platform", "win32"), \
         patch("desktop_launcher.ctypes.windll.shlwapi.AssocQueryStringW", side_effect=query):
        assert _whatsapp_protocol_available() is registered


def test_web_launch_failure_is_reported():
    with patch("desktop_launcher._whatsapp_protocol_available", return_value=False), \
         patch("desktop_launcher.os.startfile", side_effect=OSError("Browser unavailable")):
        with pytest.raises(OSError, match="Browser unavailable"):
            DesktopApi(None).open_issue_whatsapp("9647701234567")
