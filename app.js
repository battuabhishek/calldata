// State management for the dashboard
let allCalls = [];           // Stores visible calls
let futureCalls = [];        // Stores future calls to feed the live update observer
let currentFilter = 'all';   // 'all', 'incoming', 'outgoing', 'missed'

// Date selection states
let selectedDate = null;
let initDate = null; // Stays for compatibility
const minDate = new Date(2026, 0, 1); // January 1, 2026
let maxDate = null;
let fullSchedule = []; // Stays for structure compatibility

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

function generateRealisticLast4(rand) {
  while (true) {
    const num = Math.floor(rand() * 9000) + 1000;
    const numStr = num.toString();
    
    // Prevent numbers ending in 00 or 000
    if (numStr.endsWith('00')) continue;
    
    // Avoid repetitive digits (e.g. 1111, 8888)
    if (numStr[0] === numStr[1] && numStr[1] === numStr[2] && numStr[2] === numStr[3]) continue;
    
    // Avoid simple ascending/descending runs
    if (num === 1234 || num === 2345 || num === 3456 || num === 4567 || num === 5678 || num === 6789 || num === 9876 || num === 8765 || num === 7654 || num === 6543 || num === 5432 || num === 4321) continue;
    
    return numStr;
  }
}

function generatePhoneNumber(rand) {
  const prefixes = ['98765', '98123', '88765', '78901', '90123', '80123', '70123', '60123'];
  const firstPart = prefixes[Math.floor(rand() * prefixes.length)];
  const middleDigit = Math.floor(rand() * 10);
  const last4 = generateRealisticLast4(rand);
  
  return {
    full: `+91 ${firstPart}-${middleDigit}${last4}`,
    first6: `+91 ${firstPart}-${middleDigit}`,
    last4: last4
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
  const maxSec = endHour * 3600;     // End of active window (11:00 PM = 82800s)
  
  // Initial random offset (10 to 45 mins)
  currentSec += Math.floor(rand() * 35 + 10) * 60;

  // Decide deterministic number of long calls for this day (1, 2, or 3)
  const targetLongCalls = Math.floor(rand() * 3) + 1;
  let longCallsCount = 0;

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
    } else if (rType < 0.80) {
      type = 'outgoing';
    } else {
      type = 'missed';
    }

    // Determine duration
    if (type !== 'missed') {
      let isLong = false;
      const isLateHour = (currentSec >= 20 * 3600); // Past 8 PM
      if (longCallsCount < targetLongCalls && (rand() < 0.20 || (isLateHour && longCallsCount === 0))) {
        isLong = true;
        longCallsCount++;
      }

      if (isLong) {
        // 20 minutes to 1 hour 30 minutes (1200 to 5400 seconds)
        duration = Math.floor(rand() * 4200) + 1200;
      } else {
        // Normal duration: 1 to 15 minutes (60 to 900 seconds)
        duration = Math.floor(rand() * 840) + 60;
      }
    } else {
      duration = 0;
    }

    calls.push({
      id: `call_${seed}_${currentSec}`,
      number: generatePhoneNumber(rand),
      type: type,
      duration: duration,
      timestamp: callTime
    });

    // Random timing intervals between call occurrences (gap between end of prev call and start of next)
    const intervalR = rand();
    let intervalSec = 0;
    
    if (intervalR < 0.45) {
      intervalSec = Math.floor(rand() * 35 + 10) * 60; // 10 to 45 mins
    } else if (intervalR < 0.80) {
      intervalSec = Math.floor(rand() * 75 + 45) * 60; // 45 to 120 mins
    } else {
      intervalSec = Math.floor(rand() * 120 + 120) * 60; // 2 hours to 4 hours
    }

    // Enforce single-line non-overlapping calls
    currentSec += duration + intervalSec;
  }

  return calls;
}

// Generate calls for the currently selected date, hiding active/future calls for Today
function generateCallsForSelectedDate() {
  const dayCalls = generateDayCalls(selectedDate, 8, 23);
  const now = new Date();
  
  allCalls = [];
  futureCalls = [];
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (selectedDate.toDateString() === today.toDateString()) {
    // Reveal Today's calls dynamically
    dayCalls.forEach(call => {
      const endTime = new Date(call.timestamp.getTime() + call.duration * 1000);
      if (endTime <= now) {
        allCalls.push(call);
      } else {
        futureCalls.push(call);
      }
    });
  } else {
    // Past day: all calls are completed
    allCalls = dayCalls;
  }
  
  sortAllCalls();
  futureCalls.sort((a, b) => a.timestamp - b.timestamp);
}

// Update the native calendar picker value, bounds, and visual label
function populateDateDropdown() {
  const picker = document.getElementById('date-select');
  const label = document.getElementById('date-display-label');
  if (!picker) return;
  
  const yyyy = selectedDate.getFullYear();
  const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
  const dd = String(selectedDate.getDate()).padStart(2, '0');
  picker.value = `${yyyy}-${mm}-${dd}`;
  
  picker.min = "2026-01-01";
  const today = new Date();
  const tY = today.getFullYear();
  const tM = String(today.getMonth() + 1).padStart(2, '0');
  const tD = String(today.getDate()).padStart(2, '0');
  picker.max = `${tY}-${tM}-${tD}`;
  
  if (label) {
    label.textContent = selectedDate.toLocaleDateString('en-US', { day: 'numeric', weekday: 'short' });
  }
}

// Enable/Disable next/prev month and day buttons based on January 2026 - Today boundaries
function updateNavigationStates() {
  const prevMonthBtn = document.getElementById('prev-month-btn');
  const nextMonthBtn = document.getElementById('next-month-btn');
  const prevDayBtn = document.getElementById('prev-day-btn');
  const nextDayBtn = document.getElementById('next-day-btn');
  
  if (prevMonthBtn) {
    prevMonthBtn.disabled = (selectedDate.getFullYear() === minDate.getFullYear() && selectedDate.getMonth() === minDate.getMonth());
  }
  if (nextMonthBtn) {
    nextMonthBtn.disabled = (selectedDate.getFullYear() === maxDate.getFullYear() && selectedDate.getMonth() === maxDate.getMonth());
  }
  
  if (prevDayBtn) {
    const prevDay = new Date(selectedDate);
    prevDay.setDate(selectedDate.getDate() - 1);
    prevDayBtn.disabled = (prevDay < minDate);
  }
  if (nextDayBtn) {
    const nextDay = new Date(selectedDate);
    nextDay.setDate(selectedDate.getDate() + 1);
    nextDayBtn.disabled = (nextDay > maxDate);
  }
}

// Reload call feed, charts, and metrics for the active selectedDate
function loadSelectedDate() {
  initDate = selectedDate; // Sync initDate for daily counts / charts
  
  generateCallsForSelectedDate();
  populateDateDropdown();
  
  const monthLabel = document.getElementById('current-month-display');
  if (monthLabel) {
    monthLabel.textContent = selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  
  const dayLabel = document.getElementById('current-day-label');
  if (dayLabel) {
    dayLabel.textContent = selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }
  
  updateNavigationStates();
  renderCallFeed();
  updateMetrics();
  updateCharts();
  
  // Re-initialize icons
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// Jump to previous/next month
window.changeMonth = function(dir) {
  const newDate = new Date(selectedDate);
  newDate.setMonth(selectedDate.getMonth() + dir);
  
  // Clamp boundaries
  if (newDate > maxDate) {
    selectedDate = new Date(maxDate);
  } else if (newDate < minDate) {
    selectedDate = new Date(minDate);
  } else {
    selectedDate = newDate;
  }
  
  loadSelectedDate();
};

// Jump to previous/next day
window.changeDay = function(dir) {
  const newDate = new Date(selectedDate);
  newDate.setDate(selectedDate.getDate() + dir);
  
  if (newDate > maxDate || newDate < minDate) return;
  
  selectedDate = newDate;
  loadSelectedDate();
};

// Jump to date from select dropdown
window.jumpToDate = function(isoString) {
  const newDate = new Date(isoString);
  if (newDate > maxDate || newDate < minDate) return;
  selectedDate = newDate;
  loadSelectedDate();
};

// Load schedule dynamically on-the-fly starting from Today
function initCallDatabase() {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today
  maxDate = today;
  selectedDate = new Date(maxDate);
  
  loadSelectedDate();
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

      // Formatting phone number with CSS blur masking
      const phoneHTML = `
        <span class="phone-number-display">
          <span class="mask-blur">${call.number.first6}</span>
          <span class="visible-digits">${call.number.last4}</span>
        </span>
      `;

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

// Compute call breakdown by day for a rolling 7-day window ending on the selectedDate
function getDailyCounts() {
  const labels = [];
  const incoming = [];
  const outgoing = [];
  const missed = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(selectedDate);
    d.setDate(selectedDate.getDate() - i);
    
    // Relative labels based on current actual system date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
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

    // Generate calls for day 'd' dynamically to count call types
    const dayCalls = generateDayCalls(d, 8, 23);
    
    if (d.toDateString() === today.toDateString()) {
      const now = new Date();
      const completedCalls = dayCalls.filter(c => {
        const endTime = new Date(c.timestamp.getTime() + c.duration * 1000);
        return endTime <= now;
      });
      incoming.push(completedCalls.filter(c => c.type === 'incoming').length);
      outgoing.push(completedCalls.filter(c => c.type === 'outgoing').length);
      missed.push(completedCalls.filter(c => c.type === 'missed').length);
    } else if (d > today) {
      incoming.push(0);
      outgoing.push(0);
      missed.push(0);
    } else {
      incoming.push(dayCalls.filter(c => c.type === 'incoming').length);
      outgoing.push(dayCalls.filter(c => c.type === 'outgoing').length);
      missed.push(dayCalls.filter(c => c.type === 'missed').length);
    }
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

  const numberDisplay = `${call.number.first6}${call.number.last4}`;

  toast.innerHTML = `
    <div class="toast-icon">
      <i data-lucide="${iconName}"></i>
    </div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">
        ${message} • 
        <strong style="display: inline-flex; align-items: center;">
          <span class="mask-blur" style="margin-right: 2px;">${call.number.first6}</span>
          <span class="visible-digits">${call.number.last4}</span>
        </strong>
      </div>
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
    
    // Check if new calls have finished (meaning their end time has passed)
    let newCallsTriggered = false;
    while (futureCalls.length > 0) {
      const nextCall = futureCalls[0];
      const endTime = new Date(nextCall.timestamp.getTime() + nextCall.duration * 1000);
      if (endTime <= now) {
        futureCalls.shift();
        allCalls.push(nextCall);
        triggerToast(nextCall);
        newCallsTriggered = true;
      } else {
        break;
      }
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
