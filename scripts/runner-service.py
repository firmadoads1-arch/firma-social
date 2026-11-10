"""Run only the approved queue using Site service access supplied on hidden stdin.
Python 3; the credential is never an argument, file, URL or printed value.
"""
import json,sys,time,termios,urllib.request,urllib.error,urllib.parse
previous=None
try:
 if sys.stdin.isatty():
  previous=termios.tcgetattr(sys.stdin.fileno());mode=termios.tcgetattr(sys.stdin.fileno());mode[3]&=~termios.ECHO;termios.tcsetattr(sys.stdin.fileno(),termios.TCSANOW,mode)
 print('Ready for runner JSON on hidden stdin.',flush=True)
 data=json.loads(sys.stdin.readline())
finally:
 if previous is not None:termios.tcsetattr(sys.stdin.fileno(),termios.TCSANOW,previous)
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
try:
 url=urllib.parse.urlsplit(data['url'])
 if url.scheme!='https' or url.username or url.password or not url.hostname:raise ValueError()
 endpoint=urllib.parse.urlunsplit((url.scheme,url.netloc,'/api/runner','',''))
 headers={'OAI-Sites-Authorization':'Bearer '+data['token'],'Authorization':'Bearer '+data['token'],'x-firma-service':'queue-v1','Content-Type':'application/json'}
 opener=urllib.request.build_opener(NoRedirect())
 def call(method):
  req=urllib.request.Request(endpoint,data=b'{}' if method=='POST' else None,headers=headers,method=method)
  with opener.open(req,timeout=65) as response:return json.load(response)
 def verified_step():
  result=call('POST');status=call('GET')
  if status.get('lastRun',{}).get('checkedAt')!=result.get('checkedAt'):raise ValueError()
  print(json.dumps({'verified':True,'lastRun':status['lastRun'],'queue':status.get('queue')}),flush=True)
  return status.get('queue') or {}
 if data.get('mode')=='status':print(json.dumps(call('GET')),flush=True)
 elif data.get('mode')=='watch':
  # Optional dedicated host. State gates all work; unknown writes stop the process.
  while True:
   status=call('GET');queue=status.get('queue') or {};due=queue.get('nextCheckAt')
   if due and due<=time.time()*1000:
    queue=verified_step();due=queue.get('nextCheckAt')
   time.sleep(min(15,max(2,(due-time.time()*1000)/1000+.25)) if due else 15)
 elif data.get('mode','run')=='run':
  for step in range(5):
   queue=verified_step();next_at=queue.get('nextCheckAt')
   if not (queue.get('processing') or queue.get('batchSoon')) or not next_at:break
   delay=max(1,(next_at-time.time()*1000)/1000+1)
   if step==4 or delay>61:break
   time.sleep(delay)
 else:raise ValueError()
except urllib.error.HTTPError as e:
 print(json.dumps({'verified':False,'httpStatus':e.code,'error':'Runner request rejected; no automatic retry.'}),flush=True);sys.exit(1)
except Exception:
 print(json.dumps({'verified':False,'error':'Execution or readback not confirmed; inspect status before another POST.'}),flush=True);sys.exit(1)
