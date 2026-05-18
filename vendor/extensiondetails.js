var extension_more_details_node = document.getElementById('extension_rule_more_details');
const params = new Proxy(new URLSearchParams(window.location.search), {
    get: (searchParams, prop) => searchParams.get(prop),
  });
  // Get the value of "some_key" in eg "https://example.com/?some_key=some_value"
  let value = params.extensionname;
  document.getElementById('h2_title').innerHTML = "&nbsp;"+value+" Extension Overview"
  var extension_de_more_details_node = document.getElementById('extension_de_more_details');
    if(extension_more_details_node){
        var extension_more = sessionStorage.getItem("_satellite._extension");
        const obj = JSON.parse(extension_more);
        
      for (var key in obj) {
            if (obj.hasOwnProperty(key) && key == value) {
                let obj2 = obj[key];
                for(key in obj2){
                    if(obj2[key].rule ||obj2[key].events || obj2[key].conditions){
                        var tr = document.createElement('tr');
                        var th_rule_name = document.createElement('td');
                        th_rule_name.innerHTML = key;
                        var th_action = document.createElement('td');
                        if(obj2[key].rule){th_action.innerHTML = "yes" }else{th_action.innerHTML = "No"};
                        var th_events = document.createElement('td');
                        if(obj2[key].events){th_events.innerHTML = "Yes" }else{th_events.innerHTML = "No"};
                        var th_conditions = document.createElement('td');
                        if(obj2[key].conditions){th_conditions.innerHTML = "Yes" }else{th_conditions.innerHTML = "No"};
                        tr.appendChild(th_rule_name);
                        tr.appendChild(th_action);
                        tr.appendChild(th_events);
                        tr.appendChild(th_conditions);
                        extension_more_details_node.appendChild(tr); 
                    }
                    else if(key == 'dataelement'){
                        for(k=0;k<obj2[key].length;k++){
                            var tr = document.createElement('tr');
                            var th_de_name = document.createElement('td');
                            th_de_name.innerHTML = obj2[key][k].name;
                            var type = obj2[key][k].path,type_check ='NA',extension = 'other';
                            extension = obj2[key][k].path.split('/');
                            //console.log(extension);
                            if(obj2[key][k].path.indexOf('dataElements')>-1){type = type.split('dataElements/')};
                            if(obj2[key][k].path.indexOf('data_elements')>-1){type = type.split('dataElements/')};
                            if(type[1]){type[1] = type[1].split('.js'); type_check = type[1][0]};
                            var th_extension = document.createElement('td');
                            th_extension.innerHTML = extension[0];
                            var th_type = document.createElement('td');
                            th_type.innerHTML = type_check;
                            tr.appendChild(th_de_name);
                            tr.appendChild(th_extension);
                            tr.appendChild(th_type);
                            extension_de_more_details_node.appendChild(tr); 
                        }
                    }
                    
                }
            }
        }
    }

    var download_button = document.getElementsByClassName('download-button');
    if(download_button[0]){
      console.log("I am an alert box!");
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
      console.log('Hey')
      var _tsA = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
      if (_tsA) _tsA.track('Export:CSV:Extension Details', { pageName: 'TagScanner:Extensions', events: 'event4', v5: 'CSV', c2: 'Export' });
      downloadCSV(csv.join("\n"), value+"_extension.csv");
    } 
    
    function downloadCSV(csv, filename) {
      console.log("hhh")
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
      downloadLink.innerHTML = "Export CSV File &nbsp; &nbsp;"
      downloadLink.style.textAlign = 'right'
      download_button[0].appendChild(downloadLink);
    }
    var set_display = document.getElementById('set_display');
    set_display.style="display: none;"