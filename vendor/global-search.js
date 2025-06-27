/**
 * Global Search Implementation for TagScanner
 * This script provides comprehensive search functionality across all components in Adobe Tags
 */

// Global variables
let searchHistory = [];
let dataElements = {};
let rules = [];
let extensions = {};
let searchResults = [];
let isSearching = false;

// Document ready
document.addEventListener('DOMContentLoaded', function () {
  // Initialize back button
  document.getElementById('back-button').addEventListener('click', function () {
    window.location.href = 'summary.html';
  });

  // Load component data
  loadComponentData();

  // Load search history from localStorage
  loadSearchHistory();

  // Initialize search input events
  initSearchInput();

  // Initialize search button
  document
    .getElementById('search-button')
    .addEventListener('click', performSearch);

  // Initialize keyboard shortcut for search
  document.addEventListener('keydown', function (e) {
    if (
      e.key === '/' &&
      document.activeElement !== document.getElementById('global-search-input')
    ) {
      e.preventDefault();
      document.getElementById('global-search-input').focus();
    }

    // Enter key in search input
    if (
      e.key === 'Enter' &&
      document.activeElement === document.getElementById('global-search-input')
    ) {
      performSearch();
    }
  });

  // Initialize filter change events
  document
    .getElementById('component-type')
    .addEventListener('change', performSearch);
  document.getElementById('sort-by').addEventListener('change', performSearch);
  document
    .getElementById('search-in')
    .addEventListener('change', performSearch);
});

/**
 * Initialize search input events
 */
function initSearchInput() {
  const searchInput = document.getElementById('global-search-input');
  const historyDropdown = document.getElementById('search-history');

  // Show history dropdown on focus
  searchInput.addEventListener('focus', function () {
    if (searchHistory.length > 0) {
      updateHistoryDropdown();
      historyDropdown.style.display = 'block';
    }
  });

  // Hide history dropdown when clicking outside
  document.addEventListener('click', function (e) {
    if (
      !searchInput.contains(e.target) &&
      !historyDropdown.contains(e.target)
    ) {
      historyDropdown.style.display = 'none';
    }
  });

  // Clear history button
  document
    .getElementById('clear-history')
    .addEventListener('click', function () {
      searchHistory = [];
      localStorage.setItem(
        'tagScanner_searchHistory',
        JSON.stringify(searchHistory)
      );
      historyDropdown.style.display = 'none';
    });
}

/**
 * Load search history from localStorage
 */
function loadSearchHistory() {
  const savedHistory = localStorage.getItem('tagScanner_searchHistory');
  if (savedHistory) {
    searchHistory = JSON.parse(savedHistory);
  }
}

/**
 * Update the history dropdown with recent searches
 */
function updateHistoryDropdown() {
  const historyDropdown = document.getElementById('search-history');

  // Clear previous items
  while (
    historyDropdown.firstChild &&
    historyDropdown.firstChild.id !== 'clear-history'
  ) {
    historyDropdown.removeChild(historyDropdown.firstChild);
  }

  // Add history items
  searchHistory.slice(0, 5).forEach((term) => {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.textContent = term;
    historyItem.addEventListener('click', function () {
      document.getElementById('global-search-input').value = term;
      performSearch();
      historyDropdown.style.display = 'none';
    });

    // Insert before clear history button
    historyDropdown.insertBefore(
      historyItem,
      document.getElementById('clear-history')
    );
  });
}

/**
 * Load component data from sessionStorage
 */
function loadComponentData() {
  try {
    // Get data from sessionStorage
    const dataElementsStr = sessionStorage.getItem(
      '_satellite._container.dataElements'
    );
    const rulesStr = sessionStorage.getItem('_satellite._container.rules');
    const extensionsStr = sessionStorage.getItem(
      '_satellite._container.extension'
    );

    // Parse JSON data
    dataElements = dataElementsStr ? JSON.parse(dataElementsStr) : {};
    rules = rulesStr ? JSON.parse(rulesStr) : [];
    extensions = extensionsStr ? JSON.parse(extensionsStr) : {};

    console.log('Component data loaded:', {
      dataElements: Object.keys(dataElements).length,
      rules: rules.length,
      extensions: Object.keys(extensions).length,
    });
  } catch (error) {
    console.error('Error loading component data:', error);
    showError(
      'Failed to load component data. Please try returning to the main page.'
    );
  }
}

/**
 * Perform search based on current input and filters
 */
function performSearch() {
  // Get search term
  const searchTerm = document
    .getElementById('global-search-input')
    .value.trim();

  // If empty search term, show initial state
  if (!searchTerm) {
    showInitialState();
    return;
  }

  // If already searching, don't start another search
  if (isSearching) return;

  // Get filter values
  const componentType = document.getElementById('component-type').value;
  const sortBy = document.getElementById('sort-by').value;
  const searchIn = document.getElementById('search-in').value;

  // Add to search history if not already present
  if (!searchHistory.includes(searchTerm)) {
    searchHistory.unshift(searchTerm);
    searchHistory = searchHistory.slice(0, 10); // Keep only 10 most recent
    localStorage.setItem(
      'tagScanner_searchHistory',
      JSON.stringify(searchHistory)
    );
  }

  // Show loading state
  showLoadingState();

  // Use setTimeout to prevent UI freezing
  setTimeout(() => {
    searchResults = [];

    try {
      // Perform search based on component type
      if (componentType === 'all' || componentType === 'rule') {
        searchInRules(searchTerm, searchIn);
      }

      if (componentType === 'all' || componentType === 'dataElement') {
        searchInDataElements(searchTerm, searchIn);
      }

      if (componentType === 'all' || componentType === 'extension') {
        searchInExtensions(searchTerm, searchIn);
      }

      // Sort results
      sortResults(sortBy);

      // Display results
      displayResults();
    } catch (error) {
      console.error('Error during search:', error);
      showError('An error occurred while searching. Please try again.');
    }

    // Reset searching flag
    isSearching = false;
  }, 10);
}

/**
 * Search in rules
 */
function searchInRules(searchTerm, searchIn) {
  const termLower = searchTerm.toLowerCase();

  rules.forEach((rule) => {
    let matches = [];

    // Search in name
    if (searchIn === 'all' || searchIn === 'name') {
      if (rule.name && rule.name.toLowerCase().includes(termLower)) {
        matches.push({
          field: 'name',
          text: rule.name,
          context: getContext(rule.name, termLower),
        });
      }
    }

    // Search in settings
    if (searchIn === 'all' || searchIn === 'settings') {
      // Search in events
      if (rule.events && Array.isArray(rule.events)) {
        rule.events.forEach((event, idx) => {
          const eventStr = JSON.stringify(event);
          if (eventStr.toLowerCase().includes(termLower)) {
            matches.push({
              field: `Event ${idx + 1}`,
              text: getEventTypeName(event),
              context: getContext(eventStr, termLower),
            });
          }
        });
      }

      // Search in conditions
      if (rule.conditions && Array.isArray(rule.conditions)) {
        rule.conditions.forEach((condition, idx) => {
          if (condition.settings && !condition.settings.source) {
            const conditionStr = JSON.stringify(condition);
            if (conditionStr.toLowerCase().includes(termLower)) {
              matches.push({
                field: `Condition ${idx + 1}`,
                text: getConditionTypeName(condition),
                context: getContext(conditionStr, termLower),
              });
            }
          }
        });
      }

      // Search in actions
      if (rule.actions && Array.isArray(rule.actions)) {
        rule.actions.forEach((action, idx) => {
          if (action.settings && !action.settings.source) {
            const actionStr = JSON.stringify(action);
            if (actionStr.toLowerCase().includes(termLower)) {
              matches.push({
                field: `Action ${idx + 1}`,
                text: getActionTypeName(action),
                context: getContext(actionStr, termLower),
              });
            }
          }
        });
      }
    }

    // Search in custom code
    if (searchIn === 'all' || searchIn === 'code') {
      // Search in condition custom code
      if (rule.conditions && Array.isArray(rule.conditions)) {
        rule.conditions.forEach((condition, idx) => {
          if (condition.settings && condition.settings.source) {
            const source = condition.settings.source;
            if (source.toLowerCase().includes(termLower)) {
              matches.push({
                field: `Condition ${idx + 1} Code`,
                text: 'Custom Code',
                context: getContext(source, termLower),
              });
            }
          }
        });
      }

      // Search in action custom code
      if (rule.actions && Array.isArray(rule.actions)) {
        rule.actions.forEach((action, idx) => {
          const source =
            action.settings?.source || action.settings?.customSetup?.source;
          if (source && source.toLowerCase().includes(termLower)) {
            matches.push({
              field: `Action ${idx + 1} Code`,
              text: 'Custom Code',
              context: getContext(source, termLower),
            });
          }
        });
      }
    }

    // If matches found, add to results
    if (matches.length > 0) {
      searchResults.push({
        id: rule.id,
        name: rule.name,
        type: 'Rule',
        matches: matches,
        matchCount: matches.length,
        link: `rule.html?ruleId=${rule.id}`,
      });
    }
  });
}

/**
 * Search in data elements
 */
function searchInDataElements(searchTerm, searchIn) {
  const termLower = searchTerm.toLowerCase();

  Object.entries(dataElements).forEach(([name, config]) => {
    let matches = [];

    // Search in name
    if (searchIn === 'all' || searchIn === 'name') {
      if (name.toLowerCase().includes(termLower)) {
        matches.push({
          field: 'name',
          text: name,
          context: getContext(name, termLower),
        });
      }
    }

    // Search in settings
    if (searchIn === 'all' || searchIn === 'settings') {
      if (config.settings && !config.settings.source) {
        const settingsStr = JSON.stringify(config.settings);
        if (settingsStr.toLowerCase().includes(termLower)) {
          matches.push({
            field: 'settings',
            text: getDataElementTypeName(config),
            context: getContext(settingsStr, termLower),
          });
        }
      }
    }

    // Search in custom code
    if (searchIn === 'all' || searchIn === 'code') {
      if (config.settings && config.settings.source) {
        const source = config.settings.source;
        if (source.toLowerCase().includes(termLower)) {
          matches.push({
            field: 'code',
            text: 'Custom Code',
            context: getContext(source, termLower),
          });
        }
      }
    }

    // If matches found, add to results
    if (matches.length > 0) {
      searchResults.push({
        id: name,
        name: name,
        type: 'Data Element',
        matches: matches,
        matchCount: matches.length,
        link: `dedetails.html?deid=${encodeURIComponent(name)}`,
      });
    }
  });
}

/**
 * Search in extensions
 */
function searchInExtensions(searchTerm, searchIn) {
  const termLower = searchTerm.toLowerCase();

  Object.entries(extensions).forEach(([id, config]) => {
    let matches = [];

    // Search in name
    if (searchIn === 'all' || searchIn === 'name') {
      const displayName = config.displayName || id;
      if (displayName.toLowerCase().includes(termLower)) {
        matches.push({
          field: 'name',
          text: displayName,
          context: getContext(displayName, termLower),
        });
      }
    }

    // Search in settings
    if (searchIn === 'all' || searchIn === 'settings') {
      const configStr = JSON.stringify(config);
      if (configStr.toLowerCase().includes(termLower)) {
        matches.push({
          field: 'settings',
          text: 'Extension Settings',
          context: getContext(configStr, termLower),
        });
      }
    }

    // If matches found, add to results
    if (matches.length > 0) {
      searchResults.push({
        id: id,
        name: config.displayName || id,
        type: 'Extension',
        matches: matches,
        matchCount: matches.length,
        link: `extensiondetails.html?extensionname=${encodeURIComponent(id)}`,
      });
    }
  });
}

/**
 * Sort search results based on selected sort method
 */
function sortResults(sortBy) {
  switch (sortBy) {
    case 'nameAsc':
      searchResults.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'nameDesc':
      searchResults.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case 'newest':
      // As we don't have created date, we'll use ID as a proxy (newer items might have higher IDs)
      searchResults.sort((a, b) => {
        if (typeof a.id === 'number' && typeof b.id === 'number') {
          return b.id - a.id;
        } else {
          return 0;
        }
      });
      break;
    case 'relevance':
    default:
      // Sort by match count (more matches = higher relevance)
      searchResults.sort((a, b) => b.matchCount - a.matchCount);
      break;
  }
}

/**
 * Display search results
 */
function displayResults() {
  const resultsContainer = document.getElementById('results-list');
  const resultCount = document.getElementById('result-count');

  // Clear previous results
  resultsContainer.innerHTML = '';

  // Update result count
  resultCount.textContent = `${searchResults.length} results found`;

  // If no results
  if (searchResults.length === 0) {
    resultsContainer.innerHTML = `
      <div class="no-results">
        <i class="fas fa-search fa-3x mb-3 text-gray-300"></i>
        <p>No results found. Try a different search term or filter.</p>
      </div>
    `;
    return;
  }

  // Add each result
  searchResults.forEach((result) => {
    const resultItem = document.createElement('div');
    resultItem.className = 'result-item';

    // Get icon based on type
    let icon = 'fa-question-circle';
    if (result.type === 'Rule') icon = 'fa-wrench';
    if (result.type === 'Data Element') icon = 'fa-database';
    if (result.type === 'Extension') icon = 'fa-plug';

    // Create result content
    resultItem.innerHTML = `
      <div class="result-type">
        <i class="fas ${icon} mr-1"></i> ${result.type}
      </div>
      <div class="result-title">
        <a href="${result.link}" target="iframe2">${highlightText(
      result.name,
      document.getElementById('global-search-input').value
    )}</a>
      </div>
      <div class="result-details">
        ${result.matches
          .slice(0, 2)
          .map(
            (match) => `
          <div class="mb-2">
            <strong>${match.field}:</strong> ${match.context}
          </div>
        `
          )
          .join('')}
        ${
          result.matches.length > 2
            ? `<div class="text-muted">+ ${
                result.matches.length - 2
              } more matches</div>`
            : ''
        }
      </div>
    `;

    resultsContainer.appendChild(resultItem);
  });
}

/**
 * Show initial state (no search performed yet)
 */
function showInitialState() {
  const resultsContainer = document.getElementById('results-list');
  const resultCount = document.getElementById('result-count');

  resultCount.textContent = '0 results found';
  resultsContainer.innerHTML = `
    <div class="no-results">
      <i class="fas fa-search fa-3x mb-3 text-gray-300"></i>
      <p>Search for components across your Adobe Tags property</p>
    </div>
  `;
}

/**
 * Show loading state during search
 */
function showLoadingState() {
  isSearching = true;

  const resultsContainer = document.getElementById('results-list');
  const resultCount = document.getElementById('result-count');

  resultCount.innerHTML = '<span class="loader"></span> Searching...';
  resultsContainer.innerHTML = `
    <div class="text-center p-5">
      <div class="spinner-border text-primary" role="status">
        <span class="sr-only">Loading...</span>
      </div>
      <p class="mt-3">Searching across all components...</p>
    </div>
  `;
}

/**
 * Show error message
 */
function showError(message) {
  const resultsContainer = document.getElementById('results-list');
  const resultCount = document.getElementById('result-count');

  resultCount.textContent = 'Error';
  resultsContainer.innerHTML = `
    <div class="alert alert-danger">
      <i class="fas fa-exclamation-triangle mr-2"></i> ${message}
    </div>
  `;
}

/**
 * Extract context around a match
 */
function getContext(text, searchTerm) {
  if (typeof text !== 'string') {
    text = String(text);
  }

  const index = text.toLowerCase().indexOf(searchTerm.toLowerCase());
  if (index === -1) return text;

  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + searchTerm.length + 20);

  let result = '';
  if (start > 0) result += '...';
  result += text.substring(start, index);
  result += `<span class="highlight">${text.substring(
    index,
    index + searchTerm.length
  )}</span>`;
  result += text.substring(index + searchTerm.length, end);
  if (end < text.length) result += '...';

  return result;
}

/**
 * Highlight search term in text
 */
function highlightText(text, searchTerm) {
  if (!searchTerm) return text;

  const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
  return text.replace(regex, '<span class="highlight">$1</span>');
}

/**
 * Escape special characters in string for use in regex
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get readable event type name
 */
function getEventTypeName(event) {
  if (!event || !event.modulePath) return 'Unknown Event';

  const path = event.modulePath.split('/');
  if (path.length >= 2) {
    const eventType = path[path.length - 1].replace('.js', '');
    return formatTitleCase(eventType);
  }

  return 'Unknown Event';
}

/**
 * Get readable condition type name
 */
function getConditionTypeName(condition) {
  if (!condition || !condition.modulePath) return 'Unknown Condition';

  const path = condition.modulePath.split('/');
  if (path.length >= 2) {
    const conditionType = path[path.length - 1].replace('.js', '');
    return formatTitleCase(conditionType);
  }

  return 'Unknown Condition';
}

/**
 * Get readable action type name
 */
function getActionTypeName(action) {
  if (!action || !action.modulePath) return 'Unknown Action';

  const path = action.modulePath.split('/');
  if (path.length >= 2) {
    const actionType = path[path.length - 1].replace('.js', '');
    return formatTitleCase(actionType);
  }

  return 'Unknown Action';
}

/**
 * Get readable data element type name
 */
function getDataElementTypeName(dataElement) {
  if (!dataElement || !dataElement.modulePath) return 'Unknown Type';

  const path = dataElement.modulePath.split('/');
  if (path.length >= 2) {
    const deType = path[path.length - 1].replace('.js', '');
    return formatTitleCase(deType);
  }

  return 'Unknown Type';
}

/**
 * Format a string as title case
 */
function formatTitleCase(str) {
  return str.replace(/([A-Z])/g, ' $1').replace(/^./, function (s) {
    return s.toUpperCase();
  });
}
