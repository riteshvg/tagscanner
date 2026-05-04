if(document.getElementById('close')){document.getElementById('close').addEventListener("click", loginformClose)};
if(document.getElementsByClassName('login')[0]){document.getElementsByClassName('login')[0].addEventListener("click", loginformOpen)}
if(document.getElementById('login-submit')){document.getElementById('login-submit').addEventListener("click", loginformSubmit)}
function loginformClose() {
    document.getElementById('id01').style.display='none';
}
function loginformOpen(){
    if(document.getElementsByClassName('login').length >0){
    document.getElementById('id01').style.display='block';
    }
}
function validateForm(email,password,domain){

    return true; // Return true for now until login button/logic can be fully moved.
}

function loginformSubmit(){
    var email = document.getElementById('login-email').value || "NA"; 
    var password =document.getElementById('login-password').value || "NA";
    var url = sessionStorage.getItem('launch_page_url');  //TODO: Just move these to remove login logic? Add to Greeting in popup.js
    url = url.split('?');
    if(url[1]){
        url[0] = url[1].replace('page_url=', '')
    }
    var value = validateForm(email,password,url[0]);
    if(value == true){
        document.getElementsByClassName('login')[0].style.display = 'none';
        document.getElementsByClassName('login-success')[0].innerHTML = email;
        document.getElementsByClassName('login-success')[0].style.display = 'block';
        sessionStorage.setItem('userID',email);
        document.getElementById('general_search').href = 'search.html';
        document.getElementById('general_search').innerHTML = 'Search Variables';
        document.getElementById('id01').style.display='none'; //what is this?
        document.getElementById('property-row').style.display = 'none';
        document.getElementById('component-iframe').src = 'property.html';
        document.getElementById('property-menu-link').href = 'property.html';
        document.getElementById('extension-menu-link').href = 'vendor/extension.html';
        document.getElementById('rule-menu-link').href = 'vendor/rule.html';
        document.getElementById('dataelements-menu-link').href = 'vendor/dataelement.html';
        var rule_html = document.createElement("a");

        // TODO: link these to the dropdown menus
        rule_html.href ="vendor/generalPage.html";
        rule_html.target = "iframe2"; 
        rule_html.innerHTML = "App Measurement details";
        document.getElementById('analytics-variables').appendChild(rule_html);
        var rule_html = document.createElement("a");
        rule_html.href ="vendor/aepvariables.html";
        rule_html.target = "iframe2"; 
        rule_html.innerHTML = "Web SDK details";
        document.getElementById('aep-variables').appendChild(rule_html);
    }
    else{
        document.getElementById('login-error-message').innerHTML = "fill the correct details";
        document.getElementById('login-error-message').style.color = "red";
    }
}