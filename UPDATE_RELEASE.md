# Publishing application updates

1. Create the public repository `younis93/intersos-protection-analytics` and push this local `main` branch.
2. Add repository secrets `SIGNING_CERTIFICATE_BASE64` and `SIGNING_CERTIFICATE_PASSWORD`.
3. Commit changes, then publish with a semantic version tag:
   `git tag v1.0.1` and `git push origin v1.0.1`.
4. GitHub Actions builds, signs, and publishes the installer plus `update.json`. Installed clients detect the release on their next launch or through the Updates button.

The application also checks every six hours while it remains open. Periodic checks update the red Updates indicator without reopening the update dialog.

## First installation with the self-signed certificate

Starting with version 1.0.4, the setup executable contains only the public INTERSOS code-signing certificate and installs it into the current user's Root and Trusted Publishers stores after explicit confirmation. The PFX and its password remain only in GitHub Actions secrets.

Existing portable or pre-1.0.4 clients must download and run the 1.0.4 setup interactively once. Windows will show an unknown-publisher warning before the certificate is trusted. After that bootstrap installation, signed updates can be installed through the application.

The public repository contains application code and release binaries only. Uploaded workbooks never leave the client computer.
