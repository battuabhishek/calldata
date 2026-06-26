// State management for the dashboard
let allCalls = [];           // Stores visible calls
let futureCalls = [];        // Stores future calls to feed the live update observer
let currentFilter = 'all';   // 'all', 'incoming', 'outgoing', 'missed'
let maskStyle = 'blur';      // 'blur' or 'x'
// Initialization Date and Schedule Persistence
let initDate = null;
let fullSchedule = [];

// Chart Instances
let dayChartInstance = null;

// Generate a random phone number structure (Indian mobile format: +91 XXXXX-X1234)
// Mulberry32 seedable pseudo-random number generator
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

function generatePhoneNumber(rand) {
  const prefixes = ['98765', '98123', '88765', '78901', '90123', '80123', '70123', '60123'];
  const firstPart = prefixes[Math.floor(rand() * prefixes.length)];
  const middleDigit = Math.floor(rand() * 10);
  const last4 = Math.floor(rand() * 9000) + 1000;
  
  return {
    full: `+91 ${firstPart}-${middleDigit}${last4}`,
    first6: `+91 ${firstPart}-${middleDigit}`,
    last4: last4.toString()
  };
}

// Helper to format call durations
function formatDuration(seconds) {
  if (seconds === 0) return '0s (Missed)';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

// Helper to format day headers for call list grouping
function formatDayHeader(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const targetDate = new Date(dateString);
  targetDate.setHours(0, 0, 0, 0);
  
  const diffTime = today - targetDate;
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  
  const options = { weekday: 'long', month: 'short', day: 'numeric' };
  return targetDate.toLocaleDateString('en-US', options);
}

// Generate Call Logs for a single day based on random intervals
function generateDayCalls(date, startHour, endHour) {
  const calls = [];
  const seed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  const rand = mulberry32(seed);
  
  let currentSec = startHour * 3600; // Start of active window (8:00 AM = 28800s)
  const maxSec = endHour * 3600;     // End of active window (9:00 PM = 75600s)
  
  // Initial random offset (10 to 45 mins)
  currentSec += Math.floor(rand() * 35 + 10) * 60;

  while (currentSec < maxSec) {
    const callTime = new Date(date);
    callTime.setHours(Math.floor(currentSec / 3600));
    callTime.setMinutes(Math.floor((currentSec % 3600) / 60));
    callTime.setSeconds(Math.floor(currentSec % 60));

    // Determine Call Type
    const rType = rand();
    let type = 'incoming';
    let duration = 0;
    
    if (rType < 0.40) {
      type = 'incoming';
      duration = Math.floor(rand() * (900 - 60 + 1)) + 60; // 1m to 15m in seconds
    } else if (rType < 0.80) {
      type = 'outgoing';
      duration = Math.floor(rand() * (900 - 60 + 1)) + 60;
    } else {
      type = 'missed';
      duration = 0;
    }

    calls.push({
      id: `call_${seed}_${currentSec}`,
      number: generatePhoneNumber(rand),
      type: type,
      duration: duration,
      timestamp: callTime
    });

    // Random timing intervals between call occurrences
    const intervalR = rand();
    let intervalSec = 0;
    
    if (intervalR < 0.45) {
      intervalSec = Math.floor(rand() * 35 + 10) * 60; // 10 to 45 mins
    } else if (intervalR < 0.80) {
      intervalSec = Math.floor(rand() * 75 + 45) * 60; // 45 to 120 mins
    } else {
      intervalSec = Math.floor(rand() * 120 + 120) * 60; // 2 hours to 4 hours
    }

    currentSec += intervalSec;
  }

  return calls;
}

// Generate the persistent 4-day call schedule starting from Today
function generatePersistentSchedule(startDate) {
  const schedule = [];
  for (let i = 0; i < 4; i++) {
    const currentDay = new Date(startDate);
    currentDay.setDate(startDate.getDate() + i);
    const dayCalls = generateDayCalls(currentDay, 8, 21);
    schedule.push(...dayCalls);
  }
  return schedule;
}

// Load schedule dynamically on-the-fly using deterministic seeded random generation
function initCallDatabase() {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today
  initDate = today;

  // Generate 4-day schedule dynamically starting from today
  fullSchedule = generatePersistentSchedule(initDate);

  // Filter based on current actual time: visible calls vs future calls
  const now = new Date();
  allCalls = [];
  futureCalls = [];

  fullSchedule.forEach(call => {
    if (call.timestamp <= now) {
      allCalls.push(call);
    } else {
      futureCalls.push(call);
    }
  });

  // Sort visible descending (newest first)
  sortAllCalls();

  // Sort future calls ascending (so next call is index 0)
  futureCalls.sort((a, b) => a.timestamp - b.timestamp);
}

function sortAllCalls() {
  allCalls.sort((a, b) => b.timestamp - a.timestamp);
}

// Update numerical metrics in UI
function updateMetrics() {
  const totalCount = allCalls.length;
  let incomingCount = 0;
  let outgoingCount = 0;
  let missedCount = 0;
  let totalAnsweredDuration = 0;
  let answeredCount = 0;

  allCalls.forEach(call => {
    if (call.type === 'incoming') {
      incomingCount++;
      totalAnsweredDuration += call.duration;
      answeredCount++;
    } else if (call.type === 'outgoing') {
      outgoingCount++;
      totalAnsweredDuration += call.duration;
      answeredCount++;
    } else if (call.type === 'missed') {
      missedCount++;
    }
  });

  const avgDuration = answeredCount > 0 ? Math.round(totalAnsweredDuration / answeredCount) : 0;

  // Render values
  document.getElementById('stat-total').textContent = totalCount;
  document.getElementById('stat-incoming').textContent = incomingCount;
  document.getElementById('stat-outgoing').textContent = outgoingCount;
  document.getElementById('stat-missed').textContent = missedCount;
  document.getElementById('stat-duration').textContent = formatDuration(avgDuration);

  // Render percentages
  const incPct = totalCount > 0 ? Math.round((incomingCount / totalCount) * 100) : 0;
  const outPct = totalCount > 0 ? Math.round((outgoingCount / totalCount) * 100) : 0;
  const misPct = totalCount > 0 ? Math.round((missedCount / totalCount) * 100) : 0;

  document.getElementById('stat-incoming-pct').textContent = `${incPct}% of total calls`;
  document.getElementById('stat-outgoing-pct').textContent = `${outPct}% of total calls`;
  document.getElementById('stat-missed-pct').textContent = `${misPct}% of total calls`;
}

// Render the Call Log Feed list grouped by day
function renderCallFeed() {
  const container = document.getElementById('call-logs-container');
  container.innerHTML = '';

  // Apply filters
  const filtered = allCalls.filter(call => {
    if (currentFilter === 'all') return true;
    return call.type === currentFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="feed-empty">
        <i data-lucide="phone-off"></i>
        <p>No ${currentFilter} calls recorded in this timeframe.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  // Group by day (date string)
  const groups = {};
  filtered.forEach(call => {
    const dateStr = call.timestamp.toDateString();
    if (!groups[dateStr]) groups[dateStr] = [];
    groups[dateStr].push(call);
  });

  // Sort groups (Today first, then descending)
  const sortedDates = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));

  sortedDates.forEach(dateStr => {
    const groupCalls = groups[dateStr];
    const groupTitle = formatDayHeader(dateStr);
    
    const dayGroupDiv = document.createElement('div');
    dayGroupDiv.className = 'day-group';

    // Day Header
    dayGroupDiv.innerHTML = `
      <div class="day-group-title">
        <span>${groupTitle}</span>
        <span class="day-group-count">${groupCalls.length} call${groupCalls.length !== 1 ? 's' : ''}</span>
      </div>
    `;

    // Add call rows to day group
    groupCalls.forEach(call => {
      const row = document.createElement('div');
      row.className = `call-row ${call.type}`;
      row.setAttribute('data-id', call.id);

      // Icon determination
      let iconName = 'phone-incoming';
      if (call.type === 'outgoing') {
        iconName = 'phone-outgoing';
      } else if (call.type === 'missed') {
        iconName = 'phone-missed';
      }

      // Formatting phone number based on masking style
      let phoneHTML = '';
      if (maskStyle === 'x') {
        phoneHTML = `
          <span class="phone-number-display">
            <span class="mask-chars">+91 XXXXX-X</span>
            <span class="visible-digits">${call.number.last4}</span>
          </span>
        `;
      } else {
        // Blur filter
        phoneHTML = `
          <span class="phone-number-display">
            <span class="mask-blur">${call.number.first6}</span>
            <span class="visible-digits">${call.number.last4}</span>
          </span>
        `;
      }

      const timeFormatted = call.timestamp.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });

      row.innerHTML = `
        <div class="call-type-indicator">
          <i data-lucide="${iconName}"></i>
        </div>
        <div class="call-number-container">
          ${phoneHTML}
        </div>
        <div class="call-time">${timeFormatted}</div>
        <div class="call-duration">${call.type === 'missed' ? 'Missed' : formatDuration(call.duration)}</div>
        <div class="call-actions">
          <button class="call-action-btn" title="Callback"><i data-lucide="phone"></i></button>
          <button class="call-action-btn" title="Details"><i data-lucide="info"></i></button>
        </div>
      `;
      dayGroupDiv.appendChild(row);
    });

    container.appendChild(dayGroupDiv);
  });

  // Re-render Lucide Icons
  lucide.createIcons();
}

// Chart.js Configuration and Render
function initCharts() {
  const ctxDay = document.getElementById('dayChart').getContext('2d');

  Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
  Chart.defaults.color = '#9ca3af';

  const dayStats = getDailyCounts();
  
  dayChartInstance = new Chart(ctxDay, {
    type: 'bar',
    data: {
      labels: dayStats.labels,
      datasets: [
        {
          label: 'Incoming',
          data: dayStats.incoming,
          backgroundColor: '#06b6d4',
          borderRadius: 4
        },
        {
          label: 'Outgoing',
          data: dayStats.outgoing,
          backgroundColor: '#8b5cf6',
          borderRadius: 4
        },
        {
          label: 'Missed',
          data: dayStats.missed,
          backgroundColor: '#ef4444',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { color: 'rgba(255, 255, 255, 0.04)' } },
        y: { stacked: true, grid: { color: 'rgba(255, 255, 255, 0.04)' }, ticks: { precision: 0 } }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(13, 17, 30, 0.95)',
          titleColor: '#fff',
          bodyColor: '#e5e7eb',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1
        }
      }
    }
  });

}

function updateCharts() {
  if (!dayChartInstance) return;

  const dayStats = getDailyCounts();
  dayChartInstance.data.labels = dayStats.labels;
  dayChartInstance.data.datasets[0].data = dayStats.incoming;
  dayChartInstance.data.datasets[1].data = dayStats.outgoing;
  dayChartInstance.data.datasets[2].data = dayStats.missed;
  dayChartInstance.update();
}

// Compute call breakdown by day for the persistent 4-day window
function getDailyCounts() {
  const labels = [];
  const incoming = [];
  const outgoing = [];
  const missed = [];

  for (let i = 0; i < 4; i++) {
    const d = new Date(initDate);
    d.setDate(initDate.getDate() + i);
    
    // Relative labels based on current actual system date
    const today = new Date();
    let dayLabel = '';
    
    if (d.toDateString() === today.toDateString()) {
      dayLabel = 'Today';
    } else {
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) {
        dayLabel = 'Yesterday';
      } else {
        dayLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
    }
    labels.push(dayLabel);

    const dStr = d.toDateString();
    const dayCalls = allCalls.filter(c => c.timestamp.toDateString() === dStr);

    incoming.push(dayCalls.filter(c => c.type === 'incoming').length);
    outgoing.push(dayCalls.filter(c => c.type === 'outgoing').length);
    missed.push(dayCalls.filter(c => c.type === 'missed').length);
  }

  return { labels, incoming, outgoing, missed };
}



// Filter the call lists from tab control
window.filterCalls = function(filter) {
  currentFilter = filter;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.textContent.toLowerCase() === filter) {
      btn.classList.add('active');
    }
  });
  renderCallFeed();
};

// Toggle masking system between HTML CSS Blur filter and character X masking
window.setMaskStyle = function(style) {
  maskStyle = style;

  document.getElementById('mask-blur-btn').classList.remove('active');
  document.getElementById('mask-x-btn').classList.remove('active');
  
  if (style === 'blur') {
    document.getElementById('mask-blur-btn').classList.add('active');
  } else {
    document.getElementById('mask-x-btn').classList.add('active');
  }

  renderCallFeed();
};

// Create visual Toast Alert in bottom-right corner for live events
function triggerToast(call) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${call.type}`;
  
  let iconName = 'phone-incoming';
  let title = 'Incoming Call';
  let message = `Incoming connection...`;
  
  if (call.type === 'outgoing') {
    iconName = 'phone-outgoing';
    title = 'Outgoing Call';
    message = `Initiating outbound call...`;
  } else if (call.type === 'missed') {
    iconName = 'phone-missed';
    title = 'Missed Call';
    message = `No answer from caller.`;
  }

  const numberDisplay = maskStyle === 'x' 
    ? `+91 XXXXX-X${call.number.last4}` 
    : `${call.number.first6}${call.number.last4}`;

  toast.innerHTML = `
    <div class="toast-icon">
      <i data-lucide="${iconName}"></i>
    </div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message} • <strong>${numberDisplay}</strong></div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()"><i data-lucide="x"></i></button>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px) scale(0.9)';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// Real-Time System Clock and Log Observer
function startSystemClockObserver() {
  setInterval(() => {
    const now = new Date();
    
    // Update live clock
    const timeFormatted = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    const clockEl = document.getElementById('live-clock');
    if (clockEl) {
      clockEl.textContent = timeFormatted;
    }
    
    // Check if new calls have elapsed and crossed current system time
    let newCallsTriggered = false;
    while (futureCalls.length > 0 && futureCalls[0].timestamp <= now) {
      const nextCall = futureCalls.shift();
      allCalls.push(nextCall);
      triggerToast(nextCall);
      newCallsTriggered = true;
    }

    if (newCallsTriggered) {
      sortAllCalls();
      renderCallFeed();
      updateMetrics();
      updateCharts();
    }
  }, 1000);
}



// App startup initialization
window.addEventListener('DOMContentLoaded', () => {
  initCallDatabase();
  renderCallFeed();
  updateMetrics();
  initCharts();
  
  // Start real-time observer
  startSystemClockObserver();
});
