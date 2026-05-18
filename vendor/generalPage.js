// Chrome Web Store: do not load remote scripts (script-src 'self'). Provide _satellite from sessionStorage instead.
(function () {
  try {
    var rulesStr = sessionStorage.getItem('_satellite._container.rules');
    var rules = rulesStr ? JSON.parse(rulesStr) : [];
    window._satellite = window._satellite || {};
    window._satellite._container = window._satellite._container || {};
    window._satellite._container.rules = Array.isArray(rules) ? rules : (rules.rules && Array.isArray(rules.rules) ? rules.rules : []);
  } catch (e) {}
})();

var appendScript = sessionStorage.getItem('unique_launch_code');
  let value = document.getElementById('original_launch_code');
  // Do not inject remote script (Chrome Web Store policy: no remotely hosted code)
  if (appendScript && (appendScript.indexOf('http://') !== 0 && appendScript.indexOf('https://') !== 0)) {
    var head_node = document.getElementsByTagName("head")[0];
    if (head_node) {
      var launch_script = document.createElement("script");
      launch_script.src = appendScript;
      launch_script.id = "original_launch_code";
      head_node.appendChild(launch_script);
    }
  }
  var view_aa_variables = document.getElementsByClassName('view_analytics_variables')[0];
  if (view_aa_variables) {
    view_aa_variables.id = 'analytics_variables';
    view_aa_variables.innerHTML = 'View AA Variables';
    document.getElementById('analytics_variables').addEventListener("click", aaVariables);
  }
    function aaVariables() {
      var set_display = document.getElementById('set_display');
      set_display.style="display: flex;"
        var table = document.getElementById('general_page_aa');
        var launch_rules = _satellite._container.rules;
        for(i=0;i<launch_rules.length;i++){
            for(j=0;j<launch_rules[i].actions.length;j++){
                if(launch_rules[i].actions[j].modulePath.indexOf('adobe-analytics/src/lib/actions/setVariables.js')>-1){
                  var tr =  document.createElement('tr');
                  var aa_name_td = document.createElement('td');
                  aa_name_td.innerHTML = launch_rules[i].name;
                  tr.appendChild(aa_name_td);
                  var eVars_list= "";
                  var cust_eVars_list = "";
                  if(launch_rules[i].actions[j].settings && launch_rules[i].actions[j].settings.trackerProperties && launch_rules[i].actions[j].settings.trackerProperties.eVars){
                    for(evar_length = 0; evar_length < launch_rules[i].actions[j].settings.trackerProperties.eVars.length;evar_length++){
                        eVars_list+= launch_rules[i].actions[j].settings.trackerProperties.eVars[evar_length].name;
                        eVars_list+="|";
                    }
                  }
                  if(launch_rules[i].actions[j].settings && launch_rules[i].actions[j].settings.customSetup && launch_rules[i].actions[j].settings.customSetup.source && launch_rules[i].actions[j].settings.customSetup.source.toString().indexOf('eVar')>-1 ){
                    var k = launch_rules[i].actions[j].settings.customSetup.source.toString();
                     k = k.split('eVar');
                     for(len=1;len<k.length;len++){
                        if(Number(k[len][0]) > -1){
                          cust_eVars_list+='c_eVar'+k[len][0];
                            if(Number(k[len][1]) > -1){
                              cust_eVars_list+=k[len][1];
                              if(Number(k[len][2]) > -1){
                                cust_eVars_list+=k[len][2]; 
                              }
                            }
                            cust_eVars_list+='|';
                        } 
                     }
                  }
                  if(eVars_list.indexOf('|')>-1){
                  let arr = eVars_list.split('|');
                  function removeDuplicates(arr) {
                    return arr.filter((item,index) => arr.indexOf(item) === index);
                }
                eVars_list = removeDuplicates(arr).join('|');
            }
            if(cust_eVars_list.indexOf('|')>-1){
              let arr = cust_eVars_list.split('|');
              function removeDuplicates(arr) {
                return arr.filter((item,index) => arr.indexOf(item) === index);
            }
            cust_eVars_list = removeDuplicates(arr).join('|');
        }
            
                  var aa_evar = document.createElement('td');
                    aa_evar.innerHTML = eVars_list;
                    tr.appendChild(aa_evar);
                  var c_aa_evar = document.createElement('td');
                    c_aa_evar.innerHTML = cust_eVars_list;
                    tr.appendChild(c_aa_evar);
                    var props_list= "";
                    var cust_props_list = "";
                  if(launch_rules[i].actions[j].settings && launch_rules[i].actions[j].settings.trackerProperties && launch_rules[i].actions[j].settings.trackerProperties.props){
                    for(prop_length = 0; prop_length < launch_rules[i].actions[j].settings.trackerProperties.props.length;prop_length++){
                        props_list+= launch_rules[i].actions[j].settings.trackerProperties.props[prop_length].name;
                        props_list+="|";
                    }
                  }
                  if(launch_rules[i].actions[j].settings && launch_rules[i].actions[j].settings.customSetup && launch_rules[i].actions[j].settings.customSetup.source && launch_rules[i].actions[j].settings.customSetup.source.toString().indexOf('prop')>-1 ){
                    var k = launch_rules[i].actions[j].settings.customSetup.source.toString();
                     k = k.split('prop');
                     for(len=1;len<k.length;len++){
                        if(Number(k[len][0]) > -1){
                          cust_props_list+='c_prop'+k[len][0];
                            if(Number(k[len][1]) > -1){
                              cust_props_list+=k[len][1];
                            }
                            cust_props_list+='|';
                        }
                        
                     }
                  }
                  if(props_list.indexOf('|')>-1){
                    let arr = props_list.split('|');
                    function removeDuplicates(arr) {
                      return arr.filter((item,index) => arr.indexOf(item) === index);
                  }
                  props_list = removeDuplicates(arr).join('|');
              }
              if(cust_props_list.indexOf('|')>-1){
                let arr = cust_props_list.split('|');
                function removeDuplicates(arr) {
                  return arr.filter((item,index) => arr.indexOf(item) === index);
              }
              cust_props_list = removeDuplicates(arr).join('|');
          }
                  var aa_prop = document.createElement('td');
                    aa_prop.innerHTML = props_list;
                    tr.appendChild(aa_prop);
                    var c_aa_prop = document.createElement('td');
                    c_aa_prop.innerHTML = cust_props_list;
                    tr.appendChild(c_aa_prop);
                    var events_list= "";
                    var cust_events_list = "";
                  if(launch_rules[i].actions[j].settings && launch_rules[i].actions[j].settings.trackerProperties && launch_rules[i].actions[j].settings.trackerProperties.events){
                    for(event_length = 0; event_length < launch_rules[i].actions[j].settings.trackerProperties.events.length;event_length++){
                        events_list+= launch_rules[i].actions[j].settings.trackerProperties.events[event_length].name;
                        events_list+="|";
                    }
                  }
                  if(launch_rules[i].actions[j].settings && launch_rules[i].actions[j].settings.customSetup && launch_rules[i].actions[j].settings.customSetup.source && launch_rules[i].actions[j].settings.customSetup.source.toString().indexOf('event')>-1 ){
                     var k = launch_rules[i].actions[j].settings.customSetup.source.toString();
                     k = k.split('event');
                     for(len=1;len<k.length;len++){
                        if(Number(k[len][0]) > 0){
                          cust_events_list+='c_event'+k[len][0];
                            if(Number(k[len][1]) > -1){
                              cust_events_list+=k[len][1];
                              if(Number(k[len][2]) > -1){
                                cust_events_list+=k[len][2];
                                if(Number(k[len][3]) > -1){
                                  cust_events_list+=k[len][3];
                                }
                              }
                            }
                            cust_events_list+='|';
                        }
                        
                     }
                  }
                  if(events_list.indexOf('|')>-1){
                    let arr = events_list.split('|');
                    function removeDuplicates(arr) {
                      return arr.filter((item,index) => arr.indexOf(item) === index);
                  }
                  events_list = removeDuplicates(arr).join('|');
              }
              if(cust_events_list.indexOf('|')>-1){
                let arr = cust_events_list.split('|');
                function removeDuplicates(arr) {
                  return arr.filter((item,index) => arr.indexOf(item) === index);
              }
              cust_events_list = removeDuplicates(arr).join('|');
          }
                  var aa_event = document.createElement('td');
                  aa_event.innerHTML = events_list;
                  tr.appendChild(aa_event);
                  var c_aa_event = document.createElement('td');
                  c_aa_event.innerHTML = cust_events_list;
                  tr.appendChild(c_aa_event);
                  table.appendChild(tr);
                }
            }
        }

        //Analytics extensions variable code
        const aa_extension = _satellite._container.extensions['adobe-analytics'];
        let aa_extension_evar = "",aa_extension_prop = "",aa_extension_event = "";
        if(aa_extension.settings && aa_extension.settings.trackerProperties){
          if(aa_extension.settings.trackerProperties.eVars && aa_extension.settings.trackerProperties.eVars.length > 0 ){
            for(i=0;i<aa_extension.settings.trackerProperties.eVars.length;i++){
              aa_extension_evar+=aa_extension.settings.trackerProperties.eVars[i].name+'|';
            }
          }
          if(aa_extension.settings.trackerProperties.props && aa_extension.settings.trackerProperties.props.length > 0 ){
            for(i=0;i<aa_extension.settings.trackerProperties.props.length;i++){
              aa_extension_prop+=aa_extension.settings.trackerProperties.props[i].name+'|';
            }
          }
        }
        if(_satellite._container.extensions['adobe-analytics'].settings && _satellite._container.extensions['adobe-analytics'].settings.customSetup && _satellite._container.extensions['adobe-analytics'].settings.customSetup.source){
          var aa_customsetup = _satellite._container.extensions['adobe-analytics'].settings.customSetup.source.toString();
          let aa_evars_custom = aa_customsetup.split('eVar');
          for(len=1;len<aa_evars_custom.length;len++){
            if(Number(aa_evars_custom[len][0]) > -1){
              aa_extension_evar+='c_eVar'+aa_evars_custom[len][0];
                if(Number(aa_evars_custom[len][1]) > -1){
                  aa_extension_evar+=aa_evars_custom[len][1];
                  if(Number(aa_evars_custom[len][2]) > -1){
                    aa_extension_evar+=aa_evars_custom[len][2]; 
                  }
                }
                aa_extension_evar+='|';
            } 
         }
         let aa_props_custom = aa_customsetup.split('prop');
          for(len=1;len<aa_props_custom.length;len++){
            if(Number(aa_props_custom[len][0]) > -1){
              aa_extension_prop+='c_prop'+aa_props_custom[len][0];
                if(Number(aa_props_custom[len][1]) > -1){
                  aa_extension_prop+=aa_props_custom[len][1];
                }
                aa_extension_prop+='|';
            } 
         }
         let aa_events_custom = aa_customsetup.split('event')
         for(len=1;len<aa_events_custom.length;len++){
          if(Number(aa_events_custom[len][0]) > 0){
            aa_extension_event+='c_event'+aa_events_custom[len][0];
              if(Number(aa_events_custom[len][1]) > -1){
                aa_extension_event+=aa_events_custom[len][1];
                if(Number(aa_events_custom[len][2]) > -1){
                  aa_extension_event+=aa_events_custom[len][2];
                  if(Number(aa_events_custom[len][3]) > -1){
                    aa_extension_event+=aa_events_custom[len][3];
                  }
                }
              }
              aa_extension_event+='|';
          }
        }
        if(aa_extension_evar.indexOf('|')>-1){
          let arr = aa_extension_evar.split('|');
          function removeDuplicates(arr) {
            return arr.filter((item,index) => arr.indexOf(item) === index);
        }
        aa_extension_evar = removeDuplicates(arr).join('|');
      }

         if(aa_extension_prop.indexOf('|')>-1){
          let arr = aa_extension_prop.split('|');
          function removeDuplicates(arr) {
            return arr.filter((item,index) => arr.indexOf(item) === index);
        }
        aa_extension_prop = removeDuplicates(arr).join('|');
      }
      if(aa_extension_event.indexOf('|')>-1){
        let arr = aa_extension_event.split('|');
        function removeDuplicates(arr) {
          return arr.filter((item,index) => arr.indexOf(item) === index);
      }
      aa_extension_event = removeDuplicates(arr).join('|');
    }
      var evar_innerHTML = document.getElementById('aa_evars_variables');
      evar_innerHTML.innerHTML = aa_extension_evar;
      var prop_innerHTML = document.getElementById('aa_props_variables');
      prop_innerHTML.innerHTML = aa_extension_prop;
      var event_innerHTML = document.getElementById('aa_events_variables');
      event_innerHTML.innerHTML = aa_extension_event;
      var aa_table = document.getElementById('extension_aa_more_details');
      aa_table.style.display = 'block';
      var aa_table_div = document.getElementById('extension_div');
      aa_table_div.style.display = 'block';
    }
    ///end of Analytics extension variable code//
    var variable_table_div = document.getElementById('variable_div');
    variable_table_div.style.display = 'block';
    var variable_table_list = document.getElementById('general_page_aa');
    variable_table_list.style.display = 'block';
        var download_button = document.getElementsByClassName('download-button');
       if(download_button[0]){
      var csv = [];
      var rows = document.querySelectorAll("table tr");
      for (var i = 0; i < rows.length; i++) {
        var row = [],
          cols = rows[i].querySelectorAll("td, th");
    
        for (var j = 0; j < cols.length; j++)
          row.push(cols[j].innerText);
    
        csv.push(row.join(","));
      }
      // Download CSV file
      var _tsA = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
      if (_tsA) _tsA.track('Export:CSV:AA Variables', { pageName: 'TagScanner:AA Variables', events: 'event4', v5: 'CSV', c2: 'Export' });
      downloadCSV(csv.join("\n"), "aa_variable.csv");
    } 
    
    function downloadCSV(csv, filename) {
      var csvFile;
      var downloadLink;
    
      // CSV file
      csvFile = new Blob([csv], {
        type: "text/csv"
      });
    
      // Download link
      downloadLink = document.createElement("a");
      downloadLink.download = filename;
      downloadLink.href = window.URL.createObjectURL(csvFile);
      downloadLink.style.color = "white";
      downloadLink.innerHTML = "Export CSV File "
      downloadLink.style.textAlign = 'right'
      download_button[0].appendChild(downloadLink);
    }
set_display = document.getElementById('set_display');
    set_display.style="display: none;"
    var td_length = document.getElementsByTagName('td');
    if(td_length.length < 1){
      document.getElementById('general_page_aa').style.display = 'none';
      document.getElementById('display_message').style.display = 'block';
    }
  } 
 }
