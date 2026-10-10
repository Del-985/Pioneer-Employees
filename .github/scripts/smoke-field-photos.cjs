const { chromium } = require('playwright');
const { spawn } = require('node:child_process');

const origin = 'http://127.0.0.1:4173';
const jobId = '44444444-4444-4444-8444-444444444444';
const employeeId = '22222222-2222-4222-8222-222222222222';
const photoId = '99999999-9999-4999-8999-999999999999';
const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/jF8AAAAASUVORK5CYII=',
  'base64'
);
const jsonHeaders = {
  'content-type': 'application/json',
  'access-control-allow-origin': origin,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
};

async function run() {
  const preview = spawn('npm', ['run', 'preview', '--', '--host','127.0.0.1','--port','4173'], {
    stdio: ['ignore','pipe','pipe'],
  });
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    let uploadBody = null;
    let uploaded = false;
    let confirmed = false;
    const errors = [];
    page.on('pageerror', err => errors.push(err.stack || err.message));
    await page.route('https://api.pioneerlegacyworks.com/**', async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (req.method() === 'OPTIONS') {
        await route.fulfill({status: 204, headers: jsonHeaders});return;
      }
      let data = {data:[]};
      if(path === '/api/employee/me') {
        data = {data:{user:{id:'11111111-1111-4111-8111-111111111111',email:'worker@example.com',
          displayName:'Worker One'},employment:[{id:employeeId,
            businessUnitId:'33333333-3333-4333-8333-333333333333',
            displayName:'Worker One',businessName:'Pioneer Outdoor Services'}]}};
      } else if(path === '/api/employee/jobs') {
        data = {data:[{id:jobId,title:'Test Snow Clearing',workOrderNumber:'POS-PHOTO',
          status:'scheduled',customerName:'Example Customer'}]};
      } else if(path === '/api/employee/jobs/'+jobId) {
        data = {data:{id:jobId,title:'Test Snow Clearing',workOrderNumber:'POS-PHOTO',
          status:'scheduled',customerName:'Example Customer'}};
      } else if(path === '/api/employee/jobs/'+jobId+'/report') {
        data = {data:null};
      } else if(path === '/api/employee/capabilities') {
        data = {data:{photoUploads:true,photoStorage:'database'}};
      } else if(path === '/api/employee/jobs/'+jobId+'/photos') {
        data = {data: uploaded ? [{
          id:photoId,kind:'before',downloadUrl:'/api/employee/photos/'+photoId+'/content',
          storageProvider:'database',
        }] : []};
      } else if(path === '/api/employee/jobs/'+jobId+'/photos/upload-intent') {
        const intent = JSON.parse(req.postData() || '{}');
        if(intent.kind !== 'before' || intent.contentType !== 'image/png' || intent.byteSize !== image.length) {
          throw new Error('Unexpected photo intent: '+JSON.stringify(intent));
        }
        data = {data:{id:photoId,storageProvider:'database',
          uploadPath:'/api/employee/photos/'+photoId+'/content',
          uploadMethod:'POST',uploadUrl:null,requiredContentType:'application/octet-stream'}};
      } else if(path === '/api/employee/photos/'+photoId+'/content' && req.method() === 'POST') {
        if(req.headers()['content-type'] !== 'application/octet-stream') {
          throw new Error('Expected binary upload content type');
        }
        uploadBody = req.postDataBuffer();
        if(!uploadBody.equals(image)) throw new Error('Uploaded bytes do not match the camera photo');
        uploaded = true;
        data = {data:{id:photoId,uploaded:true}};
      } else if(path === '/api/employee/photos/'+photoId+'/content' && req.method() === 'GET') {
        await route.fulfill({status:200,body:image,headers:{
          'Content-Type':'image/png','Cache-Control':'private, no-store',
          'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true',
        }});
        return;
      } else if(path === '/api/employee/photos/'+photoId+'/complete') {
        if(!uploaded)throw new Error('Confirmed before binary content reached the API');
        confirmed = true;
        data = {data:{id:photoId,uploaded:true}};
      }
      await route.fulfill({status:200,headers:jsonHeaders,body:JSON.stringify(data)});
    });
    await page.goto(origin+'/#/jobs/'+jobId,{waitUntil:'domcontentloaded'});
    await page.getByText('Job Photographs').waitFor({timeout:15000});
    const picker = page.locator('input[type=file]');
    await picker.setInputFiles({name:'driveway.png',mimeType:'image/png',buffer:image});
    await page.getByRole('button',{name:'Upload Photo'}).click();
    await page.getByText('Photo uploaded.',{exact:false}).waitFor({timeout:15000});
    if(!uploadBody||!confirmed)throw new Error('Binary upload and confirmation did not complete');
    const thumbnail=page.getByAltText('before photo for Test Snow Clearing');
    await thumbnail.waitFor({timeout:5000});
    await page.waitForFunction(() => {
      const img = document.querySelector('img[alt="before photo for Test Snow Clearing"]');
      return img && img.complete && img.naturalWidth > 0;
    },{timeout:10000});
    if(errors.length)throw new Error('Browser errors: '+errors.join('\\n'));
    console.log('PASS: employee v0.2 photo intent, binary upload, confirmation and authenticated thumbnail');
  } finally {
    if(browser)await browser.close();
    preview.kill('SIGTERM');
  }
}
run().then(()=>process.exit(0)).catch(err=>{console.error(err.stack);process.exit(1)});
