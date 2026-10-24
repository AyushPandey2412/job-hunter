(() => {
  document.getElementById('matchQuality').addEventListener('change', () => loadJobs());
  const dialog = document.createElement('dialog');
  dialog.className = 'outreach-dialog';
  dialog.innerHTML = `<form method="dialog"><button class="btn btn-secondary outreach-close" aria-label="Close recruiter tools">Close</button></form>
    <h2 id="outreachTitle">Find recruiter</h2>
    <p id="outreachStatus" role="status"></p>
    <div class="outreach-links"><a id="recruiterLinkedin" target="_blank" rel="noopener noreferrer">Search LinkedIn recruiters</a> · <a id="recruiterWeb" target="_blank" rel="noopener noreferrer">Search public profiles</a></div>
    <button type="button" class="btn btn-secondary" id="lookupRecruiter">Find public HR work emails</button>
    <p class="helper-text">Company HR contacts may not handle this vacancy. Published emails are shown with their source; unverified means deliverability is unknown.</p>
    <label>Published contact<select id="recruiterContacts"><option value="">Add a public work email manually</option></select></label>
    <label>Recruiter name<input id="recruiterName" maxlength="100"></label>
    <label>Work email<input id="recruiterEmail" type="email" autocomplete="off"></label>
    <label>Public contact source URL<input id="recruiterSource" type="url" placeholder="Link to the hiring post or public profile"></label>
    <label>Subject<input id="outreachSubject" maxlength="200"></label>
    <label>Message<textarea id="outreachBody" rows="9"></textarea></label>
    <div class="outreach-actions"><button type="button" class="btn btn-secondary" id="copyOutreach">Copy message</button><button type="button" class="btn btn-secondary" id="composeOutreach">Open email app</button><button type="button" class="btn btn-primary" id="saveOutreach">Save draft</button><button type="button" class="btn btn-primary" id="approveOutreach" disabled>Approve this exact message</button><button type="button" class="btn btn-primary" id="sendOutreach" disabled>Send approved email</button></div>
    <p id="outreachSetup" class="helper-text"></p><div id="outreachHistory"></div>`;
  document.body.append(dialog);
  const el = id => document.getElementById(id);
  let job, draft, contacts = [], config = {}, version = 0;
  const status = message => { el('outreachStatus').textContent = message; };
  async function api(path, body) {
    const response = await fetch('/api/' + path, body === undefined ? {} : { method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify(body) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Request failed'); return result;
  }
  const values = () => ({ email:el('recruiterEmail').value.trim(), name:el('recruiterName').value.trim(), sourceUrl:el('recruiterSource').value.trim(), subject:el('outreachSubject').value, body:el('outreachBody').value });
  function updateButtons() {
    el('approveOutreach').disabled = !draft || draft.state !== 'draft';
    el('sendOutreach').disabled = !config.smtpConfigured || !draft || draft.state !== 'approved';
  }
  function renderContacts() {
    const select = el('recruiterContacts'); select.replaceChildren(new Option('Add a public work email manually',''));
    contacts.forEach((contact,i) => select.add(new Option(`${contact.name || contact.email} · ${contact.verification}${contact.jobSpecific ? ' · in listing' : ' · company contact'}`,String(i))));
  }
  async function refresh() {
    const result = await api(`jobs/${job.id}/recruiter`);
    const history = el('outreachHistory'); history.replaceChildren();
    for (const row of result.drafts) {
      const button = document.createElement('button'); button.type='button'; button.className='btn btn-secondary';
      button.textContent = `${row.email}: ${row.state}${row.error ? ' — '+row.error : ''}`;
      button.onclick = () => { draft=row; el('recruiterEmail').value=row.email; el('recruiterName').value=row.contact_name; el('recruiterSource').value=row.source_url; el('outreachSubject').value=row.subject; el('outreachBody').value=row.body; updateButtons(); status(`Draft ${row.id}: ${row.state}`); };
      history.append(button);
    }
  }
  window.openRecruiter = async selected => {
    const request = ++version; job=selected; draft=null; config={}; contacts=[]; updateButtons();
    el('outreachTitle').textContent=`Recruiter for ${job.title} · ${job.company_name}`;
    for (const id of ['recruiterName','recruiterEmail','recruiterSource','outreachSubject','outreachBody']) el(id).value='';
    el('outreachHistory').replaceChildren(); renderContacts(); status('Loading contact tools…');
    if (!dialog.open) dialog.showModal();
    try {
      const [result,settings] = await Promise.all([api(`jobs/${job.id}/recruiter`),api('outreach/config')]);
      if (request !== version) return;
      config=settings; contacts=result.contacts; renderContacts();
      el('recruiterLinkedin').href=result.searches.linkedin; el('recruiterWeb').href=result.searches.web;
      el('outreachSubject').value=result.template.subject; el('outreachBody').value=result.template.body;
      el('lookupRecruiter').disabled=!settings.hunterConfigured || !result.domain;
      el('outreachSetup').textContent = `${settings.smtpConfigured ? 'Sender: '+settings.from : 'Email sending needs SMTP settings in the server .env. You can copy the message or open your email app now.'} ${settings.autoSend ? 'Approved drafts send automatically while the worker is running.' : 'Automatic sending is off; approve and use Send.'} ${settings.hunterConfigured ? '' : 'Public HR email lookup needs HUNTER_API_KEY.'}`;
      status(contacts.length ? `${contacts.length} published contact(s) found` : 'No recruiter email published in this listing. Search the hiring team or use public HR email lookup.');
      await refresh(); updateButtons();
    } catch(error) { status(error.message); }
  };
  el('recruiterContacts').onchange = () => {
    const index = el('recruiterContacts').value;
    if (index === '') return;
    const contact=contacts[Number(index)]; el('recruiterEmail').value=contact.email; el('recruiterName').value=contact.name; el('recruiterSource').value=contact.sourceUrl;
    draft=null; updateButtons(); status(`${contact.provenance}: ${contact.verification}. Source: ${contact.sourceUrl}`);
  };
  for (const id of ['recruiterName','recruiterEmail','recruiterSource','outreachSubject','outreachBody']) el(id).addEventListener('input',()=>{draft=null;updateButtons();});
  function action(id, handler) { el(id).onclick=async()=>{el(id).disabled=true;try{await handler();}catch(error){status(error.message);}finally{el(id).disabled=false;updateButtons();}}; }
  action('lookupRecruiter',async()=>{const result=await api(`jobs/${job.id}/recruiter/lookup`,{});contacts=[...contacts,...result.contacts];renderContacts();status(`${result.contacts.length} public company HR contact(s) found; job assignment is not confirmed.`);});
  action('copyOutreach',async()=>{await navigator.clipboard.writeText(values().body);status('Message copied');});
  action('composeOutreach',async()=>{const v=values();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))throw new Error('Enter a recruiter email first');window.location.href=`mailto:${encodeURIComponent(v.email)}?subject=${encodeURIComponent(v.subject)}&body=${encodeURIComponent(v.body)}`;});
  action('saveOutreach',async()=>{draft=(await api(`jobs/${job.id}/outreach`,values())).draft;status(`Draft saved: ${draft.state}`);await refresh();});
  action('approveOutreach',async()=>{draft=(await api(`outreach/${draft.id}/approve`,{confirm:true,email:draft.email,subject:draft.subject,body:draft.body})).draft;status(config.autoSend?'Approved and queued for automatic sending':'Approved. Use Send approved email when ready.');await refresh();});
  action('sendOutreach',async()=>{const result=await api(`outreach/${draft.id}/send`,{confirm:true});draft.state=result.state;status('Email accepted by your mail server');await refresh();});
})();
