"""Independent local application queue. No automated external submissions."""
import argparse,datetime,hashlib,json,re,sqlite3,os
from pathlib import Path
from urllib.request import urlopen,Request
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parent
PROFILE=Path(os.environ.get('JOBHUNTER_PROFILE',str(ROOT/'profile.local.json')))
ANSWERS=json.loads(PROFILE.read_text(encoding='utf-8')) if PROFILE.exists() else {}
ALIASES={'name':'full name','email address':'email','phone number':'phone','current location':'current city','current ctc':'current annual ctc','expected ctc':'expected annual ctc'}
def months(today=None):
 d=today or datetime.date.today();return max(0,(d.year-2025)*12+d.month-9)
def suggest(q):
 key=re.sub(r'[^a-z0-9 ]','',q.lower()).strip();key=ALIASES.get(key,key)
 if key in ['total experience','total professional experience']:
  m=months();return dict(question=q,answer=f'{m//12} years {m%12} months',source='September 2025 start; month precision',approved=False)
 return dict(question=q,answer=ANSWERS.get(key,''),source='User-confirmed profile' if key in ANSWERS else 'Unknown: user must answer; no guessing',approved=False)
def evaluate(job,today=None):
 title=job.get('title','');loc=job.get('location','');text=re.sub(r'<[^>]*>',' ',job.get('description_snippet') or job.get('snippet') or job.get('description') or '')
 required=job.get('requiredQualifications') or re.split(r'preferred qualifications|nice.to.have|preferred experience',text,flags=re.I)[0]
 core=r'\b(javascript|typescript|react(?:js)?|nextjs|nodejs)\b|\b(node|react|next)\.js\b'
 bad=r'\b(java(?!\s*script)|spring(?:boot)?|csharp)\b|(?:^|[^a-z0-9])(?:\.net|c#)(?=$|[^a-z0-9])'
 reasons=[]
 if re.search(r'\b(senior|sr|staff|principal|lead|architect|director|manager|head|vp)\b|\b(sde|engineer)\s*[- ]?(ii|iii|iv|[2-9])\b',title,re.I):reasons.append('Seniority outside junior target')
 if not re.search(r'\b(mumbai|pune|thane|navi mumbai)\b',loc,re.I):reasons.append('Location outside Mumbai/Pune and Mumbai metro')
 if re.search(bad,title,re.I):reasons.append('Primary Java/.NET/C# stack')
 minimum=None
 for clause in re.split(r'[;\n]|(?<=[a-z])\.\s+',required):
  optional=re.search(r'preferred|optional|nice.to.have',clause,re.I)
  if not optional and re.search(bad,clause,re.I) and not (re.search(r'\bor\b',clause,re.I) and re.search(core,clause,re.I)):reasons.append('Required Java/.NET/C# stack')
  if optional or not re.search(r'experience|minimum|at least|required|must have',clause,re.I):continue
  for m in re.finditer(r'\b(\d+(?:\.\d+)?)\s*(?:[-–—]|to)?\s*(\d+(?:\.\d+)?)?\s*\+?\s*(?:years?|yrs?)\b',clause,re.I):minimum=max(minimum or 0,float(m[1]))
 if minimum is not None and minimum>months(today)/12:reasons.append('Required experience exceeds dated experience')
 if not re.search(core,title+' '+required,re.I):reasons.append('No core JS/TS/React/Node evidence')
 resume='Full_Stack' if re.search(r'full.?stack|mern',title,re.I) else 'Frontend' if re.search(r'front.?end|react|next',title,re.I) else 'Backend' if re.search(r'back.?end|node',title,re.I) else 'Full_Stack'
 status='excluded' if reasons else 'needs_review' if minimum is None or len(required)<40 or job.get('detailsComplete') is False else 'eligible'
 return dict(status=status,reasons=reasons or ['Verify all requirements on employer page'],resume=resume)
def connect(path):
 c=sqlite3.connect(path);c.row_factory=sqlite3.Row;c.execute('CREATE TABLE IF NOT EXISTS queue(id TEXT PRIMARY KEY,job TEXT,fit TEXT,state TEXT,questions TEXT,proof TEXT)');return c
def import_jobs(c,jobs):
 count=0
 for j in jobs:
  url=j.get('job_url') or j.get('url') or ''
  if urlparse(url).scheme not in ['http','https']:continue
  key=hashlib.sha256(url.encode()).hexdigest()[:20];fit=evaluate(j)
  c.execute('INSERT OR IGNORE INTO queue VALUES(?,?,?,?,?,?)',(key,json.dumps(j),json.dumps(fit),'draft' if fit['status']=='eligible' else fit['status'],'[]',''));count+=c.execute('SELECT changes()').fetchone()[0]
 c.commit();return count
def collect(provider,board):
 if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',board):raise ValueError('Invalid board token')
 url=f'https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true' if provider=='greenhouse' else f'https://api.lever.co/v0/postings/{board}?mode=json'
 with urlopen(Request(url,headers={'User-Agent':'JobHunterPersonalReview/1.0'}),timeout=20) as r:data=json.load(r)
 jobs=[]
 for j in data.get('jobs',[]) if provider=='greenhouse' else data:
  if provider=='greenhouse':jobs.append(dict(title=j['title'],company=board,url=j['absolute_url'],location=j.get('location',{}).get('name',''),description=j.get('content',''),detailsComplete=True))
  else:jobs.append(dict(title=j['text'],company=board,url=j['hostedUrl'],location=j.get('categories',{}).get('location',''),description=j.get('descriptionPlain','')+' '+' '.join(x.get('content','') for x in j.get('lists',[])),detailsComplete=True))
 return jobs

def set_questions(c,id,questions):
 r=c.execute('SELECT * FROM queue WHERE id=?',(id,)).fetchone()
 if not r or r['state']=='submitted':raise ValueError('Missing or submitted job')
 qs=[suggest(q) for q in questions];state='excluded' if json.loads(r['fit'])['status']=='excluded' else 'needs_answer' if any(not q['answer'] for q in qs) else 'draft'
 c.execute('UPDATE queue SET questions=?,state=? WHERE id=?',(json.dumps(qs),state,id));c.commit();return qs

def update_answer(c,id,index,value):
 r=c.execute('SELECT * FROM queue WHERE id=?',(id,)).fetchone()
 if not r or r['state']=='submitted' or not value.strip():raise ValueError('Missing/submitted job or empty answer')
 qs=json.loads(r['questions']);qs[index].update(answer=value,source='Explicit user answer',approved=True)
 state='excluded' if json.loads(r['fit'])['status']=='excluded' else 'needs_answer' if any(not q['answer'] for q in qs) else 'draft'
 c.execute('UPDATE queue SET questions=?,state=? WHERE id=?',(json.dumps(qs),state,id));c.commit()

def transition(c,id,state,proof='',reviewed=False):
 r=c.execute('SELECT * FROM queue WHERE id=?',(id,)).fetchone()
 if not r:raise ValueError('Missing job')
 if state=='ready':
  if r['state'] in ['excluded','submitted','submission_uncertain'] or not reviewed:raise ValueError('Explicit eligibility/resume/answer review required')
  if any(not q['answer'] or not q['approved'] for q in json.loads(r['questions'])):raise ValueError('Approve every answer first')
 elif state=='submitted':
  if r['state'] not in ['ready','submission_uncertain'] or not reviewed or len(proof.strip())<4:raise ValueError('Successful confirmation/reference required')
 elif state=='submission_uncertain':
  if r['state']!='ready':raise ValueError('Invalid transition')
 else:raise ValueError('Unsupported state')
 c.execute('UPDATE queue SET state=?,proof=? WHERE id=?',(state,proof,id));c.commit()

def sync(c,node):
 u=urlparse(node)
 if u.scheme!='http' or u.hostname not in ['127.0.0.1','localhost']:raise ValueError('Node URL must be local HTTP')
 with urlopen(node.rstrip('/')+'/api/jobs?limit=1000',timeout=15) as r:payload=json.load(r)
 return import_jobs(c,payload['jobs'])

def main():
 p=argparse.ArgumentParser();p.add_argument('--db',default=str(ROOT/'applications.sqlite'));sub=p.add_subparsers(dest='command',required=True)
 s=sub.add_parser('serve');s.add_argument('--port',type=int,default=8765)
 s=sub.add_parser('sync');s.add_argument('--node-url',default='http://127.0.0.1:3000')
 s=sub.add_parser('collect');s.add_argument('provider',choices=['greenhouse','lever']);s.add_argument('board')
 s=sub.add_parser('import');s.add_argument('file')
 sub.add_parser('list');s=sub.add_parser('show');s.add_argument('id')
 s=sub.add_parser('questions');s.add_argument('id');s.add_argument('file')
 s=sub.add_parser('answer');s.add_argument('id');s.add_argument('index',type=int);s.add_argument('value')
 s=sub.add_parser('ready');s.add_argument('id');s.add_argument('--reviewed',action='store_true')
 s=sub.add_parser('submitted');s.add_argument('id');s.add_argument('--proof',required=True);s.add_argument('--confirmed',action='store_true')
 s=sub.add_parser('uncertain');s.add_argument('id');a=p.parse_args()
 if a.command=='serve':
  from dashboard import serve
  return serve(a.db,a.port)
 with connect(a.db) as c:
  if a.command=='sync':print('Imported',sync(c,a.node_url))
  elif a.command in ['collect','import']:
   payload=collect(a.provider,a.board) if a.command=='collect' else json.loads(Path(a.file).read_text(encoding='utf-8-sig'));print('Imported',import_jobs(c,payload if isinstance(payload,list) else payload['jobs']))
  elif a.command=='list':
   for r in c.execute('SELECT * FROM queue'):
    j=json.loads(r['job']);print(r['id'],r['state'],j.get('title'),j.get('location'))
  elif a.command=='show':
   r=c.execute('SELECT * FROM queue WHERE id=?',(a.id,)).fetchone()
   if not r:raise ValueError('Job not found')
   print(json.dumps(dict(r),indent=2))
  elif a.command=='questions':print(json.dumps(set_questions(c,a.id,[q.strip() for q in Path(a.file).read_text(encoding='utf-8-sig').splitlines() if q.strip()]),indent=2))
  elif a.command=='answer':update_answer(c,a.id,a.index,a.value)
  elif a.command=='ready':transition(c,a.id,'ready',reviewed=a.reviewed)
  elif a.command=='submitted':transition(c,a.id,'submitted',a.proof,a.confirmed)
  elif a.command=='uncertain':transition(c,a.id,'submission_uncertain')
if __name__=='__main__':main()
