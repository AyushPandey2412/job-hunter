import unittest,datetime,json
from app import *
class Tests(unittest.TestCase):
 def setUp(self):self.c=connect(':memory:');self.j=dict(title='Frontend Developer',location='Mumbai',url='https://example.com/job/1',description='Required React and TypeScript; minimum 1 year experience developing applications.',detailsComplete=True)
 def test_eligibility(self):
  d=datetime.date(2026,10,24)
  self.assertEqual(evaluate(self.j,d)['status'],'eligible')
  for patch in [dict(location='Bengaluru'),dict(description='Required .NET and React; minimum 1 year experience'),dict(description='React; experience: 3 years'),dict(title='Senior React Developer')]:self.assertEqual(evaluate(dict(self.j,**patch),d)['status'],'excluded')
  self.assertEqual(evaluate(dict(self.j,description='React applications'),d)['status'],'needs_review')
 def test_no_guess(self):self.assertEqual(suggest('Years of React experience?')['answer'],'');self.assertFalse(suggest('Email address')['approved'])
 def test_state_machine(self):
  self.assertEqual(import_jobs(self.c,[self.j,self.j]),1);id=self.c.execute('SELECT id FROM queue').fetchone()[0]
  set_questions(self.c,id,['Email address','Years of React experience?'])
  with self.assertRaises(ValueError):transition(self.c,id,'ready',reviewed=True)
  update_answer(self.c,id,0,'ayushpandey5248@gmail.com');update_answer(self.c,id,1,'User-confirmed answer')
  transition(self.c,id,'ready',reviewed=True)
  with self.assertRaises(ValueError):transition(self.c,id,'submitted',reviewed=True)
  transition(self.c,id,'submission_uncertain');transition(self.c,id,'submitted','APP-123',True)
  with self.assertRaises(ValueError):update_answer(self.c,id,0,'changed')
 def test_edits_revoke_ready(self):
  import_jobs(self.c,[self.j]);id=self.c.execute('SELECT id FROM queue').fetchone()[0];transition(self.c,id,'ready',reviewed=True);set_questions(self.c,id,['Name']);self.assertEqual(self.c.execute('SELECT state FROM queue').fetchone()[0],'needs_answer')
if __name__=='__main__':unittest.main()
