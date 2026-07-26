import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// WHAT IS ACTUALLY DEPLOYED RIGHT NOW.
//
// "The site looks stale" has come up more than once, and each time answering it meant
// diffing bytes by hand against the repo. That is a slow way to settle a question with a
// factual answer, and it cannot be done at all from a phone. So the build stamps the
// commit it was built from into /version.json and into the console banner.
//
// Now the check is: open spx6900rainbow.xyz/version.json. If the sha matches the newest
// commit, the deploy is fine and anything stale on screen is a cache between you and the
// edge. If it does not match, the deploy genuinely did not land, and the sha it reports
// says exactly which build is being served — which is the thing worth knowing.
//
// GITHUB_SHA is set in CI; git is the fallback for a local build.
function buildInfo() {
  const sh = c => { try { return execSync(c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
  return {
    sha: (process.env.GITHUB_SHA || sh('git rev-parse HEAD') || 'unknown').slice(0, 7),
    ref: process.env.GITHUB_REF_NAME || sh('git rev-parse --abbrev-ref HEAD') || 'unknown',
    builtAt: new Date().toISOString(),
  };
}

function versionStamp() {
  const info = buildInfo();
  return {
    name: 'version-stamp',
    // sha + ref only in the DEFINE. builtAt changes on every run, and baking it into the
    // bundle would change the content hash even when the code is byte-identical, so a
    // redeploy of the same commit would needlessly bust every visitor's cached chunk.
    // The timestamp still goes in version.json, which is not content-hashed.
    config: () => ({ define: { __BUILD__: JSON.stringify({ sha: info.sha, ref: info.ref }) } }),
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(info, null, 1) + '\n' });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionStamp()],
  build: {
    rollupOptions: {
      output: {
        // Split big, rarely-changing deps into cached vendor chunks. recharts is
        // the bulk of the bundle and is needed by the hero rainbow on first paint,
        // but isolating it keeps app chunks small and improves repeat-visit caching.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-is)[\\/]/.test(id)) return 'react';
          // three.js only feeds the lazy 3D chart — keep it in its own chunk so it
          // loads on demand (when the 3D tab is opened), NOT in the eager vendor bundle.
          if (/[\\/]node_modules[\\/]three[\\/]/.test(id)) return 'three';
          return 'vendor';
        },
      },
    },
  },
})
