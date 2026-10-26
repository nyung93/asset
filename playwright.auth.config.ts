import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests',testMatch:'**/auth.spec.ts',workers:1,
  use:{baseURL:'http://127.0.0.1:4175',channel:'chrome',headless:true,timezoneId:'Asia/Seoul'},
  projects:[{name:'desktop',use:{viewport:{width:1280,height:900}}},{name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}],
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort',url:'http://127.0.0.1:4175',reuseExistingServer:false,env:{VITE_E2E_AUTH_BYPASS:'0'}},
});
