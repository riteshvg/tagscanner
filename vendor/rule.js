var rule_details_node = document.getElementById('rule_details');
if (rule_details_node) {
  var rule = sessionStorage.getItem('_satellite._container.rules');
  const obj = JSON.parse(rule);

  // Create thead and tbody elements
  var thead = document.createElement('thead');
  var tbody = document.createElement('tbody');

  // Create header row
  var headerRow = document.createElement('tr');
  var headers = [
    {
      text: 'Rule Name',
      tooltip: 'Name of the rule in your Adobe Tags property',
    },
    { text: 'Events', tooltip: 'Event types that trigger this rule' },
    { text: 'Conditions', tooltip: 'Whether this rule has any conditions' },
    { text: 'Core', tooltip: 'Whether this rule uses Core extension actions' },
    {
      text: 'Adobe Analytics',
      tooltip: 'Whether this rule uses Adobe Analytics extension actions',
    },
    {
      text: 'Web SDK',
      tooltip: 'Whether this rule uses Web SDK extension actions',
    },
    {
      text: 'Size in KB',
      tooltip: 'Size of the rule configuration in kilobytes',
    },
  ];
  headers.forEach((header, index) => {
    var th = document.createElement('th');
    th.innerHTML = `${header.text} &nbsp;<i class="fa fa-info-circle" style="font-size: 16px" title="${header.tooltip}"></i>`;
    th.classList.add('sortable');

    // Add click handler for sorting
    th.addEventListener('click', function () {
      sortTable(index);
    });

    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  for (i = 0; i < obj.length; i++) {
    var aa_rule_check = 'No',
      websdk_rule_check = 'No',
      core_rule_check = 'No';
    if (obj[i].actions) {
      for (j = 0; j < obj[i].actions.length; j++) {
        if (obj[i].actions[j].modulePath.indexOf('adobe-analytics/') > -1) {
          aa_rule_check = 'Yes';
        }
        if (obj[i].actions[j].modulePath.indexOf('adobe-alloy/') > -1) {
          websdk_rule_check = 'Yes';
        }
        if (obj[i].actions[j].modulePath.indexOf('core/') > -1) {
          core_rule_check = 'Yes';
        }
      }
    }
    var conditions_check = 'No',
      event_check = 'No';
    if (obj[i].conditions && obj[i].conditions.length > 0) {
      conditions_check = 'Yes';
    }
    if (obj[i].events && obj[i].events.length > 0) {
      var event_obj = {};
      for (k = 0; k < obj[i].events.length; k++) {
        var path = obj[i].events[k].modulePath;
        path = path.split('events/');
        if (path[1]) {
          path[1] = path[1].split('.js');
          if (event_check == 'No') {
            event_obj[obj[i].name] = {};
            event_obj[obj[i].name][path[1][0]] = {};
            event_check = path[1][0];
          } else {
            if (!event_obj[obj[i].name][path[1][0]]) {
              event_obj[obj[i].name][path[1][0]] = {};
              event_check = event_check + ':' + path[1][0];
            }
          }
        }
      }
    }
    const byte = (str) => {
      let size = new Blob([str]).size;
      return size;
    };
    var size = byte(JSON.stringify(obj[i]));
    var tr = document.createElement('tr');
    tr.classList.add('data-displayed');
    var th_rule_name = document.createElement('td');
    // Create an anchor element
    var ruleLink = document.createElement('a');
    ruleLink.innerHTML = obj[i].name.replaceAll(',', '');
    ruleLink.href = `ruledetails.html?rulename=${encodeURIComponent(
      obj[i].name
    )}`;
    ruleLink.classList.add('rule-link');
    th_rule_name.appendChild(ruleLink);
    var th_events = document.createElement('td');
    th_events.innerHTML = event_check;
    tr.classList.add('event-' + event_check);
    var th_conditions = document.createElement('td');
    th_conditions.innerHTML = conditions_check;
    tr.classList.add('conditions-' + conditions_check);
    var th_aa = document.createElement('td');
    th_aa.innerHTML = aa_rule_check;
    tr.classList.add('aa-' + aa_rule_check);
    var th_web = document.createElement('td');
    th_web.innerHTML = websdk_rule_check;
    tr.classList.add('websdk-' + websdk_rule_check);
    var th_core = document.createElement('td');
    th_core.innerHTML = core_rule_check;
    tr.classList.add('core-' + core_rule_check);
    var th_size = document.createElement('td');
    th_size.innerHTML = Number((size / 1000).toFixed(2));
    tr.appendChild(th_rule_name);
    tr.appendChild(th_events);
    tr.appendChild(th_conditions);
    tr.appendChild(th_core);
    tr.appendChild(th_aa);
    tr.appendChild(th_web);
    tr.appendChild(th_size);
    tbody.appendChild(tr);
  }

  // Append thead and tbody to the table
  rule_details_node.appendChild(thead);
  rule_details_node.appendChild(tbody);

  // Pagination variables
  const rowsPerPage = 15;
  let currentPage = parseInt(sessionStorage.getItem('rulesCurrentPage')) || 1;
  const rows = Array.from(tbody.getElementsByTagName('tr'));
  const totalPages = Math.ceil(rows.length / rowsPerPage);

  // Update page info
  const updatePageInfo = () => {
    document.getElementById('currentPage').textContent = currentPage;
    document.getElementById('totalPages').textContent = totalPages;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage === totalPages;
    // Save current page to sessionStorage
    sessionStorage.setItem('rulesCurrentPage', currentPage);
  };

  // Show rows for current page
  const showPage = (page) => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;

    rows.forEach((row, index) => {
      if (index >= start && index < end) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });

    updatePageInfo();
  };

  // Add event listeners for pagination
  document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      showPage(currentPage);
    }
  });

  document.getElementById('nextPage').addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      showPage(currentPage);
    }
  });

  // Initialize with saved page or first page
  showPage(currentPage);
}

// Add proper null checks for the download button
var download_button = document.getElementsByClassName('download-button');
if (download_button && download_button.length > 0) {
  var table = document.getElementById('rule_details');
  if (table) {
    var csv = [];
    var rows = table.querySelectorAll('tr');
    if (rows && rows.length > 0) {
      for (var i = 0; i < rows.length; i++) {
        var row = [],
          cols = rows[i].querySelectorAll('td, th');

        for (var j = 0; j < cols.length; j++) row.push(cols[j].innerText);

        csv.push(row.join(','));
      }
      // Download CSV file
      downloadCSV(csv.join('\n'), 'rules.csv');
    }
  }
}

function downloadCSV(csv, filename) {
  if (!csv || !filename) return;

  var csvFile;
  var downloadLink;

  // CSV file
  csvFile = new Blob([csv], {
    type: 'text/csv',
  });

  // Download link
  downloadLink = document.createElement('a');
  downloadLink.download = filename;
  downloadLink.href = window.URL.createObjectURL(csvFile);
  downloadLink.style.color = 'white';
  downloadLink.innerHTML = 'Export CSV File ';
  downloadLink.style.textAlign = 'right';

  var download_button = document.getElementsByClassName('download-button');
  if (download_button && download_button.length > 0) {
    download_button[0].appendChild(downloadLink);
  }
}
var set_display = document.getElementById('set_display');
if (set_display) {
  set_display.style = 'display: none;';
}

// Add null checks before adding event listeners
const applyFilter = document.getElementById('apply-filter');
if (applyFilter) {
  applyFilter.addEventListener('click', openNav);
}

const closeBtn = document.getElementById('apply-filter-closebtn');
if (closeBtn) {
  closeBtn.addEventListener('click', closeNav);
}

const closeBtn2 = document.getElementById('apply-filter-closebtn2');
if (closeBtn2) {
  closeBtn2.addEventListener('click', closeNav2);
}

function closeNav2() {
  const overlay = document.getElementById('myNav');
  if (overlay) {
    overlay.style.width = '0%';
  }
}

/* Open when someone clicks on the span element */
function openNav() {
  const overlay = document.getElementById('myNav');
  if (overlay) {
    overlay.style.width = '30%';
    overlay.style.height = '60%';
  }
}

/* Close when someone clicks on the "x" symbol inside the overlay */
function closeNav() {
  const overlay = document.getElementById('myNav');
  if (!overlay) return;

  overlay.style.width = '0%';

  const conditionsFilter = document.getElementById('conditions-filter');
  const aaFilter = document.getElementById('aa-filter');
  const coreFilter = document.getElementById('core-filter');
  const websdkFilter = document.getElementById('websdk-filter');

  if (!conditionsFilter || !aaFilter || !coreFilter || !websdkFilter) return;

  var c = conditionsFilter.value;
  var aa = aaFilter.value;
  var core = coreFilter.value;
  var websdk = websdkFilter.value;

  var k = document.getElementsByClassName('data-displayed');
  let visibleRows = 0;
  for (i = 0; i < k.length; i++) {
    if (
      k[i].className.indexOf(c) < 0 ||
      k[i].className.indexOf(aa) < 0 ||
      k[i].className.indexOf(core) < 0 ||
      k[i].className.indexOf(websdk) < 0
    ) {
      k[i].style.display = 'none';
    } else {
      k[i].style.display = '';
      visibleRows++;
    }
  }

  // Reset to page 1 only when filtering
  currentPage = 1;
  totalPages = Math.ceil(visibleRows / rowsPerPage);
  sessionStorage.setItem('rulesCurrentPage', currentPage);
  showPage(1);
}

// Modify sortTable function to maintain page state
function sortTable(column) {
  var table = document.getElementById('rule_details');
  var rows = Array.from(table.getElementsByTagName('tr')).slice(1); // Skip header row
  var isAscending = table.getAttribute('data-sort-' + column) !== 'asc';

  rows.sort((a, b) => {
    var aValue = a.cells[column].textContent;
    var bValue = b.cells[column].textContent;

    if (!isNaN(aValue) && !isNaN(bValue)) {
      return isAscending ? aValue - bValue : bValue - aValue;
    }
    return isAscending
      ? aValue.localeCompare(bValue)
      : bValue.localeCompare(aValue);
  });

  // Update sort direction
  table.setAttribute('data-sort-' + column, isAscending ? 'asc' : 'desc');

  // Update sort indicators
  var headers = table.getElementsByTagName('th');
  for (var i = 0; i < headers.length; i++) {
    headers[i].classList.remove('sorted-asc', 'sorted-desc');
  }
  headers[column].classList.add(isAscending ? 'sorted-asc' : 'sorted-desc');

  // Reorder rows
  var tbody = table.getElementsByTagName('tbody')[0];
  rows.forEach((row) => tbody.appendChild(row));

  // Reset to page 1 only when sorting
  currentPage = 1;
  sessionStorage.setItem('rulesCurrentPage', currentPage);
  showPage(1);
}
