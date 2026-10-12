import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const url=process.env.QA_URL;
if(!url || !/^https?:\/\//.test(url))throw Error('QA_URL must be a URL');
await mkdir('qa-screenshots',{recursive:true});
const browser=await chromium.launch({headless:true});
let failures=0;
for(const [label,width,height] of [['desktop',1440,900],['tablet',768,1024],['mobile',390,844]]){
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try {
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(1800);
  await page.screenshot({path:'qa-screenshots/'+label+'-'+width+'x'+height+'.png',fullPage:true});
  const result=await page.evaluate(()=>({
    title:document.title,
    horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2,
    loginImage:(()=>{const im=document.querySelector('.login-illustration');return im?{src:im.getAttribute('src'),loaded:im.complete&&im.naturalWidth>0,width:im.naturalWidth,height:im.naturalHeight}:null})()
  }));
  console.log(JSON.stringify({viewport:label,http:response?.status(),...result,pageErrors:errors}));
  if(/login\\s*[–-]\\s*vercel/i.test(result.title)||page.url().includes('vercel.com/login')){console.error('BLOCKED: Vercel Authentication page, not ERP');failures++;}
  if(!result.loginImage){console.error('BLOCKED: ERP login illustration not found');failures++;}
  if(!response?.ok()||result.horizontalOverflow||errors.length)failures++;
  if(result.loginImage&& !result.loginImage.loaded)failures++;
 }catch(e){console.error(label,e.message);failures++;}
 await page.close();
}
await browser.close();
if(failures)process.exitCode=1;
