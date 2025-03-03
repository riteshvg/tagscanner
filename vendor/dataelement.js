var de_details_node = document.getElementById('dataelement_details');
if (de_details_node) {
  var de_value = sessionStorage.getItem('_satellite._container.dataElements');
  const obj = JSON.parse(de_value);

  // Create thead and tbody elements
  var thead = document.createElement('thead');
  var tbody = document.createElement('tbody');

  // Create header row
  var headerRow = document.createElement('tr');
  var headers = [
    {
      text: 'Data Element Name',
      tooltip: 'Name of the data element in your Adobe Tags property',
    },
    {
      text: 'In Rules',
      tooltip: 'Number of rules where this data element is used',
    },
    {
      text: 'In Data Elements',
      tooltip: 'Whether this data element is referenced by other data elements',
    },
    {
      text: 'In Extension',
      tooltip:
        'Whether this data element is used in any extension configuration',
    },
    {
      text: 'Extension',
      tooltip: 'The extension that provides this data element type',
    },
    { text: 'Type', tooltip: 'The specific data element type' },
    {
      text: 'Size in KB',
      tooltip: 'Size of the data element configuration in kilobytes',
    },
  ];
  headers.forEach((header) => {
    var th = document.createElement('th');
    th.innerHTML =
      header.text +
      ' &nbsp;<i class="fa fa-info-circle" style="font-size: 16px" title="' +
      header.tooltip +
      '"></i>';
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      let value = '%' + key + '%',
        check_de1 = '_satellite.getVar(\\"' + key + '\\")',
        check_de2 = "_satellite.getVar(\\'" + key + "\\')";
      //console.log("value:"+value)
      var rule_value = sessionStorage.getItem('_satellite._container.rules');
      const obj1 = JSON.parse(rule_value);
      var de_rule_count = 0;
      for (i = 0; i < obj1.length; i++) {
        var de_rule_action_count = 0,
          de_rule_condition_count = 0,
          de_rule_event_count = 0;
        var action_check = JSON.stringify(obj1[i].actions);
        var condition_check = JSON.stringify(obj1[i].conditions);
        var event_check = JSON.stringify(obj1[i].events);
        if (
          action_check.indexOf(value) > -1 ||
          action_check.indexOf(check_de2) > -1 ||
          action_check.indexOf(check_de1) > -1
        ) {
          de_rule_action_count += 1;
        } else if (
          condition_check.indexOf(value) > -1 ||
          condition_check.indexOf(check_de2) > -1 ||
          condition_check.indexOf(check_de1) > -1
        ) {
          de_rule_condition_count += 1;
        } else if (
          event_check.indexOf(key) > -1 ||
          event_check.indexOf(value) > -1 ||
          event_check.indexOf(check_de2) > -1 ||
          event_check.indexOf(check_de1) > -1
        ) {
          de_rule_event_count += 1;
        }
        if (
          de_rule_action_count > 0 ||
          de_rule_event_count > 0 ||
          de_rule_condition_count
        ) {
          de_rule_count += 1;
          //console.log("rule name:"+obj1[i].name);
        }
      }
      let de_check = 'No',
        core_check = 'No';
      (type_check = 'NA'), (other_check = 'No'), (extension_check = 'No');
      var de_name_value = sessionStorage.getItem(
        '_satellite._container.dataElements'
      );
      if (
        de_name_value.indexOf(check_de1) > -1 ||
        de_name_value.indexOf(check_de2) > -1 ||
        de_name_value.indexOf(value) > -1
      ) {
        de_check = 'Yes';
      }
      var extension_name_value = sessionStorage.getItem(
        '_satellite._container.extension'
      );
      if (
        extension_name_value.indexOf(check_de1) > -1 ||
        extension_name_value.indexOf(check_de2) > -1 ||
        extension_name_value.indexOf(value) > -1
      ) {
        other_check = 'Yes';
      }
      // Start Extension and DE type code //
      if (obj[key].modulePath) {
        var modulePath_extension = obj[key].modulePath.split('/');
        switch (modulePath_extension[0]) {
          case 'core':
            core_check = 'Core';
            break;
          case 'adobe-alloy':
            core_check = 'Web SDK';
            break;
          case 'gcoe-adobe-client-data-layer':
            core_check = 'ACDL';
            break;
          case 'data-layer-manager-search-discovery':
            core_check = 'DataLayer Manager';
            break;
          case 'adobe-mcid':
            core_check = 'ECID Service';
            break;
          case 'sdi-toolkit':
            core_check = 'SDI Toolkit';
            break;
          case 'common-web-sdk-plugins':
            core_check = 'Common Web SDK Plugin';
            break;

          default:
            core_check = modulePath_extension[0];
        }
        var type = obj[key].modulePath;
        if (obj[key].modulePath.indexOf('dataElements') > -1) {
          type = type.split('dataElements/');
        }
        if (obj[key].modulePath.indexOf('data_elements') > -1) {
          type = type.split('data_elements/');
        }
        if (type[1]) {
          type[1] = type[1].split('.js');
          type_check = type[1][0];
        }
        type_check = type_check;
      }
      //END of Extension and DE Type Code
      const byte = (str) => {
        let size = new Blob([str]).size;
        return size;
      };
      var size = byte(JSON.stringify(obj[key]));
      var tr = document.createElement('tr');
      tr.classList.add('data-displayed');
      var th_de_name = document.createElement('td');
      th_de_name.style.width = '30%';
      var a = document.createElement('a');
      a.href = 'dedetails.html?dename=' + key;
      a.target = 'iframe2';
      a.style.textDecoration = 'none';
      a.innerHTML = key;
      th_de_name.appendChild(a);
      var th_core = document.createElement('td');
      th_core.innerHTML = core_check;
      var th_type = document.createElement('td');
      th_type.innerHTML = type_check;
      var th_others = document.createElement('td');
      th_others.innerHTML = other_check;
      var th_rule_action = document.createElement('td');
      th_rule_action.innerHTML = de_rule_count;
      if (de_rule_count < 1) {
        tr.classList.add('rule-0');
      } else {
        tr.classList.add('rule-1');
      }
      var th_size = document.createElement('td');
      th_size.innerHTML = Number((size / 1000).toFixed(2));
      if (th_others.innerHTML == 'Yes') {
        th_others.style.color = 'green';
      } else {
        th_others.style.color = 'red';
      }
      tr.classList.add('extension-' + other_check);
      var th_de = document.createElement('td');
      th_de.innerHTML = de_check;
      if (th_de.innerHTML == 'Yes') {
        th_de.style.color = 'green';
      } else {
        th_de.style.color = 'red';
      }
      tr.classList.add('de-' + de_check);
      tr.appendChild(th_de_name);
      tr.appendChild(th_rule_action);
      tr.appendChild(th_de);
      tr.appendChild(th_others);
      tr.appendChild(th_core);
      tr.appendChild(th_type);
      tr.appendChild(th_size);
      tbody.appendChild(tr);
    }
  }

  // Append thead and tbody to the table
  de_details_node.appendChild(thead);
  de_details_node.appendChild(tbody);

  // Pagination variables
  const rowsPerPage = 15;
  let currentPage =
    parseInt(sessionStorage.getItem('dataElementsCurrentPage')) || 1;
  const rows = Array.from(tbody.getElementsByTagName('tr'));
  const totalPages = Math.ceil(rows.length / rowsPerPage);

  // Update page info
  const updatePageInfo = () => {
    document.getElementById('currentPage').textContent = currentPage;
    document.getElementById('totalPages').textContent = totalPages;
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage === totalPages;
    // Save current page to sessionStorage
    sessionStorage.setItem('dataElementsCurrentPage', currentPage);
  };

  // Show rows for current page
  const showPage = (page) => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;

    rows.forEach((row, index) => {
      row.style.display = index >= start && index < end ? '' : 'none';
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

var download_button = document.getElementsByClassName('download-button');
if (download_button[0]) {
  var csv = [];
  var rows = document.querySelectorAll('table tr');
  for (var i = 0; i < rows.length; i++) {
    var row = [],
      cols = rows[i].querySelectorAll('td, th');

    for (var j = 0; j < cols.length; j++) row.push(cols[j].innerText);

    csv.push(row.join(','));
  }

  // Download CSV file
  downloadCSV(csv.join('\n'), 'dateelements.csv');
}

function downloadCSV(csv, filename) {
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
  downloadLink.style.color = 'black';
  downloadLink.innerHTML = 'Export CSV File ';
  downloadLink.style.textAlign = 'right';
  download_button[0].appendChild(downloadLink);
}
var set_display = document.getElementById('set_display');
set_display.style = 'display: none;';
