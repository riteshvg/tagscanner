var _tsA_prop = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
if (_tsA_prop) _tsA_prop.page('TagScanner:Property', { events: 'event12' });

var set_display = document.getElementById('set_display');
    set_display.style="display: none;"

    document.getElementById('extensions-2').innerHTML = sessionStorage.getItem('extensions-length');
    document.getElementById('rule_details-2').innerHTML = sessionStorage.getItem('rule-length');
    document.getElementById('dataelement-2').innerHTML = sessionStorage.getItem('dataelement-length');
    var size_store = sessionStorage.getItem('size-store');
    if(size_store){
        size_store = size_store.split('|');
        if(size_store[0]){document.getElementById('container_size-2').innerHTML = size_store[0]}
        if(size_store[1]){document.getElementById('extension_size-2').innerHTML = size_store[3]}
        if(size_store[2]){document.getElementById('rule_size-2').innerHTML = size_store[2]}
        if(size_store[3]){document.getElementById('de_size-2').innerHTML = size_store[1]}
    }