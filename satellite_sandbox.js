(function () {
  var urlParams  = new URLSearchParams(window.location.search);
  var script_URL = urlParams.get('scriptURL');

  if (!script_URL) {
    console.warn('satellite_sandbox: no scriptURL provided.');
    return;
  }

  fetch(script_URL)
    .then(function (response) { return response.text(); })
    .then(function (jsCode) {
      window.parent.postMessage({ type: 'INJECT_SCRIPT', payload: jsCode }, '*');
    })
    .catch(function (error) {
      console.error('satellite_sandbox: fetch failed:', error);
    });
})();
