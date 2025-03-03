var dataelement_list = {};
var dataelement_code = {}; // Store custom code for data elements

function reoccur(k, params, path, dataElement) {
  var res = Object.keys(k[params]);
  if (res.length == 0 || res[0] == '0') {
    var print_list = path + '.' + params;
    print_list = print_list.replaceAll('xdm.', '');
    dataelement_list[dataElement] = dataelement_list[dataElement] || [];
    dataelement_list[dataElement].push({ name: print_list, value: k[params] });
    return params;
  }
  path += '.' + params;
  for (var j = 0; j < res.length; j++) {
    var x = reoccur(k[params], res[j], path, dataElement);
  }
  return params;
}

var de_value = sessionStorage.getItem('_satellite._container.dataElements');
const obj1 = JSON.parse(de_value);
for (var key in obj1) {
  if (obj1.hasOwnProperty(key)) {
    if (obj1[key].settings && obj1[key].settings.data) {
      // Store the custom code if it exists
      if (obj1[key].settings.customJS) {
        dataelement_code[key] = obj1[key].settings.customJS;
      }

      var k = obj1[key].settings.data;
      if (typeof k === 'object' && k !== null) {
        var res = Object.keys(k);
        for (var i = 0; i < res.length; i++) {
          var path = '';
          var x = reoccur(k, res[i], path, key);
        }
      }
    }
  }
}

var rule_details_node = document.getElementById('aep_variables_websdk');
var rule_value = sessionStorage.getItem('_satellite._container.rules');
const obj2 = JSON.parse(rule_value);
var rule_list = {};
for (var key in obj2) {
  if (obj2.hasOwnProperty(key)) {
    var ruleName = obj2[key].name;
    var events = obj2[key].events;
    var conditions = obj2[key].conditions;
    var actions = obj2[key].actions;
    rule_list[ruleName] = [];
    for (var i = 0; i < actions.length; i++) {
      if (
        actions[i].modulePath == 'adobe-analytics/src/lib/actions/sendBeacon.js'
      ) {
        var settings = actions[i].settings;
        var tracker = settings.tracker;
        var xdm = settings.xdm;
        if (xdm) {
          var xdmObject = Object.keys(xdm)[0];
          if (xdmObject.indexOf('%') > -1) {
            var xdmObjects = xdmObject.replaceAll('%', '');
            var xdmPathloop = dataelement_list[xdmObjects];
            if (xdmPathloop) {
              for (t = 0; t < xdmPathloop.length; t++) {
                var tr = document.createElement('tr');
                var th_rule_name = document.createElement('td');
                th_rule_name.innerHTML = ruleName;
                var th_xdm_obj = document.createElement('td');
                th_xdm_obj.innerHTML = xdmObjects;
                var th_xdm_schema = document.createElement('td');
                th_xdm_schema.innerHTML = xdmPathloop[t].name;
                var th_xdm_value = document.createElement('td');
                th_xdm_value.innerHTML = xdmPathloop[t].value;

                // Add custom code column
                var th_custom_code = document.createElement('td');
                if (dataelement_code[xdmObjects]) {
                  var codeBtn = document.createElement('button');
                  codeBtn.className = 'btn btn-primary btn-sm';
                  codeBtn.innerHTML = 'View Code';
                  codeBtn.setAttribute('data-toggle', 'modal');
                  codeBtn.setAttribute('data-target', '#codeModal');
                  codeBtn.setAttribute(
                    'data-code',
                    dataelement_code[xdmObjects]
                  );
                  codeBtn.setAttribute('data-element', xdmObjects);
                  th_custom_code.appendChild(codeBtn);
                } else {
                  th_custom_code.innerHTML = 'No custom code';
                }

                tr.appendChild(th_rule_name);
                tr.appendChild(th_xdm_obj);
                tr.appendChild(th_xdm_schema);
                tr.appendChild(th_xdm_value);
                tr.appendChild(th_custom_code);
                rule_details_node.appendChild(tr);
              }
            } else {
              var tr = document.createElement('tr');
              var th_rule_name = document.createElement('td');
              th_rule_name.innerHTML = ruleName;
              var th_xdm_obj = document.createElement('td');
              th_xdm_obj.innerHTML = xdmObjects;

              // Add empty cells for schema path and value
              var th_xdm_schema = document.createElement('td');
              var th_xdm_value = document.createElement('td');

              // Add custom code column
              var th_custom_code = document.createElement('td');
              if (dataelement_code[xdmObjects]) {
                var codeBtn = document.createElement('button');
                codeBtn.className = 'btn btn-primary btn-sm';
                codeBtn.innerHTML = 'View Code';
                codeBtn.setAttribute('data-toggle', 'modal');
                codeBtn.setAttribute('data-target', '#codeModal');
                codeBtn.setAttribute('data-code', dataelement_code[xdmObjects]);
                codeBtn.setAttribute('data-element', xdmObjects);
                th_custom_code.appendChild(codeBtn);
              } else {
                th_custom_code.innerHTML = 'No custom code';
              }

              tr.appendChild(th_rule_name);
              tr.appendChild(th_xdm_obj);
              tr.appendChild(th_xdm_schema);
              tr.appendChild(th_xdm_value);
              tr.appendChild(th_custom_code);
              rule_details_node.appendChild(tr);
            }
          } else {
            var xdmPath = Object.keys(xdm[xdmObject]);
            for (var j = 0; j < xdmPath.length; j++) {
              var tr = document.createElement('tr');
              var th_rule_name = document.createElement('td');
              th_rule_name.innerHTML = ruleName;
              var th_xdm_obj = document.createElement('td');
              th_xdm_obj.innerHTML = xdmObject;
              var th_xdm_schema = document.createElement('td');
              th_xdm_schema.innerHTML = xdmPath[j];
              var th_xdm_value = document.createElement('td');
              var xdmPathValue = xdm[xdmObject][xdmPath[j]];
              if (xdmPathValue.indexOf('%') > -1) {
                var xdmPathValues = xdmPathValue.replaceAll('%', '');
                th_xdm_value.innerHTML = xdmPathValues;

                // Add custom code column
                var th_custom_code = document.createElement('td');
                if (dataelement_code[xdmPathValues]) {
                  var codeBtn = document.createElement('button');
                  codeBtn.className = 'btn btn-primary btn-sm';
                  codeBtn.innerHTML = 'View Code';
                  codeBtn.setAttribute('data-toggle', 'modal');
                  codeBtn.setAttribute('data-target', '#codeModal');
                  codeBtn.setAttribute(
                    'data-code',
                    dataelement_code[xdmPathValues]
                  );
                  codeBtn.setAttribute('data-element', xdmPathValues);
                  th_custom_code.appendChild(codeBtn);
                } else {
                  th_custom_code.innerHTML = 'No custom code';
                }
              } else {
                th_xdm_value.innerHTML = xdmPathValue;
                // Add empty custom code cell
                var th_custom_code = document.createElement('td');
                th_custom_code.innerHTML = 'No custom code';
              }

              tr.appendChild(th_rule_name);
              tr.appendChild(th_xdm_obj);
              tr.appendChild(th_xdm_schema);
              tr.appendChild(th_xdm_value);
              tr.appendChild(th_custom_code);
              rule_details_node.appendChild(tr);
            }
          }
        }
      }
    }
  }
}

// Add a modal for displaying the custom code
var modalDiv = document.createElement('div');
modalDiv.className = 'modal fade';
modalDiv.id = 'codeModal';
modalDiv.tabIndex = '-1';
modalDiv.role = 'dialog';
modalDiv.setAttribute('aria-labelledby', 'codeModalLabel');
modalDiv.setAttribute('aria-hidden', 'true');

modalDiv.innerHTML = `
<div class="modal-dialog modal-lg" role="document">
  <div class="modal-content">
    <div class="modal-header">
      <h5 class="modal-title" id="codeModalLabel">Custom Code for <span id="elementName"></span></h5>
      <button type="button" class="close" data-dismiss="modal" aria-label="Close">
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
    <div class="modal-body">
      <pre><code id="customCodeContent" style="white-space: pre-wrap; word-break: break-all;"></code></pre>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
    </div>
  </div>
</div>
`;

document.body.appendChild(modalDiv);

// Add event listener for the modal
$(document).on(
  'click',
  '[data-toggle="modal"][data-target="#codeModal"]',
  function () {
    var code = $(this).data('code');
    var element = $(this).data('element');
    $('#elementName').text(element);
    $('#customCodeContent').text(code);
  }
);
