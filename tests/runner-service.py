"""Run the actual service helper with a fake HTTP transport; never publish."""
import contextlib,io,json,runpy,time,unittest
from unittest.mock import patch
class Response(io.BytesIO):
 def __enter__(self):return self
 def __exit__(self,*args):self.close()
class RunnerTests(unittest.TestCase):
 def exercise(self,queue,uncertain=False,mismatch=False):
  methods=[];clock=[1000.0]
  class Transport:
   def open(self,req,timeout):
    method=req.get_method();methods.append(method)
    if method=='POST' and uncertain:raise TimeoutError('unknown response')
    body={'checkedAt':'confirmed','processed':1,'drafted':0} if method=='POST' else {'lastRun':{'checkedAt':'other' if mismatch else 'confirmed'},'queue':queue}
    return Response(json.dumps(body).encode())
  output=io.StringIO();code=0
  with patch('sys.stdin',io.StringIO(json.dumps({'url':'https://firma.test','token':'fake-test-only','mode':'run'})+'\n')),patch('urllib.request.build_opener',return_value=Transport()),patch('time.time',side_effect=lambda:clock[0]),patch('time.sleep',side_effect=lambda s:clock.__setitem__(0,clock[0]+s)),contextlib.redirect_stdout(output):
   try:runpy.run_path('scripts/runner-service.py',run_name='__main__')
   except SystemExit as e:code=e.code
  self.assertNotIn('fake-test-only',output.getvalue())
  return methods,code,output.getvalue()
 def test_pending_only_continues_within_five_steps(self):
  methods,code,out=self.exercise({'pending':31,'processing':0,'working':0,'batchSoon':0,'nextCheckAt':999000})
  self.assertEqual(code,0);self.assertEqual(methods,['POST','GET']*5);self.assertEqual(out.count('"verified": true'),5)
 def test_future_work_is_not_forced(self):
  methods,code,_=self.exercise({'pending':1,'processing':0,'working':0,'nextCheckAt':99999999})
  self.assertEqual(code,0);self.assertEqual(methods,['POST','GET'])
 def test_lost_response_stops_without_replay(self):
  methods,code,_=self.exercise({},uncertain=True);self.assertEqual(code,1);self.assertEqual(methods,['POST'])
 def test_wrong_heartbeat_stops_without_replay(self):
  methods,code,_=self.exercise({'pending':31,'nextCheckAt':999000},mismatch=True);self.assertEqual(code,1);self.assertEqual(methods,['POST','GET'])
if __name__=='__main__':unittest.main()
