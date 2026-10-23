const { chromium } = require('playwright');
const { spawn } = require('node:child_process');

const origin='http://127.0.0.1:4173';
const token='a'.repeat(43);
const expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
const employeeId='22222222-2222-4222-8222-222222222222';
const businessId='33333333-3333-4333-8333-333333333333';
const user={id:'11111111-1111-4111-8111-111111111111',
 email:'safari-worker@example.test',displayName:'Safari Worker'};
const profile={user,employment:[{
 id:employeeId,businessUnitId:businessId,businessName:'Pioneer Outdoor Services',
 displayName:user.displayName,jobTitle:'Snow Removal Employee',
 payRate:{hourlyCents:1900,effectiveOn:'2026-09-01',overtimeMultiplierBps:15000}
}]};
const headers={
 'content-type':'application/json',
 'access-control-allow-origin':origin,
 'access-control-allow-credentials':'true',
 'access-control-allow-methods':'GET,POST,OPTIONS',
 'access-control-allow-headers':'Authorization,Content-Type',
 'cache-control':'no-store',
};
async function run(){
 const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173'],
   {stdio:['ignore','pipe','pipe']});
 let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  const errors=[];
   let ptoSubmitted=null;
  let authenticated=false,loginCount=0,validReads=0,logoutCount=0,blockedCookieReads=0;
  page.on('pageerror',err=>errors.push(err.stack||err.message));
  await page.route('https://api.pioneerlegacyworks.com/**',async route=>{
   const req=route.request();
   const path=new URL(req.url()).pathname;
   if(req.method()==='OPTIONS'){
     await route.fulfill({status:204,headers});return;
   }
   const auth=req.headers()['authorization'];
   const isBearer=auth==='Bearer '+token && authenticated;
   const send=(status,data)=>route.fulfill({
     status,headers,body:JSON.stringify(data),
   });
   if(path==='/api/employee/session/login'){
     if(req.method()!=='POST')throw new Error('Employee login must be POST');
     const input=JSON.parse(req.postData()||'{}');
     if(input.email!==user.email||input.password!=='secure-example-password'){
       throw new Error('Employee credentials were not sent to the correct endpoint');
     }
     loginCount++;authenticated=true;
     await send(200,{data:{token,expiresAt,profile}});return;
   }
   if(path==='/api/employee/session/logout'){
     if(!isBearer)throw new Error('Logout did not send the employee bearer credential');
     authenticated=false;logoutCount++;
     await route.fulfill({status:204,headers});return;
   }
   if(path==='/api/employee/me'){
     if(!isBearer){
       blockedCookieReads++;await send(401,{error:{code:'UNAUTHENTICATED',message:'Authentication required'}});return;
     }
     validReads++;await send(200,{data:profile});return;
   }
   if(path==='/api/employee/jobs'){
     if(!isBearer)throw new Error('Dashboard jobs were requested without bearer authentication');
     await send(200,{data:[]});return;
   }
   if(path==='/api/employee/capabilities'){
     if(!isBearer)throw new Error('Employee capabilities lacked token');
     await send(200,{data:{photoUploads:true}});return;
   }
   if(path==='/api/employee/leave/balances'){
      if(!isBearer)throw new Error('Leave balances requested without bearer authentication');
      await send(200,{data:{employeeId,businessUnitId:businessId,
        balances:{pto:{balanceHours:1.5,earnedHours:1.5,reversedHours:0},
          sick:{balanceHours:1.5,earnedHours:1.5,reversedHours:0}},
        policy:{effective_on:'2026-10-23',hours_worked_per_leave_hour:30,planned_notice_days:7}}});
      return;
    }
    if(path==='/api/employee/leave/requests'){
     if(!isBearer)throw new Error('PTO request used no bearer authorization');
     if(req.method()==='POST'){
       ptoSubmitted=JSON.parse(req.postData()||'{}');
       await send(201,{data:{id:'request-one',...ptoSubmitted,status:'pending'}});return;
     }
     await send(200,{data:ptoSubmitted?[{id:'request-one',...ptoSubmitted,status:'pending',note:ptoSubmitted.note}]:[]});return;
   }
   if(path.startsWith('/api/employee/pay/')){
     if(!isBearer)throw new Error('Pay stub request omitted employee authentication');
     if(path.endsWith('/paid-statements'))await send(200,{data:[{id:'payment-one',runId:'run-one',payDate:'2026-10-09',status:'recorded_paid',netPaidCents:10433,statement:{periodStart:'2026-09-28',periodEndExclusive:'2026-10-05',amounts:{gross_cents:13500,total_withholding_cents:1567,voluntary_deductions_cents:1500,reimbursement_cents:0}}}]});
     else if(path.endsWith('/download'))await send(200,{data:{filename:'pay-stub.html',html:'<!doctype html><h1>Final Pay Stub</h1><p>Net paid $104.33</p>'}});
     else await send(200,{data:[]});return;
   }
   await send(404,{error:{message:'Unknown mock route '+path}});
  });
  await page.goto(origin+'/#/login',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Employee Sign In'}).waitFor({timeout:15000});
  await page.getByRole('textbox',{name:'Email Address'}).fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill('secure-example-password');
  await page.getByRole('button',{name:'Sign In',exact:true}).click();
  await page.getByText('Good to see you',{exact:false}).first().waitFor({timeout:15000});
  if(loginCount!==1||validReads<1||blockedCookieReads<1){
    throw new Error('Cookie-blocked login was not recovered with a bearer session: '+JSON.stringify({
      loginCount,validReads,blockedCookieReads,
    }));
  }
  if(errors.length)throw new Error('Post-login render errors: '+errors.join('\n'));
  console.log('PASS: login 200 + cookie-blocked /me 401 -> authenticated dashboard with bearer token');

  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByText('Good to see you',{exact:false}).first().waitFor({timeout:15000});
  if(loginCount!==1||validReads<2)throw new Error('Session was not restored after page reload');
  console.log('PASS: session restoration from tab-scoped storage without third-party cookies');

  await page.goto(origin+'/#/pay',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Final Pay Stubs',exact:true}).waitFor();
  await page.getByText('$104.33',{exact:false}).first().waitFor();
   await page.getByText('Available Sick Leave').waitFor();
  if(await page.locator('details').getAttribute('open')!==null)throw new Error('Preliminary calculations should be collapsed');
  const stubDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download Pay Stub',exact:true}).click();
  if((await stubDownload).suggestedFilename()!=='pay-stub.html')throw new Error('Final stub download failed');
  console.log('PASS: final recorded net pay and authenticated printable stub download');
  await page.goto(origin+'/#/leave',{waitUntil:'domcontentloaded'});
   await page.getByRole('heading',{name:'Request PTO',exact:true}).waitFor();
   const daysAhead=new Date(Date.now()+20*86400000).toISOString().slice(0,10);
   await page.locator('input[type="date"]').first().fill(daysAhead);
   await page.locator('input[type="number"]').fill('1.5');
   await page.getByRole('button',{name:'Submit PTO Request'}).click();
   await page.getByText('PTO request submitted for management review.').waitFor();
   if(!ptoSubmitted||ptoSubmitted.requestedHours!==1.5)throw new Error('PTO request was not sent correctly');
   console.log('PASS: authenticated PTO request submission and history');
   await page.goto(origin+'/#/profile',{waitUntil:'domcontentloaded'});
  await page.getByText('$19.00/hour').waitFor({timeout:15000});
  await page.getByRole('button',{name:'Sign Out'}).first().click();
  await page.getByRole('heading',{name:'Employee Sign In'}).waitFor({timeout:15000});
  if(logoutCount!==1)throw new Error('Revocable server logout was not called');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'Employee Sign In'}).waitFor({timeout:15000});
  if(errors.length)throw new Error('Browser errors: '+errors.join('\n'));
  console.log('PASS: server logout revokes session and clears browser session across refreshes');
 }finally{
  if(browser)await browser.close();
  server.kill('SIGTERM');
 }
}
run().then(()=>process.exit(0)).catch(e=>{console.error(e.stack);process.exit(1);});
