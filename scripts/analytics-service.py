"""Read Instagram insights through this Site only; credentials enter hidden stdin.
Never calls Meta, publishes content, grants scopes, or changes connections.
"""
import json,sys,time,termios,urllib.request,urllib.error,urllib.parse
previous=None
try:
 if sys.stdin.isatty():
  previous=termios.tcgetattr(sys.stdin.fileno());mode=termios.tcgetattr(sys.stdin.fileno());mode[3]&=~termios.ECHO;termios.tcsetattr(sys.stdin.fileno(),termios.TCSANOW,mode)
 print('Ready for analytics JSON on hidden stdin.',flush=True)
 data=json.loads(sys.stdin.readline())
finally:
 if previous is not None:termios.tcsetattr(sys.stdin.fileno(),termios.TCSANOW,previous)
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
try:
 url=urllib.parse.urlsplit(data['url'])
 if url.scheme!='https' or url.username or url.password or not url.hostname:raise ValueError()
 endpoint=urllib.parse.urlunsplit((url.scheme,url.netloc,'/api/analytics','',''))
 headers={'OAI-Sites-Authorization':'Bearer '+data['token'],'Authorization':'Bearer '+data['token'],'x-firma-service':'queue-v1','Content-Type':'application/json'}
 opener=urllib.request.build_opener(NoRedirect())
 def call(method,body=None):
  req=urllib.request.Request(endpoint+('?status=1' if method=='GET' else ''),data=json.dumps(body or {}).encode() if method=='POST' else None,headers=headers,method=method)
  with opener.open(req,timeout=90) as response:return json.load(response)
 def summary(status):
  accounts=status.get('accounts',[])
  return {'accounts':len(accounts),'due':status.get('work',{}).get('due'),'needsAuthorization':sum(a.get('status') in ['permission_required','authorization_required'] or not a.get('hasInsightsScope') for a in accounts),'temporary':sum(a.get('status')=='temporary' for a in accounts),'errors':sum(a.get('status')=='error' for a in accounts)}
 status=call('GET')
 if data.get('mode')=='status':print(json.dumps(summary(status)),flush=True)
 else:
  # Fair per-account turns; all provider calls are bounded, read-only and
  # checkpointed by the Site. One lost POST response ends this invocation.
  for step in range(200):
   now=time.time()*1000
   due=[a for a in status.get('accounts',[]) if a.get('state')=='connected' and a.get('nextSyncAt',0)<=now and (a.get('leaseUntil') or 0)<=now]
   if not due:break
   due.sort(key=lambda a:a.get('lastAttemptAt') or 0)
   result=call('POST',{'accountId':due[0]['id']})
   status=call('GET')
   saved=next((a for a in status.get('accounts',[]) if a['id']==result.get('accountId')),None)
   if not result.get('skipped') and (not saved or saved.get('lastAttemptAt')!=result.get('checkedAt')):raise ValueError()
   print(json.dumps({'verified':True,'step':step+1,'status':result.get('status'),'measured':result.get('measured',0),'more':result.get('more',False)}),flush=True)
   if result.get('skipped'):break
  print(json.dumps({'verified':True,'summary':summary(status)}),flush=True)
except urllib.error.HTTPError as e:
 print(json.dumps({'verified':False,'httpStatus':e.code,'error':'Analytics request rejected; no automatic retry.'}),flush=True);sys.exit(1)
except Exception:
 print(json.dumps({'verified':False,'error':'Analytics result unknown. Read persisted status before another POST; active leases and cooldowns must be respected.'}),flush=True);sys.exit(1)
