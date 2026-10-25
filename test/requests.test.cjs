// Game requests: a real server on a spare port with throwaway files. Sending, checks, the hourly limit, and the password-protected developer page.
const {spawn} = require('child_process'), os = require('os'), fs = require('fs'), path = require('path'), assert = require('assert');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playroom-req-')), port = 30000 + Math.floor(Math.random() * 20000), KEY = 'test-key-123';
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {env:{...process.env, PORT:String(port), ADMIN_KEY:KEY,
  DATA_FILE:path.join(dir, 'tables.json'), REQUESTS_FILE:path.join(dir, 'requests.json'), GITHUB_TOKEN:'', GITHUB_REPO:''}, stdio:['ignore', 'pipe', 'inherit']});
const url = p => `http://localhost:${port}${p}`;
const post = (body, ip = '1.1.1.1') => fetch(url('/api/requests'), {method:'POST', headers:{'content-type':'application/json', 'x-forwarded-for':ip}, body:JSON.stringify(body)});
const auth = pass => ({authorization:'Basic ' + Buffer.from('dev:' + pass).toString('base64')});
(async () => {
  await new Promise((ok, fail) => { srv.stdout.on('data', d => /running/.test(d) && ok()); srv.on('exit', c => fail(new Error('server exited ' + c))); });
  let r = await post({game:'Ludo', players:'2–4', name:'Asha', details:'Classic rules\nsafe squares <b>on</b>'});
  assert.strictEqual(r.status, 200);
  r = await post({game:' '}); assert.strictEqual(r.status, 400, 'a name is required');
  r = await fetch(url('/api/requests'), {method:'POST', body:'not json'}); assert.strictEqual(r.status, 400);
  r = await post({game:'x'.repeat(5000)}); assert.strictEqual(r.status, 400, 'oversized bodies are refused');
  for (const g of ['ludo', 'Carrom', 'LUDO ']) assert.strictEqual((await post({game:g}, '2.2.2.2')).status, 200);
  r = await post({game:'Ludo'}, '2.2.2.2'); assert.strictEqual(r.status, 200);
  r = await post({game:'Ludo'}, '2.2.2.2'); assert.strictEqual(r.status, 200);
  r = await post({game:'Ludo'}, '2.2.2.2'); assert.strictEqual(r.status, 429, 'five an hour from one place');
  // the developer page
  assert.strictEqual((await fetch(url('/admin/requests'))).status, 401, 'needs the password');
  assert.strictEqual((await fetch(url('/admin/requests'), {headers:auth('wrong')})).status, 401);
  r = await fetch(url('/admin/requests'), {headers:auth(KEY)});
  assert.strictEqual(r.status, 200);
  const page = await r.text();
  assert(page.includes('Most wanted') && page.includes('Carrom'));
  assert(page.includes('&lt;b&gt;on&lt;/b&gt;') && !page.includes('<b>on</b>'), 'what players type is escaped');
  assert(/<td class="n">5<\/td><td>Ludo<\/td>/.test(page), 'Ludo, ludo, LUDO are counted together');
  const list = await (await fetch(url('/admin/requests.json'), {headers:auth(KEY)})).json();
  assert.strictEqual(list.length, 6); assert.strictEqual(list[0].players, '2–4'); assert.strictEqual(list[0].details, 'Classic rules\nsafe squares <b>on</b>');
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'requests.json'), 'utf8')).length, 6, 'saved to the file');
  console.log('ok: game requests — sending, checks, hourly limit, developer page and JSON verified');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { srv.kill(); fs.rmSync(dir, {recursive:true, force:true}); });
