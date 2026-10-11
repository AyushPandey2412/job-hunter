// State
let currentFilter = 'all';
let currentView = 'recent';
let gridApi;
let requestVersion = 0;
let currentSearch = '';
let allJobs = [];

// DOM Elements
const jobsListEl = document.getElementById('jobsList');
const searchInput = document.getElementById('searchInput');
const filterChips = document.querySelectorAll('.chip[data-filter]');
const btnScanNow = document.getElementById('btnScanNow');
const scanIcon = document.getElementById('scanIcon');
const companyCloud = document.getElementById('companyCloud');
const companiesCount = document.getElementById('companiesCount');
const resultsCount = document.getElementById('resultsCount');

// Dropdowns
const selectCity = document.getElementById('selectCity');
const selectStack = document.getElementById('selectStack');
const selectRole = document.getElementById('selectRole');
const selectTier = document.getElementById('selectTier');
const selectSort = document.getElementById('selectSort');
const btnSortToggle = document.getElementById('btnSortToggle');
const sortToggleIcon = document.getElementById('sortToggleIcon');
const sortToggleText = document.getElementById('sortToggleText');

// Stats Elements
const statTotal = document.getElementById('statTotal');
const statNew = document.getElementById('statNew');
const statApplied = document.getElementById('statApplied');
const statInterview = document.getElementById('statInterview');
const statRejected = document.getElementById('statRejected');
const statShortlistRate = document.getElementById('statShortlistRate');

// Discord Modal Elements
const discordModal = document.getElementById('discordModal');
const btnDiscordModal = document.getElementById('btnDiscordModal');
const btnCloseDiscordModal = document.getElementById('btnCloseDiscordModal');
const btnCancelModal = document.getElementById('btnCancelModal');
const btnSendTestWebhook = document.getElementById('btnSendTestWebhook');
const webhookInput = document.getElementById('webhookInput');
const testResult = document.getElementById('testResult');

// Filter Rules Modal Elements
const filterModal = document.getElementById('filterModal');
const btnFilterModal = document.getElementById('btnFilterModal');
const btnCloseFilterModal = document.getElementById('btnCloseFilterModal');
const btnCloseFilterModalBtn = document.getElementById('btnCloseFilterModalBtn');

// ----------------------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initPreferencesUI();
  initGrid();
  loadStats();
  loadJobs();
  loadCompanies();
  loadScheduler();
  setInterval(() => { loadJobs(); loadScheduler(); }, 60000);
  initSSE();
  setupEventListeners();
});

// ----------------------------------------------------------------------------
// FETCH DATA
// ----------------------------------------------------------------------------
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (data.success && data.stats) {
      statTotal.textContent = data.stats.total;
      refreshTabCounts();
      statNew.textContent = data.stats.new;
      statApplied.textContent = data.stats.applied;
      statInterview.textContent = data.stats.interview;
      statRejected.textContent = data.stats.rejected;
      statShortlistRate.textContent = `${data.stats.shortlistRate}%`;
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

async function loadJobs() {
  syncCityPicker();
  try {
    const version = ++requestVersion;
    let url = `/api/jobs?limit=1000`;
    if (currentView === 'applied') url += '&status=applied';
    else if (currentView === 'recent' || currentView === 'older') url += `&age=${currentView}`;
    else if (currentView === 'saved') url += '&savedOnly=true';
    url += extraQuery();

    // Dropdown filters
    const cityVal = selectCity ? selectCity.value : 'all';
    const stackVal = selectStack ? selectStack.value : 'all';
    const roleVal = selectRole ? selectRole.value : 'all';
    const tierVal = selectTier ? selectTier.value : 'all';
    const sortVal = selectSort ? selectSort.value : 'newest';

    if (cityVal && cityVal !== 'all') {
      url += `&location=${encodeURIComponent(cityVal)}`;
    }
    if (stackVal && stackVal !== 'all') {
      url += `&stack=${encodeURIComponent(stackVal)}`;
    }
    if (roleVal && roleVal !== 'all') {
      url += `&role=${encodeURIComponent(roleVal)}`;
    }
    if (tierVal && tierVal !== 'all') {
      url += `&tier=${encodeURIComponent(tierVal)}`;
    }
    if (sortVal) {
      url += `&sortBy=${encodeURIComponent(sortVal)}`;
    }

    // Status filter from chip (if applied or interview)
    if (currentView !== 'applied' && (currentFilter === 'applied' || currentFilter === 'interview')) {
      url += `&status=${currentFilter}`;
    }

    if (currentSearch) {
      url += `&search=${encodeURIComponent(currentSearch)}`;
    }

    const res = await fetch(url);
    const data = await res.json();
    if (version !== requestVersion) return;
    if (!res.ok || !data.success) throw new Error(data.error || 'Unable to load jobs');
    if (data.success) {
      document.getElementById('feedMessage').textContent = '';
      allJobs = data.jobs;
      if (resultsCount) {
        resultsCount.textContent = `${allJobs.length} Jobs`;
      }
      renderJobs(allJobs);
      if (allJobs.length === 1000) document.getElementById('feedMessage').textContent = 'Showing the first 1,000 matches. Narrow your filters to find more.';
    }
  } catch (err) {
    document.getElementById('feedMessage').innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation text-red"></i>
        <p>Error loading jobs. Make sure the server is running.</p>
      </div>
    `;
  }
}

async function loadCompanies() {
  try {
    const res = await fetch('/api/companies');
    const data = await res.json();
    if (data.success && data.companies) {
      companiesCount.textContent = `${data.companies.length} Boards`;
      companyCloud.innerHTML = data.companies
        .map(c => `<span class="company-pill">${escapeHtml(c.name)}</span>`)
        .join('');
    }
  } catch (err) {
    console.error('Failed to load companies:', err);
  }
}

// ----------------------------------------------------------------------------
// RENDER JOBS
// ----------------------------------------------------------------------------
function escapeHtml(value) {
  const el = document.createElement('span'); el.textContent = value ?? ''; return el.innerHTML;
}
function initGrid() {
  if (!window.agGrid) { document.getElementById('feedMessage').textContent = 'Grid could not load. Check your connection and reload.'; return; }
  jobsListEl.replaceChildren();
  gridApi = agGrid.createGrid(jobsListEl, {
    theme: 'legacy', rowData: [], pagination: true, paginationPageSize: 25,
    paginationPageSizeSelector: [10, 25, 50, 100], rowHeight: 64,
    getRowId: p => String(p.data.id),
    defaultColDef: { sortable: true, filter: true, resizable: true, minWidth: 140 },
    columnDefs: [
      { field: 'title', headerName: 'Job', minWidth: 260, flex: 2, wrapText: true, autoHeight: true,
        cellRenderer: p => {
          const link = document.createElement('a'); link.textContent = p.value;
          try { const url = new URL(p.data.job_url); if (['http:', 'https:'].includes(url.protocol)) link.href = url.href; } catch {}
          link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'grid-job-link'; return link;
        } },
      { field: 'company_name', headerName: 'Company', flex: 1 },
      { field: 'location', headerName: 'Location', minWidth: 170 },
      { field: 'salary_min', colId: 'salary', headerName: 'Salary (reported)', minWidth: 240, filter: 'agNumberColumnFilter', valueFormatter: p => !p.data.salary_range || p.data.salary_range === 'Competitive' ? 'Not specified' : p.data.salary_range,
        comparator: (a, b, nodeA, nodeB) => `${nodeA.data.salary_currency}/${nodeA.data.salary_period}`.localeCompare(`${nodeB.data.salary_currency}/${nodeB.data.salary_period}`) || (a ?? -1) - (b ?? -1) },
      { field: 'work_mode', headerName: 'Work mode', minWidth: 140, valueFormatter: p => p.value === 'unknown' ? 'Not specified' : p.value },
      { field: 'experience_level', headerName: 'Experience', minWidth: 190 },
      { field: 'remote_eligibility', headerName: 'Remote region (check listing)', minWidth: 230, valueFormatter: p => p.value === 'unknown' ? 'Not confirmed' : p.value === 'restricted' ? 'Other region' : p.value === 'not-applicable' ? '—' : p.value },
      { field: 'salary_min', headerName: 'Salary minimum', hide: true },
      { field: 'salary_max', headerName: 'Salary maximum', hide: true },
      { field: 'salary_currency', headerName: 'Currency', hide: true },
      { field: 'salary_period', headerName: 'Pay period', hide: true },
      { field: 'match_score', headerName: 'Match', minWidth: 110, valueFormatter: p => `${p.value}%` },
      { field: 'tech_stack', headerName: 'Skills', minWidth: 210, valueFormatter: p => (p.value || []).join(', ') },
      { headerName: 'Posted / found', colId: 'age', minWidth: 150, valueGetter: p => p.data.posted_at || p.data.discovered_at, valueFormatter: p => formatTimeAgo(p.value) },
      { field: 'status', headerName: 'Status', minWidth: 150, cellRenderer: p => {
        const select = document.createElement('select'); select.className = 'grid-status'; select.setAttribute('aria-label', `Status for ${p.data.title}`);
        ['new', 'applied', 'interview', 'rejected', 'ignored'].forEach(status => { const option = new Option(status, status); select.add(option); });
        select.value = p.value; select.onchange = () => updateStatus(p.data.id, select.value); return select;
      } },
      { headerName: 'Saved', colId: 'saved', minWidth: 110, sortable: false, filter: false, cellRenderer: p => {
        const button = document.createElement('button'); button.className = 'btn-status'; button.textContent = p.data.saved ? '? Saved' : '? Save';
        button.onclick = async () => { button.disabled = true; try { await saveJobDetails(p.data, { saved: !p.data.saved }); } catch (error) { document.getElementById('feedMessage').textContent = error.message; } finally { button.disabled = false; } }; return button;
      } },
      { headerName: 'Notes', colId: 'notes', minWidth: 120, sortable: false, filter: false, cellRenderer: notesRenderer },
      { headerName: 'Track', colId: 'actions', minWidth: 150, sortable: false, filter: false, cellRenderer: p => {
        const button = document.createElement('button'); button.className = 'btn-apply'; button.textContent = p.data.status === 'applied' ? 'Applied ✓' : 'Mark applied';
        button.disabled = p.data.status === 'applied'; button.onclick = async () => { button.disabled = true; await updateStatus(p.data.id, 'applied'); button.disabled = p.data.status === 'applied'; }; return button;
      } }
    ]
  });
}
function renderJobs(jobs) { gridApi?.setGridOption('rowData', jobs || []); }
async function loadScheduler() {
  try {
    const response = await fetch('/api/scheduler'); const state = await response.json();
    document.getElementById('engineStatus').textContent = state.running ? 'Scanning job boards…' : `Every ${state.intervalMinutes} min · ${state.error ? 'Last scan failed' : state.lastCompletedAt ? 'Last scan ' + formatTimeAgo(state.lastCompletedAt) : 'Waiting for first scan'}`;
    btnScanNow.disabled = state.running; scanIcon.classList.toggle('fa-spin', state.running);
  } catch {}
}

// ----------------------------------------------------------------------------
// ACTIONS & EVENTS
// ----------------------------------------------------------------------------
async function updateStatus(jobId, newStatus) {
  try {
    const res = await fetch(`/api/jobs/${jobId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      loadStats();
      loadJobs();
    } else { throw new Error(data.error || 'Unable to save status'); }
  } catch (err) {
    document.getElementById('feedMessage').textContent = err.message;
  }
}

function setupEventListeners() {
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    currentView = button.dataset.view;
    document.getElementById('companyShortcuts').hidden = currentView !== 'companies';
    currentFilter = 'all';
    filterChips.forEach(chip => chip.classList.toggle('active', chip.dataset.filter === 'all'));
    document.querySelectorAll('[data-view]').forEach(tab => { tab.classList.toggle('active', tab === button); tab.setAttribute('aria-selected', String(tab === button)); });
    loadJobs();
  }));
  // Helper: Sync sort toggle UI icon and label
  function updateSortToggleUI(sortVal) {
    if (!sortToggleIcon || !sortToggleText) return;
    const isAsc = ['oldest', 'score_asc', 'company_asc'].includes(sortVal);
    if (isAsc) {
      sortToggleIcon.className = 'fa-solid fa-arrow-up-wide-short';
      sortToggleText.textContent = 'ASC';
    } else {
      sortToggleIcon.className = 'fa-solid fa-arrow-down-wide-short';
      sortToggleText.textContent = 'DESC';
    }
  }

  // Dropdown Listeners
  [selectCity, selectStack, selectRole, selectTier].forEach(el => {
    if (el) {
      el.addEventListener('change', () => {
        if (el === selectCity) document.querySelectorAll('#quickCities option').forEach(option => { option.selected = false; });
        loadJobs();
      });
    }
  });

  if (selectSort) {
    selectSort.addEventListener('change', () => {
      updateSortToggleUI(selectSort.value);
      loadJobs();
    });
  }

  // Sort Direction Toggle Button
  if (btnSortToggle) {
    btnSortToggle.addEventListener('click', () => {
      const current = selectSort ? selectSort.value : 'newest';
      let nextVal = 'newest';

      if (current === 'newest') nextVal = 'oldest';
      else if (current === 'oldest') nextVal = 'newest';
      else if (current === 'score') nextVal = 'score_asc';
      else if (current === 'score_asc') nextVal = 'score';
      else if (current === 'company_asc') nextVal = 'company_desc';
      else if (current === 'company_desc') nextVal = 'company_asc';
      else nextVal = current.includes('asc') ? 'newest' : 'oldest';

      if (selectSort) selectSort.value = nextVal;
      updateSortToggleUI(nextVal);
      loadJobs();
    });
  }

  // Quick Sort Chips
  document.querySelectorAll('.chip-sort').forEach(chip => {
    chip.addEventListener('click', () => {
      const sortVal = chip.getAttribute('data-sort');
      if (selectSort && sortVal) {
        selectSort.value = sortVal;
        updateSortToggleUI(sortVal);
        loadJobs();
      }
    });
  });

  // Filter Chips (Quick sync with dropdowns)
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const val = chip.getAttribute('data-filter');
      currentFilter = val;

      if (['all', 'remote', 'bengaluru', 'mumbai', 'hyderabad', 'delhi'].includes(val)) {
        document.querySelectorAll('#quickCities option').forEach(option => { option.selected = false; });
        if (selectCity) selectCity.value = val;
      } else if (['mnc', 'startup'].includes(val)) {
        if (selectTier) selectTier.value = val;
      }
      loadJobs();
    });
  });

  // Search input debounced
  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentSearch = e.target.value.trim();
      loadJobs();
    }, 250);
  });

  // Scan Now
  btnScanNow.addEventListener('click', async () => {
    btnScanNow.disabled = true;
    scanIcon.classList.add('fa-spin');

    try {
      const response = await fetch('/api/poll', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      loadScheduler();
      setTimeout(() => {
        loadStats();
        loadJobs();
        btnScanNow.disabled = false;
        scanIcon.classList.remove('fa-spin');
      }, 4000);
    } catch (err) {
      document.getElementById('feedMessage').textContent = err.message;
      btnScanNow.disabled = false;
      scanIcon.classList.remove('fa-spin');
    }
  });

  // Discord Modal
  btnDiscordModal.addEventListener('click', () => {
    discordModal.classList.add('show');
  });

  const closeDiscordModal = () => {
    discordModal.classList.remove('show');
    testResult.className = 'test-result';
    testResult.style.display = 'none';
  };

  btnCloseDiscordModal.addEventListener('click', closeDiscordModal);
  btnCancelModal.addEventListener('click', closeDiscordModal);

  // Filter Rules Modal
  btnFilterModal.addEventListener('click', () => {
    filterModal.classList.add('show');
  });

  const closeFilterModal = () => {
    filterModal.classList.remove('show');
  };

  btnCloseFilterModal.addEventListener('click', closeFilterModal);
  btnCloseFilterModalBtn.addEventListener('click', closeFilterModal);

  // Send Test Webhook
  btnSendTestWebhook.addEventListener('click', async () => {
    const webhookUrl = webhookInput.value.trim();
    if (!webhookUrl) {
      testResult.textContent = 'Please enter a webhook URL first.';
      testResult.className = 'test-result error';
      return;
    }

    btnSendTestWebhook.disabled = true;
    testResult.textContent = 'Sending test alert...';
    testResult.className = 'test-result';
    testResult.style.display = 'block';

    try {
      const res = await fetch('/api/discord/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl, save: true })
      });
      const data = await res.json();
      btnSendTestWebhook.disabled = false;

      if (data.success) {
        webhookInput.value = '';
        testResult.textContent = 'Webhook saved. Test alert sent to Discord.';
        testResult.className = 'test-result success';
      } else {
        testResult.textContent = `❌ Error: ${data.error || 'Failed to send'}`;
        testResult.className = 'test-result error';
      }
    } catch (err) {
      btnSendTestWebhook.disabled = false;
      testResult.textContent = `❌ Error: ${err.message}`;
      testResult.className = 'test-result error';
    }
  });
}

// ----------------------------------------------------------------------------
// REAL-TIME SERVER-SENT EVENTS (SSE)
// ----------------------------------------------------------------------------
function initSSE() {
  // Refresh the dashboard without keeping a serverless function open.
  setInterval(() => { loadJobs(); loadStats(); loadScheduler(); }, 60000);
}

// Helper: Format Time Ago
function formatTimeAgo(dateString) {
  if (!dateString) return 'Not specified';
  const now = new Date();
  const past = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:/.test(dateString) ? dateString.replace(' ', 'T') + 'Z' : dateString);
  const diffSec = Math.floor((now - past) / 1000);

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${Math.floor(diffHour / 24)}d ago`;
}

async function refreshTabCounts() {
  try {
    const response = await fetch('/api/view-counts'); const data = await response.json();
    if (!response.ok) return;
    const labels = { recent: `Fresh (${data.freshDays} days)`, older: 'Older jobs', applied: 'Applied', companies: 'Companies', saved: 'Saved' };
    document.querySelectorAll('[data-view]').forEach(tab => { tab.textContent = `${labels[tab.dataset.view]} (${data.counts[tab.dataset.view]})`; });
  } catch {}
}
