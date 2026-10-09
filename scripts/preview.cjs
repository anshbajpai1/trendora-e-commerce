const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon'};
http.createServer((req,res)=>{
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end('Invalid URL');}
 const segments=pathname.split('/');
 if(segments.some(segment=>segment.startsWith('.')||['trendora-backend','supabase','tests','scripts'].includes(segment))){res.writeHead(403);return res.end('Forbidden');}
 const name=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!name.startsWith(root+path.sep)||!mime[path.extname(name)]){res.writeHead(404);return res.end('Not found');}
 fs.readFile(name,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}res.setHeader('Content-Type',mime[path.extname(name)]);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(data);});
}).listen(Number(process.env.PORT||4390),'127.0.0.1',()=>console.log('Trendora preview: http://127.0.0.1:'+(process.env.PORT||4390)));
