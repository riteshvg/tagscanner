var de_details_node = document.getElementById('de_details');
if (de_details_node) {
  const params = new Proxy(new URLSearchParams(window.location.search), {
    get: (searchParams, prop) => searchParams.get(prop),
  });
  // Get the value of "some_key" in eg "https://example.com/?some_key=some_value"
  let value = params.dename,
    rule_count = 0,
    dataele_count = 0,
    check_de1 = '_satellite.getVar(\\"' + value + '\\")',
    check_de2 = "_satellite.getVar(\\'" + value + "\\')";
  let key_check = value;
  document.getElementById('h2_header').innerHTML =
    value + ' Data Element Overview';
  value = '%' + value + '%';
  //console.log(check_de1+""+check_de2);
  var rule_value = sessionStorage.getItem('_satellite._container.rules');
  const obj = JSON.parse(rule_value);
  var de_rule_action_count = 0,
    de_rule_condition_count = 0,
    de_rule_event_count = 0,
    de_rule_count = 0;
  for (i = 0; i < obj.length; i++) {
    let de_action_check = 0,
      de_event_check = 0,
      de_condition_check = 0;
    var action_check = JSON.stringify(obj[i].actions);
    var condition_check = JSON.stringify(obj[i].conditions);
    var event_check = JSON.stringify(obj[i].events);
    if (
      action_check.indexOf(value) > -1 ||
      action_check.indexOf(check_de2) > -1 ||
      action_check.indexOf(check_de1) > -1
    ) {
      de_rule_action_count += 1;
      de_action_check = 1;
    } else if (
      condition_check.indexOf(value) > -1 ||
      condition_check.indexOf(check_de2) > -1 ||
      condition_check.indexOf(check_de1) > -1
    ) {
      de_rule_condition_count += 1;
      de_condition_check = 1;
    } else if (
      event_check.indexOf(key_check) > -1 ||
      event_check.indexOf(value) > -1 ||
      event_check.indexOf(check_de2) > -1 ||
      event_check.indexOf(check_de1) > -1
    ) {
      de_rule_event_count += 1;
      de_event_check = 1;
    }
    if (de_action_check > 0 || de_condition_check > 0 || de_event_check > 0) {
      de_rule_count += 1;
      //console.log("count:"+de_rule_count);
      var table = document.getElementById('de_detail_table');
      var tr_aa = document.createElement('tr');
      var th_rule_name = document.createElement('td');
      th_rule_name.innerHTML = obj[i].name;
      var th_rule_action = document.createElement('td');
      if (de_rule_action_count > 0) {
        th_rule_action.innerHTML = 'Yes';
      } else {
        th_rule_action.innerHTML = 'No';
      }
      var th_rule_condition = document.createElement('td');
      if (de_rule_condition_count > 0) {
        th_rule_condition.innerHTML = 'Yes';
      } else {
        th_rule_condition.innerHTML = 'No';
      }
      var th_rule_event = document.createElement('td');
      if (de_rule_event_count > 0) {
        th_rule_event.innerHTML = 'Yes';
      } else {
        th_rule_event.innerHTML = 'No';
      }
      tr_aa.appendChild(th_rule_name);
      tr_aa.appendChild(th_rule_action);
      tr_aa.appendChild(th_rule_condition);
      tr_aa.appendChild(th_rule_event);
      table.appendChild(tr_aa);
    }
  }

  // Data Elements
  var de_name = sessionStorage.getItem('_satellite._container.dataElements');
  const obj1 = JSON.parse(de_name);
  let core_check = 'No',
    type_check = 'No';
  for (var key in obj1) {
    if (obj1.hasOwnProperty(key)) {
      var de_present_check = JSON.stringify(obj1[key]);
      //console.log(de_present_check);
      if (
        de_present_check.indexOf(check_de1) > -1 ||
        de_present_check.indexOf(check_de2) > -1 ||
        de_present_check.indexOf(value) > -1
      ) {
        // Start Extension and DE type code //
        var modulePath_extension = obj1[key].modulePath.split('/');
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
        var type = obj1[key].modulePath;
        if (obj1[key].modulePath.indexOf('dataElements') > -1) {
          type = type.split('dataElements/');
        }
        if (obj1[key].modulePath.indexOf('data_elements') > -1) {
          type = type.split('data_elements/');
        }
        if (type[1]) {
          type[1] = type[1].split('.js');
          type_check = type[1][0];
        }
        type_check = type_check;
        //END of Extension and DE Type Code

        var table = document.getElementById('de_detail_table2');
        var tr_aa = document.createElement('tr');
        var th_extension = document.createElement('td');
        th_extension.innerHTML = core_check;
        var th_type = document.createElement('td');
        th_type.innerHTML = type_check;
        var th_de_name = document.createElement('td');
        th_de_name.innerHTML = key;
        tr_aa.appendChild(th_de_name);
        tr_aa.appendChild(th_extension);
        tr_aa.appendChild(th_type);
        table.appendChild(tr_aa);
        dataele_count += 1;
      }
    }
  }
  // Extension Code
  var extension = sessionStorage.getItem('_satellite._container.extension'),
    dataexe_count = 0;
  const obj2 = JSON.parse(extension);
  for (var key in obj2) {
    if (obj2.hasOwnProperty(key)) {
      console.log(JSON.stringify(obj2[key]));
      if (
        JSON.stringify(obj2[key]).indexOf(check_de2) > -1 ||
        JSON.stringify(obj2[key]).indexOf(check_de1) > -1 ||
        JSON.stringify(obj2[key]).indexOf(value) > -1
      ) {
        var table = document.getElementById('de_detail_table3');
        var tr_aa = document.createElement('tr');
        var th_extension = document.createElement('td');
        th_extension.innerHTML = obj2[key].displayName;
        tr_aa.appendChild(th_extension);
        table.appendChild(tr_aa);
        dataexe_count += 1;
      }
    }
  }

  var rule_table = document.getElementById('rule_collapse');
  rule_table.innerHTML = 'Rules: ' + de_rule_count;
  var de_table = document.getElementById('de_collapse');
  de_table.innerHTML = 'Data Elements: ' + dataele_count;
  var exe_table = document.getElementById('exe_collapse');
  exe_table.innerHTML = 'Extensions: ' + dataexe_count;
  var acc = document.getElementsByClassName('accordion');
  for (i = 0; i < acc.length; i++) {
    acc[i].onclick = function () {
      this.classList.toggle('active');
      var panel = this.nextElementSibling;
      if (panel.style.maxHeight) {
        panel.style.maxHeight = null;
      } else {
        panel.style.maxHeight = panel.scrollHeight + 'px';
      }
    };
  }
}
var set_display = document.getElementById('set_display');
set_display.style = 'display: none;';

// Accordion functionality
document.addEventListener('DOMContentLoaded', function () {
  var acc = document.getElementsByClassName('accordion');
  for (var i = 0; i < acc.length; i++) {
    acc[i].addEventListener('click', function () {
      this.classList.toggle('active');
      var panel = this.nextElementSibling;
      if (panel.style.maxHeight) {
        panel.style.maxHeight = null;
      } else {
        panel.style.maxHeight = panel.scrollHeight + 'px';
      }
    });
  }

  // Open the first accordion by default for better UX
  if (acc.length > 0 && !acc[0].classList.contains('active')) {
    acc[0].click();
  }
});
