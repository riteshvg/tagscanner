var extension_details_node = document.getElementById('extension_details');
//console.log("in extension script");
if (extension_details_node) {
  //console.log("in extension script");
  var extension = sessionStorage.getItem('_satellite._container.extension');
  const obj = JSON.parse(extension);
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      const byte = (str) => {
        let size = new Blob([str]).size;
        return size;
      };
      var size = byte(JSON.stringify(obj[key]));
      var tr_extension = document.createElement('tr');
      var th_extension = document.createElement('td');
      var th_action = document.createElement('td');
      th_action.id = 'rule_action_' + key;
      th_action.innerHTML = '0';
      var th_events = document.createElement('td');
      th_events.id = 'rule_events_' + key;
      th_events.innerHTML = '0';
      var th_conditions = document.createElement('td');
      th_conditions.id = 'rule_conditions_' + key;
      th_conditions.innerHTML = '0';
      var th_de = document.createElement('td');
      th_de.id = 'de_' + key;
      th_de.innerHTML = '0';
      var th_size = document.createElement('td');
      th_size.innerHTML = Number((size / 1000).toFixed(2));
      var a = document.createElement('a');
      a.href = 'extensiondetails.html?extensionname=' + key;
      a.target = 'iframe2';
      a.style.textDecoration = 'none';
      a.innerHTML = obj[key].displayName;
      th_extension.appendChild(a);
      tr_extension.appendChild(th_extension);
      tr_extension.appendChild(th_action);
      tr_extension.appendChild(th_events);
      tr_extension.appendChild(th_conditions);
      tr_extension.appendChild(th_de);
      tr_extension.appendChild(th_size);
      extension_details_node.appendChild(tr_extension);
    }
  }

  // Rules code
  var rule = sessionStorage.getItem('_satellite._container.rules');
  const rule_obj = JSON.parse(rule);
  let value_obj = {},
    extension_obj = {};
  for (i = 0; i < rule_obj.length; i++) {
    extension_obj = {};
    if (rule_obj[i].actions) {
      for (j = 0; j < rule_obj[i].actions.length; j++) {
        if (rule_obj[i].actions[j].modulePath) {
          var modulePath_action = rule_obj[i].actions[j].modulePath.split('/');
          extension_obj[modulePath_action[0]] =
            extension_obj[modulePath_action[0]] || {};
          if (!extension_obj[modulePath_action[0]].actionvalue) {
            extension_obj[modulePath_action[0]].actionvalue = 1;
            value_obj[modulePath_action[0]] =
              value_obj[modulePath_action[0]] || {};
            value_obj[modulePath_action[0]].ruleaction =
              value_obj[modulePath_action[0]].ruleaction + 1 || 1;
            if (!value_obj[modulePath_action[0]][rule_obj[i].name]) {
              value_obj[modulePath_action[0]][rule_obj[i].name] =
                value_obj[modulePath_action[0]][rule_obj[i].name] || {};
              value_obj[modulePath_action[0]][rule_obj[i].name].rule = 1;
            } else {
              value_obj[modulePath_action[0]][rule_obj[i].name].rule = 1;
            }
          }
        }
      }
    }
    //end-for-actions
    if (rule_obj[i].events) {
      for (j = 0; j < rule_obj[i].events.length; j++) {
        if (rule_obj[i].events[j].modulePath) {
          var modulePath_events = rule_obj[i].events[j].modulePath.split('/');
          extension_obj[modulePath_events[0]] =
            extension_obj[modulePath_events[0]] || {};
          if (!extension_obj[modulePath_events[0]].eventvalue) {
            extension_obj[modulePath_events[0]].eventvalue = 1;
            value_obj[modulePath_events[0]] =
              value_obj[modulePath_events[0]] || {};
            value_obj[modulePath_events[0]].ruleevents =
              value_obj[modulePath_events[0]].ruleevents + 1 || 1;
            if (!value_obj[modulePath_events[0]][rule_obj[i].name]) {
              value_obj[modulePath_events[0]][rule_obj[i].name] =
                value_obj[modulePath_events[0]][rule_obj[i].name] || {};
              value_obj[modulePath_events[0]][rule_obj[i].name].events = 1;
            } else {
              value_obj[modulePath_events[0]][rule_obj[i].name].events = 1;
            }
          }
        }
      }
    }
    //end-for-events
    if (rule_obj[i].conditions) {
      for (j = 0; j < rule_obj[i].conditions.length; j++) {
        if (rule_obj[i].conditions[j].modulePath) {
          var modulePath_conditions =
            rule_obj[i].conditions[j].modulePath.split('/');
          extension_obj[modulePath_conditions[0]] =
            extension_obj[modulePath_conditions[0]] || {};
          if (!extension_obj[modulePath_conditions[0]].conditionsvalue) {
            extension_obj[modulePath_conditions[0]].conditionsvalue = 1;
            value_obj[modulePath_conditions[0]] =
              value_obj[modulePath_conditions[0]] || {};
            value_obj[modulePath_conditions[0]].conditionsvalue =
              value_obj[modulePath_conditions[0]].conditionsvalue + 1 || 1;
            if (!value_obj[modulePath_conditions[0]][rule_obj[i].name]) {
              value_obj[modulePath_conditions[0]][rule_obj[i].name] =
                value_obj[modulePath_conditions[0]][rule_obj[i].name] || {};
              value_obj[modulePath_conditions[0]][
                rule_obj[i].name
              ].conditions = 1;
            } else {
              value_obj[modulePath_conditions[0]][
                rule_obj[i].name
              ].conditions = 1;
            }
          }
        }
      }
    }
  }
  //end rule code
  //start of DE
  var de_value = sessionStorage.getItem('_satellite._container.dataElements');
  const de_obj = JSON.parse(de_value);
  extension_obj = {};
  for (var key in de_obj) {
    if (de_obj.hasOwnProperty(key) && de_obj[key].modulePath) {
      var modulePath_de = de_obj[key].modulePath;
      modulePath_de = modulePath_de.split('/');
      value_obj[modulePath_de[0]] = value_obj[modulePath_de[0]] || {};
      value_obj[modulePath_de[0]].devalue =
        value_obj[modulePath_de[0]].devalue + 1 || 1;
      if (!value_obj[modulePath_de[0]]['dataelement']) {
        value_obj[modulePath_de[0]]['dataelement'] = [];
        value_obj[modulePath_de[0]]['dataelement'].push({
          name: key,
          path: de_obj[key].modulePath,
        });
      } else {
        value_obj[modulePath_de[0]]['dataelement'].push({
          name: key,
          path: de_obj[key].modulePath,
        });
      }
    }
  }
  //End of DE
  // values
  var extension = sessionStorage.setItem(
    '_satellite._extension',
    JSON.stringify(value_obj)
  );
  for (var key in value_obj) {
    if (value_obj.hasOwnProperty(key)) {
      if (value_obj[key].ruleaction) {
        document.getElementById('rule_action_' + key).innerHTML =
          value_obj[key].ruleaction;
      }
      if (value_obj[key].ruleevents) {
        document.getElementById('rule_events_' + key).innerHTML =
          value_obj[key].ruleevents;
      }
      if (value_obj[key].conditionsvalue) {
        document.getElementById('rule_conditions_' + key).innerHTML =
          value_obj[key].conditionsvalue;
      }
      if (value_obj[key].devalue) {
        document.getElementById('de_' + key).innerHTML = value_obj[key].devalue;
      }
    }
  }
  //End Values
}

var download_button = document.getElementsByClassName('download-button');
if (download_button[0]) {
  console.log('I am an alert box!');
  var csv = [];
  var rows = document.querySelectorAll('table tr');
  for (var i = 0; i < rows.length; i++) {
    var row = [],
      cols = rows[i].querySelectorAll('td, th');

    for (var j = 0; j < cols.length; j++) row.push(cols[j].innerText);

    csv.push(row.join(','));
  }
  // Download CSV file
  console.log('Hey');
  downloadCSV(csv.join('\n'), 'extension.csv');
}

function downloadCSV(csv, filename) {
  console.log('hhh');
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
