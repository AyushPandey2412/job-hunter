import html,json,secrets
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import parse_qs
from app import connect,import_jobs,set_questions,update_answer,transition,sync

def serve(db,port):
 token=secrets.token_urlsafe(32);esc=html.escape
 def hidden(action,id=''):return f'<input type="hidden" name="token" value="{token}"><input type="hidden" name="action" value="{action}"><input type="hidden" name="id" value="{id}">'
 class Handler(BaseHTTPRequestHandler):
  def log_message(self,*args):pass
  def send(self,body,status=200):
   self.send_response(status);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");self.end_headers()
   self.wfile.write(('<!doctype html><meta charset="utf-8"><title>JobHunter Review</title><style>body{font:16px system-ui;max-width:1000px;margin:30px auto;padding:20px;background:#f4f6fa}article{background:white;padding:20px;margin:18px 0;border-radius:10px}textarea{width:95%;min-height:65px}button{padding:9px;margin:5px}small{color:#555}</style><h1>JobHunter Application Review</h1><p>Mumbai/Pune · Local answer bank · Manual final submission</p>'+body).encode())
  def valid(self):return self.headers.get('Host') in [f'127.0.0.1:{port}',f'localhost:{port}']
  def do_GET(self):
   if not self.valid():return self.send('Invalid host',403)
   if self.path!='/':return self.send('Not found',404)
   body=f'<form method="post">{hidden("sync")}<button>Import up to 1,000 Node JobHunter jobs</button></form><form method="post">{hidden("import")}<h3>Import job JSON</h3><textarea name="jobs"></textarea><button>Import and filter</button></form>'
   with connect(db) as c:rows=c.execute('SELECT * FROM queue ORDER BY rowid DESC').fetchall()
   for r in rows:
    j=json.loads(r['job']);fit=json.loads(r['fit']);qs=json.loads(r['questions']);url=j.get('url') or j.get('job_url')
    body+=f'<article><h2>{esc(j.get("title",""))}</h2><p>{esc(j.get("company_name") or j.get("company", ""))} · {esc(j.get("location",""))} · <b>{esc(r["state"])}</b></p><p>{esc("; ".join(fit["reasons"]))}</p><p>Recommended: Ayush_Resume_{esc(fit["resume"])}.pdf — verify before upload</p><a href="{esc(url,quote=True)}" target="_blank" rel="noopener noreferrer">Open employer application manually</a>'
    if r['state']!='submitted':
     body+=f'<form method="post">{hidden("questions",r["id"])}<p>Paste questions one per line. Changing them revokes readiness.</p><textarea name="questions">{esc(chr(10).join(q["question"] for q in qs))}</textarea><button>Prepare suggestions</button></form>'
     for i,q in enumerate(qs):
      body+=f'<form method="post">{hidden("answer",r["id"])}<input type="hidden" name="index" value="{i}"><p><b>{esc(q["question"])}</b> · {"Approved" if q["approved"] else "Review required"}</p><small>{esc(q["source"])}</small><textarea name="value" required>{esc(q["answer"])}</textarea><button>Save and approve this answer</button></form>'
     if r['state']!='excluded':body+=f'<form method="post">{hidden("ready",r["id"])}<label><input type="checkbox" name="reviewed" required>I checked all mandatory requirements, resume and answers</label><button>Mark ready for manual application</button></form>'
     if r['state'] in ['ready','submission_uncertain']:
      body+=f'<form method="post">{hidden("submitted",r["id"])}<p>Paste successful application reference/confirmation URL:</p><textarea name="proof" required></textarea><label><input type="checkbox" name="confirmed" required>I saw successful confirmation</label><button>Record submission</button></form>'
     if r['state']=='ready':body+=f'<form method="post">{hidden("uncertain",r["id"])}<button>Submission uncertain — check before retry</button></form>'
    if r['proof']:body+='<p>Confirmation: '+esc(r['proof'])+'</p>'
    body+='</article>'
   self.send(body)
  def do_POST(self):
   if not self.valid() or self.headers.get('Origin') not in [None,f'http://localhost:{port}',f'http://127.0.0.1:{port}']:return self.send('Cross-site request blocked',403)
   try:
    n=int(self.headers.get('Content-Length','0'))
    if n>1000000:return self.send('Import too large',413)
    f=parse_qs(self.rfile.read(n).decode());get=lambda k:f.get(k,[''])[0]
    if not secrets.compare_digest(get('token'),token):return self.send('Reload page',403)
    with connect(db) as c:
     action=get('action');id=get('id')
     if action=='sync':sync(c,'http://127.0.0.1:3000')
     elif action=='import':
      data=json.loads(get('jobs'));import_jobs(c,data if isinstance(data,list) else data['jobs'])
     elif action=='questions':set_questions(c,id,[q.strip() for q in get('questions').splitlines() if q.strip()])
     elif action=='answer':update_answer(c,id,int(get('index')),get('value'))
     elif action=='ready':transition(c,id,'ready',reviewed=bool(get('reviewed')))
     elif action=='submitted':transition(c,id,'submitted',get('proof'),bool(get('confirmed')))
     elif action=='uncertain':transition(c,id,'submission_uncertain')
     else:raise ValueError('Unknown action')
    self.send_response(303);self.send_header('Location','/');self.end_headers()
   except Exception as ex:self.send(esc(str(ex))+' <a href="/">Back</a>',400)
 print(f'Open http://127.0.0.1:{port}',flush=True);ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
