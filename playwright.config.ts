import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testIgnore: '**/auth.spec.ts',
  fullyParallel: false,
  workers: 1,
  use: {baseURL: 'http://127.0.0.1:4173', channel: 'chrome', headless: true, timezoneId: 'Asia/Seoul', trace: 'retain-on-failure'},
  projects: [
    {name:'desktop',use:{viewport:{width:1280,height:900}}},
    {name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}},
  ],
  webServer: {command:'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',url:'http://127.0.0.1:4173',reuseExistingServer:false,env:{VITE_GEMINI_API_KEY:'e2e-placeholder-not-a-secret',VITE_GEMINI_MODEL:'gemini-3.8-flash',VITE_E2E_AUTH_BYPASS:'1'}},
});
