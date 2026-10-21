"""Only remove export workspaces whose owner no longer holds its file lock."""
import os
import shutil
import stat
import tempfile
import time
from pathlib import Path


def lock_owner(folder):
    handle = (folder / '.export-owner').open('a+b')
    try:
        if handle.seek(0, 2) == 0:
            handle.write(b'1'); handle.flush()
        handle.seek(0)
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return handle
    except Exception:
        handle.close()
        raise


def new_export_folder():
    folder = Path(tempfile.mkdtemp(prefix='intersos-kobo-'))
    return folder, lock_owner(folder)


def remove_export_folder(folder, owner=None):
    # Callers release ownership only after the worker has stopped.
    if owner is not None:
        owner.close()
    shutil.rmtree(folder, ignore_errors=True)


def cleanup_export_folders(root=None):
    root = Path(root or tempfile.gettempdir()).resolve()
    for folder in root.glob('intersos-kobo-*'):
        try:
            info = folder.lstat()
            if not stat.S_ISDIR(info.st_mode) or folder.is_symlink() or getattr(info, 'st_file_attributes', 0) & getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0):
                continue
            if folder.resolve().parent != root:
                continue
            if (folder / '.export-owner').is_symlink():
                continue
            # Older releases had no owner lock. Leave recent legacy folders alone;
            # the export hard limit is one hour, so two hours is conservative.
            if not (folder / '.export-owner').exists() and time.time() - info.st_mtime < 7200:
                continue
            owner = lock_owner(folder)  # A live exporter makes this fail.
            remove_export_folder(folder, owner)
        except OSError:
            continue
