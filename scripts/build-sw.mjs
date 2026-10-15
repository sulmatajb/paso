import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
async function walk(dir) {
  const files = [];
  for (const file of await readdir(dir, { withFileTypes: true })) {
    const name = `${dir}/${file.name}`;
    if (file.isDirectory()) files.push(...(await walk(name)));
    else files.push(name);
  }
  return files;
}
const files = (await walk('dist/client'))
  .filter(
    (f) => /\.(js|css|woff2|svg)$/.test(f) && !f.includes('/asr-runtime/') && !f.endsWith('/sw.js'),
  )
  .map((f) => f.replace('dist/client', ''));
const version = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 12);
const source = `const SHELL='paso-shell-${version}';
const FILES=${JSON.stringify([...files, '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'])};
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(SHELL);await cache.addAll(FILES);const response=await fetch('/',{cache:'reload'});if(response.ok)await cache.put('/',response);})()));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('paso-shell-')&&name!==SHELL)await caches.delete(name);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||['/signin-with-chatgpt','/signout-with-chatgpt','/callback'].includes(url.pathname))return;
 if(request.mode==='navigate'&&url.pathname==='/'){event.respondWith((async()=>{try{const response=await fetch(request);if(response.ok)await (await caches.open(SHELL)).put('/',response.clone()).catch(()=>{});return response;}catch{return await (await caches.open(SHELL)).match('/')||Response.error();}})());return;}
 if(url.pathname.startsWith('/audio/')&&url.pathname.endsWith('.mp3')){event.respondWith((async()=>{try{const cache=await caches.open('paso-audio-v2');let response=await cache.match(url.href);if(!response){response=await fetch(new Request(url.href));if(response.ok&&response.status===200)await cache.put(url.href,response.clone());}const range=request.headers.get('range');if(!range||response.status!==200)return response;const bytes=await response.arrayBuffer(),match=/bytes=(\\d*)-(\\d*)/.exec(range);if(!match)return new Response(null,{status:416});const start=match[1]?Number(match[1]):Math.max(0,bytes.byteLength-Number(match[2]));const end=match[1]&&match[2]?Math.min(Number(match[2]),bytes.byteLength-1):bytes.byteLength-1;if(start>end||start>=bytes.byteLength)return new Response(null,{status:416});return new Response(bytes.slice(start,end+1),{status:206,headers:{'Content-Type':'audio/mpeg','Content-Range':'bytes '+start+'-'+end+'/'+bytes.byteLength,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'}});}catch{return new Response('Audio is unavailable offline',{status:503,headers:{'Cache-Control':'no-store'}});}})());return;}
 if(FILES.includes(url.pathname))event.respondWith((async()=>{try{return await (await caches.open(SHELL)).match(request)||await fetch(request);}catch{return Response.error();}})());
});`;
await writeFile('dist/client/sw.js', source);
console.log(`Prepared offline shell ${version} (${files.length} assets).`);
