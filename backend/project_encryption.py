"""Versioned, authenticated encryption for portable project ZIPs.

V1: magic (8), version (1), salt (16), nonce (12), ciphertext and GCM tag (16).
The complete 37-byte header is authenticated as associated data.
"""
import os
from threading import BoundedSemaphore

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from pydantic import BaseModel, SecretStr

MAGIC = b'INTERSOS'
VERSION = 1
HEADER_SIZE = 37
OVERHEAD = HEADER_SIZE + 16
MAX_BACKUP = 200 * 1024 * 1024
MAX_UPLOAD = MAX_BACKUP + OVERHEAD
_crypto_slot = BoundedSemaphore(1)


class ProjectProtectionError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.detail = {'code': code, 'message': message}


class ExportProtection(BaseModel):
    password: SecretStr | None = None

    def value(self):
        return self.password.get_secret_value() if self.password is not None else None


def _key(password, salt):
    # Fixed parameters per version: never accept work factors from untrusted files.
    return Scrypt(salt=salt, length=32, n=131072, r=8, p=1).derive(password.encode('utf-8'))


def protect_backup(raw, password=None):
    if len(raw) > MAX_BACKUP:
        raise ProjectProtectionError('invalid_backup', 'Project exceeds the 200 MB backup limit.')
    if password is None:
        return raw
    if not 8 <= len(password) <= 1024:
        raise ProjectProtectionError('invalid_password', 'Use a password between 8 and 1024 characters.')
    with _crypto_slot:
        salt, nonce = os.urandom(16), os.urandom(12)
        header = MAGIC + bytes([VERSION]) + salt + nonce
        return header + AESGCM(_key(password, salt)).encrypt(nonce, raw, header)


def unlock_backup(raw, password=None):
    if len(raw) > MAX_UPLOAD:
        raise ProjectProtectionError('invalid_backup', 'Project exceeds the 200 MB backup limit.')
    if not raw.startswith(MAGIC):
        if not raw.startswith(b'PK') or len(raw) > MAX_BACKUP:
            raise ProjectProtectionError('invalid_backup', 'Choose a valid project ZIP or protected project file.')
        return raw
    if len(raw) < OVERHEAD:
        raise ProjectProtectionError('invalid_backup', 'The protected project file is incomplete.')
    if raw[8] != VERSION:
        raise ProjectProtectionError('unsupported_format', 'This protected project version is not supported. Update the application.')
    if password is None:
        raise ProjectProtectionError('password_required', 'Enter the password to unlock this project.')
    if len(password) > 1024:
        raise ProjectProtectionError('unlock_failed', 'Unable to unlock this project. Check the password or choose an intact file.')
    try:
        with _crypto_slot:
            return AESGCM(_key(password, raw[9:25])).decrypt(raw[25:37], raw[37:], raw[:37])
    except InvalidTag:
        raise ProjectProtectionError('unlock_failed', 'Unable to unlock this project. Check the password or choose an intact file.') from None
