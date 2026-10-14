import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Desktop windows may still import chunks from the previous build.
    // Keep those files available until the window reloads the current entry.
    emptyOutDir: false,
  },
});
