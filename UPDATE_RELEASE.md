# Publishing application updates

1. Create the public repository `younis93/intersos-protection-analytics` and push this local `main` branch.
2. Add repository secrets `SIGNING_CERTIFICATE_BASE64` and `SIGNING_CERTIFICATE_PASSWORD`.
3. Commit changes, then publish with a semantic version tag:
   `git tag v1.0.1` and `git push origin v1.0.1`.
4. GitHub Actions builds, signs, and publishes the installer plus `update.json`. Installed clients detect the release on their next launch or through the Updates button.

The public repository contains application code and release binaries only. Uploaded workbooks never leave the client computer.
