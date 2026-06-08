import { defineManifest } from '@crxjs/vite-plugin';

/**
 * MV3 manifest. Service worker (not a background page) brokers network + state;
 * the side panel is the author/player UI; one content script per page hosts the
 * Shadow-DOM overlay and DOM capture/resolution.
 */
export default defineManifest({
  manifest_version: 3,
  name: 'Mini Apty',
  version: '0.0.1',
  description: 'Author and play guided walkthroughs on any website (MV3 DAP).',
  action: { default_title: 'Mini Apty' },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['sidePanel', 'storage', 'activeTab', 'scripting', 'tabs', 'alarms'],
  host_permissions: ['<all_urls>'],
});
