var search_details_node = document.getElementById('search_details');
const params = new Proxy(new URLSearchParams(window.location.search), {
    get: (searchParams, prop) => searchParams.get(prop),
});
// Get the value of "some_key" in eg "https://example.com/?some_key=some_value"
let value = params.search,
dataele_count = 0;
if (search_details_node && value) {
    
    document.getElementById('h2_header').textContent = "Search Result Displayed for : "+value;
    var rule_value = sessionStorage.getItem("_satellite._container.rules");
    const obj = JSON.parse(rule_value);
    var de_rule_action_count = 0,de_rule_condition_count = 0,de_rule_event_count =0, de_rule_count=0;
    // Use container data instead of registerScript parsing
    var pk = [];
    
    // Get custom code from container data
    if (window._satellite && window._satellite._container && window._satellite._container.rules) {
        const containerRules = window._satellite._container.rules;
        
        // Search through all rules for custom code that contains the search value
        for (const rule of containerRules) {
            // Check conditions
            if (rule.conditions) {
                for (const condition of rule.conditions) {
                    if (condition.settings && condition.settings.source) {
                        const sourceStr = typeof condition.settings.source === 'function' 
                            ? condition.settings.source.toString() 
                            : condition.settings.source;
                        
                        if (sourceStr.indexOf(value) > -1) {
                            // Extract any URLs or identifiers from the custom code
                            const urlMatch = sourceStr.match(/https:\/\/assets\.adobedtm\.com\/[^"'\s]+/);
                            if (urlMatch) {
                                pk.push(urlMatch[0]);
                            }
                        }
                    }
                }
            }
            
            // Check actions
            if (rule.actions) {
                for (const action of rule.actions) {
                    // Helper function to check custom code in various locations
                    function checkCustomCode(source) {
                        if (!source) return false;
                        
                        const sourceStr = typeof source === 'function' 
                            ? source.toString() 
                            : source;
                        
                        if (sourceStr.indexOf(value) > -1) {
                            // Extract any URLs or identifiers from the custom code
                            const urlMatch = sourceStr.match(/https:\/\/assets\.adobedtm\.com\/[^"'\s]+/);
                            if (urlMatch) {
                                pk.push(urlMatch[0]);
                            }
                            return true;
                        }
                        return false;
                    }
                    
                    // Check various possible custom code locations
                    if (action.settings) {
                        // 1. Check action.settings.source (primary location)
                        if (action.settings.source && checkCustomCode(action.settings.source)) {
                            continue;
                        }
                        
                        // 2. Check action.settings.customCode
                        if (action.settings.customCode && checkCustomCode(action.settings.customCode)) {
                            continue;
                        }
                        
                        // 3. Check action.settings.code
                        if (action.settings.code && checkCustomCode(action.settings.code)) {
                            continue;
                        }
                        
                        // 4. Check action.settings.script
                        if (action.settings.script && checkCustomCode(action.settings.script)) {
                            continue;
                        }
                        
                        // 5. Check action.settings.customSetup.source
                        if (action.settings.customSetup && action.settings.customSetup.source && checkCustomCode(action.settings.customSetup.source)) {
                            continue;
                        }
                        
                        // 6. Check action.settings.body
                        if (action.settings.body && checkCustomCode(action.settings.body)) {
                            continue;
                        }
                        
                        // 7. Check action.settings.content
                        if (action.settings.content && checkCustomCode(action.settings.content)) {
                            continue;
                        }
                    }
                    
                    // 8. Check action.customCode (root level)
                    if (action.customCode && checkCustomCode(action.customCode)) {
                        continue;
                    }
                }
            }
        }
    }
    for (i = 0; i < obj.length; i++) {
      let de_action_check = 0,de_event_check = 0,de_condition_check = 0; 
        var action_check = JSON.stringify(obj[i].actions);
        var condition_check = JSON.stringify(obj[i].conditions);
        var event_check = JSON.stringify(obj[i].events);
        if (action_check.indexOf(value) > -1) {
                    de_rule_action_count+=1;
                    de_action_check = 1;
                }
        else if(pk.length >0){
            for(t=0;t<pk.length;t++){
                if(action_check.indexOf(pk[t]) > -1){
                    de_rule_action_count+=1;
                    de_action_check = 1;
                }
            }
                }
        else if(condition_check.indexOf(value) > -1){
                    de_rule_condition_count+=1;
                    de_condition_check = 1;
                }
        else if(event_check.indexOf(value) > -1){
                    de_rule_event_count+=1;
                    de_event_check = 1;
                }
        if(de_action_check > 0 ||de_condition_check > 0 || de_event_check > 0){
                    de_rule_count+=1;
                var table = document.getElementById('search_detail_table');
                var tr_aa = document.createElement('tr');
                var th_rule_name = document.createElement('td');
                th_rule_name.innerHTML = obj[i].name;
                var th_rule_action = document.createElement('td');
                if(de_rule_action_count > 0){th_rule_action.innerHTML = "Yes"}else{th_rule_action.innerHTML = "No"};
                var th_rule_condition = document.createElement('td');
                if(de_rule_condition_count > 0){th_rule_condition.innerHTML = "Yes"}else{th_rule_condition.innerHTML = "No"};
                var th_rule_event = document.createElement('td');
                if(de_rule_event_count > 0){th_rule_event.innerHTML = "Yes"}else{th_rule_event.innerHTML = "No"};
                tr_aa.appendChild(th_rule_name);
                tr_aa.appendChild(th_rule_action);
                tr_aa.appendChild(th_rule_condition);
                tr_aa.appendChild(th_rule_event);
                table.appendChild(tr_aa);
        }
    }
    // Data Elements 
    var de_name = sessionStorage.getItem("_satellite._container.dataElements");
    const obj1 = JSON.parse(de_name);
    let core_check = "No", type_check = "No";
    for (var key in obj1) {
        if (obj1.hasOwnProperty(key)) {
            var xdm_path = value.split('.');
            xdm_path_length = 0;
            if(obj1[key].settings && obj1[key].settings.data){
                var xdm_path_check = obj1[key].settings.data;
                for(i=0;i<xdm_path.length;i++){
                    if(xdm_path_check[xdm_path[i]]){
                        xdm_path_check=xdm_path_check[xdm_path[i]];
                        xdm_path_length+=1;
                    }
                    else{
                        break;
                    }
                }
            }
            var de_present_check = JSON.stringify(obj1[key] || xdm_path_length == xdm_path.length);
            if (de_present_check.indexOf(value) > -1) {
              // Start Extension and DE type code // 
              var modulePath_extension = obj1[key].modulePath.split("/");
              switch (modulePath_extension[0]) {
                  case 'core':
                      core_check = "Core";
                      break;
                  case 'adobe-alloy':
                      core_check = "Web SDK";
                      break;
                  case 'gcoe-adobe-client-data-layer':
                      core_check = "ACDL";
                      break;
                  case 'data-layer-manager-search-discovery':
                      core_check = "DataLayer Manager";
                      break;
                  case 'adobe-mcid':
                      core_check = "ECID Service";
                      break;
                  case 'sdi-toolkit':
                      core_check = "SDI Toolkit";
                      break;
                  case 'common-web-sdk-plugins':
                      core_check = "Common Web SDK Plugin";
                      break;

                  default:
                      core_check = modulePath_extension[0];
              }
              var type = obj1[key].modulePath;
              if (obj1[key].modulePath.indexOf('dataElements') > -1) {
                  type = type.split('dataElements/')
              };
              if (obj1[key].modulePath.indexOf('data_elements') > -1) {
                  type = type.split('data_elements/')
              };
              if (type[1]) {
                  type[1] = type[1].split('.js');
                  type_check = type[1][0]
              };
              type_check = type_check;
          //END of Extension and DE Type Code

                var table = document.getElementById('search_detail_table2');
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
    var extension = sessionStorage.getItem("_satellite._container.extension"),dataexe_count = 0;
      const obj2 = JSON.parse(extension);
      for (var key in obj2) {
            if (obj2.hasOwnProperty(key)) {
              if(JSON.stringify(obj2[key]).indexOf(value)>-1){
                var table = document.getElementById('search_detail_table3');
                var tr_aa = document.createElement('tr');
                var th_extension = document.createElement('td');
                th_extension.innerHTML = obj2[key].displayName;
                tr_aa.appendChild(th_extension);
                table.appendChild(tr_aa);
                dataexe_count += 1;
              }
            }}

    var rule_table = document.getElementById('rule_collapse');
    rule_table.innerHTML = 'Rules: ' + de_rule_count;
    var de_table = document.getElementById('de_collapse');
    de_table.innerHTML = 'Data Elements: ' + dataele_count;
    var exe_table = document.getElementById('exe_collapse');
    exe_table.innerHTML = "Extensions: " + dataexe_count;
    var acc = document.getElementsByClassName("accordion");
    for (i = 0; i < acc.length; i++) {
        acc[i].onclick = function() {
            this.classList.toggle("active");
            var panel = this.nextElementSibling;
            if (panel.style.maxHeight) {
                panel.style.maxHeight = null;
            } else {
                panel.style.maxHeight = panel.scrollHeight + "px";
            }
        }
    }
}
var set_display = document.getElementById('set_display');
    set_display.style="display: none;"
