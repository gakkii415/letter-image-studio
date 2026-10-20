import {defineConfig} from '@playwright/test';
import {existsSync} from 'node:fs';
export default defineConfig({
 testDir:'./tests', testMatch:'*.spec.js', timeout:45000, fullyParallel:false,
 use:{baseURL:'http://127.0.0.1:4173',viewport:{width:393,height:700}},
 projects:[
  {name:'chromium',use:{browserName:'chromium',launchOptions:existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium',args:['--no-sandbox']}:undefined}},
  {name:'webkit',use:{browserName:'webkit'}}
 ],
 webServer:{command:'python3 -m http.server 4173 --bind 127.0.0.1',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI,stdout:'ignore',stderr:'ignore'},
 reporter:'list',outputDir:'test-results'
});
