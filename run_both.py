"""Run both apps in this console; Ctrl+C stops both. Does not submit applications."""
import os,shutil,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parent
node=shutil.which('node') or str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
env=os.environ.copy()
if not (root/'node_modules').exists():
 existing=Path.home()/'OneDrive/Desktop/Scraper 1/Scraper/JobHunter/node_modules'
 if not existing.exists():raise SystemExit('Run npm ci inside JobHunter first.')
 env['NODE_PATH']=str(existing)
env['PORT']='3000'
env['OUTREACH_AUTO_SEND']='false'
children=[]
try:
 children.append(subprocess.Popen([node,'index.js'],cwd=root,env=env))
 children.append(subprocess.Popen([sys.executable,'app.py','serve','--port','8765'],cwd=root/'python',env=env))
 print('Node: http://localhost:3000 | Python: http://127.0.0.1:8765',flush=True)
 print('Ctrl+C stops both. Watch output for startup errors.',flush=True)
 while all(p.poll() is None for p in children):
  try:children[0].wait(timeout=1)
  except subprocess.TimeoutExpired:pass
except KeyboardInterrupt:pass
finally:
 for p in children:
  if p.poll() is None:p.terminate()
 for p in children:
  try:p.wait(timeout=10)
  except subprocess.TimeoutExpired:p.kill()
