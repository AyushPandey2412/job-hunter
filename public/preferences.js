let savedPreferences;
const fields = [
  ['targetRoles', 'Target roles (comma separated)', 'text'],
  ['targetKeywords', 'Skills / keywords (comma separated)', 'text'],
  ['negativeKeywords', 'Excluded title keywords (comma separated)', 'text'],
  ['targetLocations', 'Cities to monitor (comma separated; add remote for location-independent remote jobs)', 'text'],
  ['salaryMin', 'Minimum salary', 'number'], ['salaryMax', 'Maximum salary', 'number'],
  ['salaryCurrency', 'Currency (INR, USD, etc.)', 'text'],
  ['salaryPeriod', 'Salary period', ['year', 'month', 'hour']],
  ['remoteScope', 'Remote eligibility (India or any region)', ['india', 'any']],
  ['freshDays', 'Fresh jobs cutoff (days)', 'number'],
  ['minMatchScore', 'Minimum match score (0–100)', 'number'],
  ['pollIntervalMinutes', 'Scan interval (minutes)', ['5', '10']]
];
function makeControl(id, labelText, type, parent) {
  const group = document.createElement('label'); group.className = 'select-group';
  const label = document.createElement('span'); label.textContent = labelText; group.append(label);
  const input = document.createElement(Array.isArray(type) ? 'select' : 'input'); input.id = id;
  const labels = { all: 'Any work mode', remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site', unknown: 'Not specified', year: 'Per year', month: 'Per month', hour: 'Per hour' };
  if (Array.isArray(type)) type.forEach(value => input.add(new Option(labels[value] || value, value)));
  else { input.type = type; if (type === 'number') { input.min = '0'; input.step = 'any'; } }
  group.append(input); parent.append(group); return input;
}
function addChoice(parent, id, text, value) {
  const label = document.createElement('label'); label.className = 'check-choice';
  const input = document.createElement('input'); input.type = 'checkbox'; input.id = id; input.value = value; input.checked = true;
  label.append(input, document.createTextNode(text)); parent.append(label); return input;
}
function initPreferencesUI() {
  const settingsButton = document.createElement('button'); settingsButton.className = 'btn btn-secondary'; settingsButton.textContent = 'Settings';
  document.querySelector('.nav-actions').prepend(settingsButton);
  const modal = document.createElement('dialog'); modal.id = 'preferencesDialog'; modal.className = 'preferences-dialog';
  const form = document.createElement('form'); form.id = 'preferencesForm';
  const heading = document.createElement('h2'); heading.textContent = 'Job preferences';
  const help = document.createElement('p'); help.className = 'helper-text'; help.textContent = 'Saved preferences control future discovery. Quick filters only change the current table. Salary ranges use the selected currency and period; values are not converted. Existing jobs are kept.';
  form.append(heading, help);
  const controls = document.createElement('div'); controls.className = 'preferences-fields'; form.append(controls);
  fields.forEach(([key, label, type]) => makeControl(`pref-${key}`, label, type, controls));
  const modes = document.createElement('fieldset'); modes.innerHTML = '<legend>Work modes to monitor</legend>';
  ['remote','hybrid','onsite','unknown'].forEach(mode => addChoice(modes, `pref-mode-${mode}`, mode === 'unknown' ? 'Not specified' : mode, mode));
  form.append(modes); addChoice(form, 'pref-unknownSalary', 'Include undisclosed salaries', 'unknown');
  addChoice(form, 'pref-unknownRemote', 'Include remote jobs with unconfirmed regional eligibility (check listing)', 'unknown');
  const message = document.createElement('p'); message.id = 'preferencesMessage'; message.setAttribute('role', 'status'); form.append(message);
  const footer = document.createElement('div'); footer.className = 'modal-footer';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn btn-secondary'; cancel.textContent = 'Cancel'; cancel.onclick = () => modal.close();
  const save = document.createElement('button'); save.className = 'btn btn-primary'; save.textContent = 'Save preferences'; footer.append(cancel, save); form.append(footer);
  modal.append(form); document.body.append(modal);
  settingsButton.onclick = async () => { await readPreferences(); if (savedPreferences) { fillPreferences(); modal.showModal(); } };
  form.onsubmit = async event => {
    event.preventDefault(); save.disabled = true; message.textContent = 'Saving…';
    try {
      const value = {};
      fields.forEach(([key]) => { const raw = document.getElementById(`pref-${key}`).value; value[key] = ['targetRoles','targetKeywords','negativeKeywords','targetLocations'].includes(key) ? raw.split(',').map(s => s.trim()).filter(Boolean) : ['salaryMin','salaryMax'].includes(key) && raw === '' ? null : raw; });
      value.workModes = [...modes.querySelectorAll('input:checked')].map(input => input.value);
      value.includeUnknownSalary = document.getElementById('pref-unknownSalary').checked;
      value.includeUnknownRemote = document.getElementById('pref-unknownRemote').checked;
      const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      savedPreferences = data.settings; applyQuickDefaults(); modal.close(); loadJobs(); loadScheduler(); refreshTabCounts();
    } catch (error) { message.textContent = error.message; } finally { save.disabled = false; }
  };

  const quick = document.createElement('div'); quick.className = 'dropdown-filter-row'; quick.id = 'extraFilters';
  const city = makeControl('quickCities', 'Cities', [], quick); city.multiple = true; city.parentElement.hidden = true;
  const cityGroup = document.createElement('div'); cityGroup.className = 'select-group city-filter';
  const cityLabel = document.createElement('span'); cityLabel.className = 'control-label'; cityLabel.textContent = 'Cities';
  const picker = document.createElement('details'); picker.id = 'cityPicker'; picker.className = 'city-picker';
  const summary = document.createElement('summary'); summary.textContent = 'All cities'; summary.setAttribute('aria-label', 'Choose cities');
  const options = document.createElement('div'); options.id = 'cityPickerOptions'; options.className = 'city-picker-options';
  picker.append(summary, options); cityGroup.append(cityLabel, picker);
  const primary = document.querySelector('.filter-bar > .dropdown-filter-row');
  document.getElementById('selectCity').parentElement.hidden = true;
  primary.prepend(cityGroup);
  document.addEventListener('click', event => { if (!picker.contains(event.target)) picker.open = false; });
  picker.addEventListener('keydown', event => { if (event.key === 'Escape') { picker.open = false; summary.focus(); } });
  makeControl('quickMode', 'Work mode', ['all','remote','hybrid','onsite','unknown'], quick);
  makeControl('quickSalaryMin', 'Min salary', 'number', quick).placeholder = 'No minimum'; makeControl('quickSalaryMax', 'Max salary', 'number', quick).placeholder = 'No maximum';
  makeControl('quickCurrency', 'Currency', 'text', quick);
  makeControl('quickPeriod', 'Pay period', ['year','month','hour'], quick);
  const company = makeControl('quickCompany', 'Company', [], quick); company.add(new Option('All companies', ''));
  const actions = document.createElement('div'); actions.className = 'filter-actions';
  addChoice(actions, 'quickUnknown', 'Include undisclosed salaries', 'unknown');
  const clear = document.createElement('button'); clear.className = 'btn btn-secondary'; clear.textContent = 'Clear filters'; clear.onclick = clearQuickFilters; actions.append(clear);
  document.querySelector('.filter-bar').append(quick, actions);
  actions.addEventListener('change', () => loadJobs());
  quick.addEventListener('change', event => { if (event.target === city) selectCity.value = 'all'; loadJobs(); });
  document.querySelector('.job-tabs').insertAdjacentHTML('beforeend', '<button class="job-tab" role="tab" aria-selected="false" data-view="companies">Companies</button><button class="job-tab" role="tab" aria-selected="false" data-view="saved">Saved</button>');
  const shortcuts = document.createElement('div'); shortcuts.id = 'companyShortcuts'; shortcuts.className = 'filter-chips'; shortcuts.hidden = true;
  document.querySelector('.job-tabs').after(shortcuts);
  ['Tata Consultancy Services (TCS)', 'Infosys', 'Wipro', 'Accenture India'].forEach(name => {
    const button = document.createElement('button'); button.className = 'chip'; button.textContent = name;
    button.onclick = () => { company.value = name; loadJobs(); }; shortcuts.append(button);
  });
  fetch('/api/companies').then(r => r.json()).then(data => (data.companies || []).forEach(c => company.add(new Option(c.name, c.name)))).catch(() => {});
  readPreferences().then(() => { applyQuickDefaults(); loadJobs(); refreshTabCounts(); });
}
async function readPreferences() {
  try { const response = await fetch('/api/settings'); const data = await response.json(); if (!response.ok) throw new Error(data.error); savedPreferences = data.settings; }
  catch (error) { document.getElementById('feedMessage').textContent = `Settings unavailable: ${error.message}`; }
}
function fillPreferences() {
  fields.forEach(([key]) => { const value = savedPreferences[key]; document.getElementById(`pref-${key}`).value = Array.isArray(value) ? value.join(', ') : value ?? ''; });
  ['remote','hybrid','onsite','unknown'].forEach(mode => { document.getElementById(`pref-mode-${mode}`).checked = savedPreferences.workModes.includes(mode); });
  document.getElementById('pref-unknownSalary').checked = savedPreferences.includeUnknownSalary;
  document.getElementById('pref-unknownRemote').checked = savedPreferences.includeUnknownRemote;
  document.getElementById('preferencesMessage').textContent = '';
}
function applyQuickDefaults() {
  if (!savedPreferences) return;
  const cities = document.getElementById('quickCities'); const previous = [...cities.selectedOptions].map(o => o.value);
  cities.replaceChildren();
  [...new Set([...savedPreferences.targetLocations.filter(c => c !== 'remote'), 'mumbai','bengaluru','hyderabad','delhi','noida','pune','chennai'])].forEach(city => { const option = new Option(city, city); option.selected = previous.includes(city); cities.add(option); });
  syncCityPicker();
  document.getElementById('quickSalaryMin').value = savedPreferences.salaryMin ?? '';
  document.getElementById('quickSalaryMax').value = savedPreferences.salaryMax ?? '';
  document.getElementById('quickCurrency').value = savedPreferences.salaryCurrency;
  document.getElementById('quickPeriod').value = savedPreferences.salaryPeriod;
  document.getElementById('quickUnknown').checked = savedPreferences.includeUnknownSalary;
  document.querySelector('[data-view="recent"]').textContent = `Fresh · ${savedPreferences.freshDays} days`;
}
function extraQuery() {
  const params = new URLSearchParams(); const cities = document.getElementById('quickCities'); if (!cities) return '';
  if (cities.selectedOptions.length) params.set('cities', [...cities.selectedOptions].map(o => o.value).join(','));
  const mode = document.getElementById('quickMode').value;
  if (mode !== 'all') params.set('workModes', mode);
  for (const [id, name] of [['quickSalaryMin','salaryMin'],['quickSalaryMax','salaryMax'],['quickCurrency','salaryCurrency'],['quickPeriod','salaryPeriod'],['quickCompany','company']]) {
    const value = document.getElementById(id).value; if (value !== '') params.set(name, value);
  }
  params.set('includeUnknownSalary', document.getElementById('quickUnknown').checked);
  return '&' + params.toString();
}
function clearQuickFilters() {
  [selectCity,selectStack,selectRole,selectTier].forEach(select => { select.value = 'all'; });
  selectSort.value = 'newest'; currentFilter = 'all'; currentSearch = ''; searchInput.value = '';
  document.querySelectorAll('#quickCities option').forEach(option => { option.selected = false; });
  document.getElementById('quickCompany').value = ''; document.getElementById('quickMode').value = 'all';
  document.getElementById('quickSalaryMin').value = ''; document.getElementById('quickSalaryMax').value = '';
  document.getElementById('quickUnknown').checked = true;
  filterChips.forEach(chip => chip.classList.toggle('active', chip.dataset.filter === 'all'));
  gridApi?.setFilterModel(null); loadJobs();
}
async function saveJobDetails(job, change) {
  const response = await fetch(`/api/jobs/${job.id}/details`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saved: !!job.saved, notes: job.notes || '', ...change }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error); await loadJobs();
}
function notesRenderer(p) {
  const button = document.createElement('button'); button.className = 'btn-status'; button.textContent = p.data.notes ? 'Edit note' : 'Add note';
  button.onclick = () => {
    const dialog = document.createElement('dialog'); dialog.className = 'preferences-dialog';
    const heading = document.createElement('h3'); heading.textContent = `Notes: ${p.data.title}`;
    const input = document.createElement('textarea'); input.value = p.data.notes || ''; input.maxLength = 5000; input.rows = 8; input.setAttribute('aria-label', 'Personal notes');
    const save = document.createElement('button'); save.className = 'btn btn-primary'; save.textContent = 'Save note';
    const cancel = document.createElement('button'); cancel.className = 'btn btn-secondary'; cancel.textContent = 'Cancel'; cancel.onclick = () => { dialog.close(); dialog.remove(); };
    const message = document.createElement('p'); message.setAttribute('role', 'status');
    save.onclick = async () => { save.disabled = true; try { await saveJobDetails(p.data, { notes: input.value }); dialog.close(); dialog.remove(); } catch (error) { message.textContent = error.message; save.disabled = false; } };
    dialog.append(heading, input, message, cancel, save); document.body.append(dialog); dialog.showModal();
  }; return button;
}

function syncCityPicker() {
  const select = document.getElementById('quickCities'); const panel = document.getElementById('cityPickerOptions');
  if (!select || !panel) return;
  const signature = JSON.stringify([...select.options].map(option => option.value));
  if (panel.dataset.options !== signature) {
    panel.dataset.options = signature; panel.replaceChildren();
    const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'city-reset'; reset.textContent = 'All cities';
    reset.onclick = () => { [...select.options].forEach(option => { option.selected = false; }); selectCity.value = 'all'; loadJobs(); };
    panel.append(reset);
    [...select.options].forEach(option => {
      const label = document.createElement('label'); label.className = 'city-option';
      const input = document.createElement('input'); input.type = 'checkbox'; input.dataset.city = option.value;
      input.onchange = () => { option.selected = input.checked; selectCity.value = 'all'; loadJobs(); };
      label.append(input, document.createTextNode(option.text.charAt(0).toUpperCase() + option.text.slice(1))); panel.append(label);
    });
  }
  const selectedValues = new Set([...select.selectedOptions].map(option => option.value));
  panel.querySelectorAll('input').forEach(input => { input.checked = selectedValues.has(input.dataset.city); });
  const selected = [...select.selectedOptions].map(option => option.text.charAt(0).toUpperCase() + option.text.slice(1));
  const fallback = selectCity.value === 'all' ? 'All cities' : selectCity.value === 'remote' ? 'Remote only' : selectCity.options[selectCity.selectedIndex].text;
  document.querySelector('#cityPicker summary').textContent = selected.length === 1 ? selected[0] : selected.length ? `${selected.length} cities selected` : fallback;
}
