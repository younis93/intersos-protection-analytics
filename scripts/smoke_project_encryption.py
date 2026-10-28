"""Can also be frozen to verify the Windows cryptography runtime hooks."""
from backend.project_encryption import protect_backup, unlock_backup

if __name__ == '__main__':
    raw = b'PK synthetic desktop packaging smoke test'
    encrypted = protect_backup(raw, 'Synthetic smoke password 2026')
    assert unlock_backup(encrypted, 'Synthetic smoke password 2026') == raw
    print('Frozen project encryption round trip passed.')
