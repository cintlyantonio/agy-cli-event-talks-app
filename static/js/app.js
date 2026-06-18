// app.js - BigQuery Release Radar Client Script

// Global Application State
let releaseNotes = [];
let filteredNotes = [];
let activeFilter = 'all';
let searchQuery = '';
let selectedUpdateId = null;

// DOM Elements
const searchInput = document.getElementById('search-input');
const filterPillsContainer = document.getElementById('filter-pills');
const timelineContainer = document.getElementById('timeline-container');
const refreshBtn = document.getElementById('refresh-btn');
const lastUpdatedTime = document.getElementById('last-updated-time');
const connectionStatus = document.getElementById('connection-status');
const tweetTextarea = document.getElementById('tweet-textarea');
const tweetBtn = document.getElementById('tweet-btn');
const charCountText = document.getElementById('char-count-text');
const charProgressCircle = document.getElementById('char-progress-circle');
const selectedDetailPanel = document.getElementById('selected-detail-panel');
const toastContainer = document.getElementById('toast-container');

// SVG Circle Constants for Character Tracker
const CIRCLE_RADIUS = 9;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS; // ~56.55

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    // Set circle properties
    if (charProgressCircle) {
        charProgressCircle.style.strokeDasharray = CIRCLE_CIRCUMFERENCE;
        charProgressCircle.style.strokeDashoffset = CIRCLE_CIRCUMFERENCE;
    }
    
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    
    // Load saved theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        if (themeToggleBtn) {
            themeToggleBtn.innerHTML = `<i data-lucide="moon"></i>`;
        }
    }
    
    // Bind Event Listeners
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light-theme');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
            themeToggleBtn.innerHTML = isLight ? `<i data-lucide="moon"></i>` : `<i data-lucide="sun"></i>`;
            lucide.createIcons();
            showToast(`Theme switched to ${isLight ? 'Light' : 'Dark'} Mode`, 'info');
        });
    }
    
    if (refreshBtn) refreshBtn.addEventListener('click', () => fetchReleaseNotes(true));
    if (searchInput) searchInput.addEventListener('input', handleSearch);
    if (tweetTextarea) tweetTextarea.addEventListener('input', updateCharCount);
    if (tweetBtn) tweetBtn.addEventListener('click', triggerTweet);
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportToCSV);
    
    // Initial Fetch (cached)
    fetchReleaseNotes(false);
});

// Fetch Release Notes from API
async function fetchReleaseNotes(forceRefresh = false) {
    try {
        setLoadingState(true);
        const url = `/api/release-notes${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.status === 'success' || result.status === 'partial_success') {
            releaseNotes = result.data || [];
            
            // Render last fetched timestamp
            if (result.last_fetched) {
                const fetchDate = new Date(result.last_fetched);
                lastUpdatedTime.textContent = fetchDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            }
            
            if (result.status === 'partial_success' && result.warning) {
                showToast(result.warning, 'warning');
            } else {
                showToast(forceRefresh ? 'Release notes refreshed!' : 'Feed loaded successfully.', 'success');
            }
            
            // Build filter pills dynamically to show correct counts
            renderFilters();
            
            // Filter and render timeline
            filterAndRender();
        } else {
            throw new Error(result.message || 'Unknown backend error');
        }
    } catch (error) {
        console.error('Error fetching release notes:', error);
        showToast(`Failed to load release notes: ${error.message}`, 'warning');
        renderErrorState(error.message);
    } finally {
        setLoadingState(false);
    }
}

// Set Loading UI State
function setLoadingState(isLoading) {
    if (refreshBtn) {
        const icon = refreshBtn.querySelector('i');
        if (isLoading) {
            refreshBtn.disabled = true;
            if (icon) icon.classList.add('spin');
        } else {
            refreshBtn.disabled = false;
            if (icon) icon.classList.remove('spin');
        }
    }
    
    if (isLoading && releaseNotes.length === 0) {
        timelineContainer.innerHTML = `
            <div class="loading-card">
                <div class="loading-spinner-large"></div>
                <p>Fetching BigQuery Feed & Parsing Updates...</p>
            </div>
        `;
    }
}

// Render Filters with Dynamic Counts
function renderFilters() {
    // Count different types
    const counts = {
        all: 0,
        feature: 0,
        announcement: 0,
        issue: 0,
        deprecation: 0,
        general: 0
    };
    
    releaseNotes.forEach(entry => {
        if (!entry.updates) return;
        entry.updates.forEach(up => {
            counts.all++;
            const t = up.type.toLowerCase();
            if (t.includes('feature')) counts.feature++;
            else if (t.includes('announcement')) counts.announcement++;
            else if (t.includes('issue')) counts.issue++;
            else if (t.includes('deprecation')) counts.deprecation++;
            else counts.general++;
        });
    });
    
    // Update active filter if it has no entries
    if (activeFilter !== 'all' && counts[activeFilter] === 0) {
        activeFilter = 'all';
    }
    
    // Clean and rebuild pills container
    filterPillsContainer.innerHTML = `
        <button class="filter-pill ${activeFilter === 'all' ? 'active' : ''}" data-type="all">
            All <span class="filter-count">${counts.all}</span>
        </button>
        <button class="filter-pill ${activeFilter === 'feature' ? 'active' : ''}" data-type="feature">
            Features <span class="filter-count">${counts.feature}</span>
        </button>
        <button class="filter-pill ${activeFilter === 'announcement' ? 'active' : ''}" data-type="announcement">
            Announcements <span class="filter-count">${counts.announcement}</span>
        </button>
        <button class="filter-pill ${activeFilter === 'issue' ? 'active' : ''}" data-type="issue">
            Issues <span class="filter-count">${counts.issue}</span>
        </button>
        <button class="filter-pill ${activeFilter === 'deprecation' ? 'active' : ''}" data-type="deprecation">
            Deprecations <span class="filter-count">${counts.deprecation}</span>
        </button>
    `;
    
    // Add event listeners to filter pills
    const pills = filterPillsContainer.querySelectorAll('.filter-pill');
    pills.forEach(pill => {
        pill.addEventListener('click', (e) => {
            // Support clicking target or child
            const type = e.currentTarget.getAttribute('data-type');
            pills.forEach(p => p.classList.remove('active'));
            e.currentTarget.classList.add('active');
            activeFilter = type;
            filterAndRender();
        });
    });
}

// Handle Search Input
function handleSearch(e) {
    searchQuery = e.target.value.toLowerCase();
    filterAndRender();
}

// Filter and Render Timeline Cards
function filterAndRender() {
    let html = '';
    let renderedCount = 0;
    
    releaseNotes.forEach((entry, entryIndex) => {
        // Filter updates within this entry
        const matchingUpdates = (entry.updates || []).filter(up => {
            // Type filter matching
            const type = up.type.toLowerCase();
            let matchesType = false;
            
            if (activeFilter === 'all') matchesType = true;
            else if (activeFilter === 'feature' && type.includes('feature')) matchesType = true;
            else if (activeFilter === 'announcement' && type.includes('announcement')) matchesType = true;
            else if (activeFilter === 'issue' && type.includes('issue')) matchesType = true;
            else if (activeFilter === 'deprecation' && type.includes('deprecation')) matchesType = true;
            
            if (!matchesType) return false;
            
            // Search matching
            if (searchQuery) {
                const textMatch = up.text.toLowerCase().includes(searchQuery);
                const typeMatch = up.type.toLowerCase().includes(searchQuery);
                const dateMatch = entry.title.toLowerCase().includes(searchQuery);
                return textMatch || typeMatch || dateMatch;
            }
            
            return true;
        });
        
        if (matchingUpdates.length > 0) {
            renderedCount += matchingUpdates.length;
            
            // Render Entry Date Card
            html += `
                <div class="timeline-card fade-in-up" id="card-${entryIndex}" style="animation-delay: ${entryIndex * 0.05}s">
                    <div class="card-header">
                        <div class="card-date-group">
                            <div class="card-date-icon">
                                <i data-lucide="calendar"></i>
                            </div>
                            <h2 class="card-date">${entry.title}</h2>
                        </div>
                        <div style="display: flex; gap: 0.75rem; align-items: center;">
                            <button class="btn-action" onclick="copyDayUpdates('${entryIndex}', \`${escapeJSString(entry.title)}\`)" style="color: var(--text-secondary);" title="Copy all updates for this day">
                                <i data-lucide="copy"></i> Copy Day
                            </button>
                            <a href="${entry.link}" target="_blank" class="card-source-link">
                                Source Doc <i data-lucide="external-link"></i>
                            </a>
                        </div>
                    </div>
                    <div class="card-updates-list">
            `;
            
            // Render Updates inside Date Card
            matchingUpdates.forEach(up => {
                const isSelected = selectedUpdateId === up.id;
                const badgeClass = getBadgeClass(up.type);
                
                html += `
                    <div class="update-block ${isSelected ? 'selected-for-tweet' : ''}" data-update-id="${up.id}" id="block-${up.id}">
                        <div class="update-header">
                            <span class="badge ${badgeClass}">${up.type}</span>
                            <div class="select-container">
                                <button class="select-btn" onclick="selectForTweet('${up.id}', '${entry.title}', '${up.type}', \`${escapeJSString(up.text)}\`, '${up.link}')">
                                    <i data-lucide="${isSelected ? 'check-circle-2' : 'circle'}"></i>
                                    ${isSelected ? 'Selected' : 'Select to Tweet'}
                                </button>
                            </div>
                        </div>
                        <div class="update-content">
                            ${up.html}
                        </div>
                        <div class="update-actions">
                            <button class="btn-action" onclick="copyUpdateText('${up.id}', \`${escapeJSString(up.text)}\`)">
                                <i data-lucide="copy"></i> Copy Clean Text
                            </button>
                            <button class="btn-action btn-tweet-direct" onclick="quickTweet('${entry.title}', '${up.type}', \`${escapeJSString(up.text)}\`, '${up.link}')">
                                <i data-lucide="twitter"></i> Quick Tweet
                            </button>
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        }
    });
    
    if (renderedCount === 0) {
        timelineContainer.innerHTML = `
            <div class="empty-card">
                <i data-lucide="search-code" style="width: 48px; height: 48px; color: var(--text-muted);"></i>
                <h3>No updates matched your filters</h3>
                <p>Try clearing your search query or choosing a different filter pill.</p>
            </div>
        `;
    } else {
        timelineContainer.innerHTML = html;
    }
    
    // Refresh Lucide Icons for dynamic content
    lucide.createIcons();
}

// Get appropriate badge color class
function getBadgeClass(type) {
    const t = type.toLowerCase();
    if (t.includes('feature')) return 'badge-feature';
    if (t.includes('announcement')) return 'badge-announcement';
    if (t.includes('issue')) return 'badge-issue';
    if (t.includes('deprecation')) return 'badge-deprecation';
    return 'badge-general';
}

// Escape strings to prevent syntax errors in dynamically generated inline JavaScript calls
function escapeJSString(str) {
    if (!str) return '';
    return str
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$/g, '\\$')
        .replace(/"/g, '\\"')
        .replace(/'/g, "\\'");
}

// Pre-populate Tweet Composer
function selectForTweet(id, date, type, rawText, link) {
    // Check if toggling off
    if (selectedUpdateId === id) {
        selectedUpdateId = null;
        tweetTextarea.value = '';
        tweetTextarea.disabled = true;
        selectedDetailPanel.innerHTML = `
            <div class="selected-meta-title">No Update Selected</div>
            <p>Select an update from the feed to draft your tweet.</p>
        `;
        updateCharCount();
        filterAndRender(); // Update visual state of selected block
        return;
    }
    
    selectedUpdateId = id;
    tweetTextarea.disabled = false;
    
    // Format a beautiful tweet draft. Let's make sure it has summary details.
    // Structure: BQ Update [Date] | [Type]: Brief summary... [Link] #BigQuery
    let formattedText = `BigQuery Update [${date}] • ${type}\n\n`;
    
    // Determine how much text we can include before hitting character limits
    const baseLength = formattedText.length + `\n\n${link} #BigQuery`.length;
    const maxDescLength = 280 - baseLength;
    
    let description = rawText;
    if (description.length > maxDescLength) {
        // Smart truncation: try to truncate at the end of a sentence
        const truncated = description.substring(0, maxDescLength - 3);
        const lastSentenceIndex = Math.max(truncated.lastIndexOf('. '), truncated.lastIndexOf('? '), truncated.lastIndexOf('! '));
        
        if (lastSentenceIndex > maxDescLength * 0.6) {
            description = description.substring(0, lastSentenceIndex + 1) + '...';
        } else {
            description = truncated + '...';
        }
    }
    
    formattedText += `${description}\n\n${link} #BigQuery`;
    
    tweetTextarea.value = formattedText;
    
    // Update Side Panel Info
    selectedDetailPanel.innerHTML = `
        <div class="selected-meta-title">Selected Update Details</div>
        <div style="font-weight: 500; color: var(--text-primary); margin-bottom: 0.25rem;">Date: ${date}</div>
        <div style="margin-bottom: 0.5rem;"><span class="badge ${getBadgeClass(type)}" style="font-size: 0.65rem; padding: 0.1rem 0.4rem;">${type}</span></div>
        <div style="max-height: 80px; overflow-y: auto; font-size: 0.85em; color: var(--text-muted); line-height: 1.4;">${rawText}</div>
    `;
    
    updateCharCount();
    
    // Re-render feed blocks to highlight active selection
    filterAndRender();
    
    // Smooth scroll composer into view on mobile screens
    if (window.innerWidth <= 1024) {
        document.querySelector('.composer-sidebar').scrollIntoView({ behavior: 'smooth' });
    }
}

// Update Character count indicator
function updateCharCount() {
    const text = tweetTextarea.value;
    const len = text.length;
    const maxChars = 280;
    
    charCountText.textContent = `${len}/${maxChars}`;
    
    // Enable/disable buttons based on input
    if (len === 0 || len > maxChars) {
        tweetBtn.disabled = true;
    } else {
        tweetBtn.disabled = false;
    }
    
    // Update Circular Progress
    const percentage = Math.min(len / maxChars, 1);
    const strokeDashoffset = CIRCLE_CIRCUMFERENCE - (percentage * CIRCLE_CIRCUMFERENCE);
    charProgressCircle.style.strokeDashoffset = strokeDashoffset;
    
    // Style adjustments based on limits
    if (len > maxChars) {
        charCountText.className = 'char-count error';
        charProgressCircle.style.stroke = 'var(--color-deprecation)';
    } else if (len > maxChars - 30) {
        charCountText.className = 'char-count warning';
        charProgressCircle.style.stroke = 'var(--color-issue)';
    } else {
        charCountText.className = 'char-count';
        charProgressCircle.style.stroke = 'var(--twitter-blue)';
    }
}

// Open Twitter intent
function triggerTweet() {
    const text = tweetTextarea.value;
    if (!text || text.length > 280) return;
    
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(intentUrl, '_blank', 'noopener,noreferrer');
    showToast('Redirected to Twitter composer!', 'info');
}

// Quick Tweet function
function quickTweet(date, type, rawText, link) {
    let formattedText = `BigQuery Update [${date}] • ${type}\n\n`;
    const baseLength = formattedText.length + `\n\n${link} #BigQuery`.length;
    const maxDescLength = 280 - baseLength;
    
    let description = rawText;
    if (description.length > maxDescLength) {
        description = description.substring(0, maxDescLength - 3) + '...';
    }
    
    formattedText += `${description}\n\n${link} #BigQuery`;
    
    const intentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(formattedText)}`;
    window.open(intentUrl, '_blank', 'noopener,noreferrer');
    showToast('Redirected to Quick Tweet!', 'info');
}

// Copy to clipboard with visual checkmark feedback
function copyUpdateText(id, text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Text copied to clipboard!', 'success');
        
        // Find the specific button in the DOM and trigger feedback
        const block = document.getElementById(`block-${id}`);
        if (block) {
            const btn = block.querySelector('.btn-action:first-child');
            if (btn) {
                const originalHtml = btn.innerHTML;
                btn.innerHTML = `<i data-lucide="check-circle" style="color: var(--color-feature); width: 14px; height: 14px;"></i> Copied!`;
                lucide.createIcons();
                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                    lucide.createIcons();
                }, 2000);
            }
        }
    }).catch(err => {
        console.error('Could not copy text: ', err);
        showToast('Failed to copy text', 'warning');
    });
}

// Copy all updates under a specific date
function copyDayUpdates(cardIndex, dateTitle) {
    const entry = releaseNotes.find(e => e.title === dateTitle);
    if (!entry || !entry.updates) return;
    
    // Combine text from all updates on this day
    const combinedText = entry.updates.map(up => `[${up.type}] ${up.text}`).join('\n\n');
    
    navigator.clipboard.writeText(combinedText).then(() => {
        showToast(`Copied all updates for ${dateTitle}!`, 'success');
        
        // Find copy day button in DOM and trigger feedback
        const card = document.getElementById(`card-${cardIndex}`);
        if (card) {
            const copyBtn = card.querySelector('.card-header button.btn-action');
            if (copyBtn) {
                const originalHtml = copyBtn.innerHTML;
                copyBtn.innerHTML = `<i data-lucide="check-circle" style="color: var(--color-feature); width: 14px; height: 14px;"></i> Copied!`;
                lucide.createIcons();
                setTimeout(() => {
                    copyBtn.innerHTML = originalHtml;
                    lucide.createIcons();
                }, 2000);
            }
        }
    }).catch(err => {
        console.error('Could not copy day text: ', err);
        showToast('Failed to copy text', 'warning');
    });
}

// Export currently filtered releases to a CSV file client-side
function exportToCSV() {
    const csvRows = [];
    csvRows.push(['Date', 'Type', 'Content', 'Link']); // CSV Header
    
    let exportCount = 0;
    
    // Loop entries and updates matching active filters & query
    releaseNotes.forEach(entry => {
        const matchingUpdates = (entry.updates || []).filter(up => {
            const type = up.type.toLowerCase();
            let matchesType = false;
            
            if (activeFilter === 'all') matchesType = true;
            else if (activeFilter === 'feature' && type.includes('feature')) matchesType = true;
            else if (activeFilter === 'announcement' && type.includes('announcement')) matchesType = true;
            else if (activeFilter === 'issue' && type.includes('issue')) matchesType = true;
            else if (activeFilter === 'deprecation' && type.includes('deprecation')) matchesType = true;
            
            if (!matchesType) return false;
            
            if (searchQuery) {
                const textMatch = up.text.toLowerCase().includes(searchQuery);
                const typeMatch = up.type.toLowerCase().includes(searchQuery);
                const dateMatch = entry.title.toLowerCase().includes(searchQuery);
                return textMatch || typeMatch || dateMatch;
            }
            return true;
        });
        
        matchingUpdates.forEach(up => {
            const escapedText = up.text.replace(/"/g, '""'); // Escape inner quotes
            csvRows.push([
                `"${entry.title}"`,
                `"${up.type}"`,
                `"${escapedText}"`,
                `"${up.link}"`
            ]);
            exportCount++;
        });
    });
    
    if (exportCount === 0) {
        showToast('No updates to export in current view.', 'warning');
        return;
    }
    
    // Convert array to CSV string
    const csvContent = csvRows.map(e => e.join(",")).join("\r\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        const timestamp = new Date().toISOString().slice(0, 10);
        link.setAttribute("download", `bigquery_release_notes_${timestamp}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast(`Exported ${exportCount} updates to CSV!`, 'success');
    } else {
        showToast('CSV export not supported in this browser.', 'warning');
    }
}

// Render error state
function renderErrorState(message) {
    timelineContainer.innerHTML = `
        <div class="empty-card" style="border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.02);">
            <i data-lucide="alert-triangle" style="width: 48px; height: 48px; color: var(--color-deprecation);"></i>
            <h3>Unable to retrieve release notes</h3>
            <p style="color: var(--text-muted);">${message || 'Connection timeout or backend parse failure.'}</p>
            <button class="btn-refresh" onclick="fetchReleaseNotes(true)" style="margin-top: 1rem;">
                <i data-lucide="refresh-cw"></i> Retry Connection
            </button>
        </div>
    `;
    lucide.createIcons();
}

// Toast System
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconName = 'check-circle';
    if (type === 'warning') iconName = 'alert-triangle';
    if (type === 'info') iconName = 'twitter';
    
    toast.innerHTML = `
        <i data-lucide="${iconName}"></i>
        <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    lucide.createIcons();
    
    // Fade out and remove
    setTimeout(() => {
        toast.style.animation = 'slide-toast 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) reverse forwards';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}
