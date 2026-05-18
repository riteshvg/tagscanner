(function () {
  var TS_PROXY_URL = 'https://ihn2pz2dbcktbxvn36g6pfptda0jfnri.lambda-url.us-east-1.on.aws/';

  var _tsA = (window.parent && window.parent.TagScannerAnalytics) || window.TagScannerAnalytics;
  if (_tsA) _tsA.page('TagScanner:Feedback', { events: 'event12' });

  // Pre-fill from active session if signed in
  try {
    var raw = localStorage.getItem('tagscanner_user');
    if (raw) {
      var u = JSON.parse(raw);
      if (u && u.email) document.getElementById('fbEmail').value = u.email;
      if (u && u.name)  document.getElementById('fbName').value  = u.name;
    }
  } catch (e) {}

  document.getElementById('fbForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    var btn    = document.getElementById('fbSubmitBtn');
    var result = document.getElementById('fbResult');

    var name     = document.getElementById('fbName').value.trim();
    var email    = document.getElementById('fbEmail').value.trim();
    var rating   = document.querySelector('input[name="rating"]:checked');
    var category = document.getElementById('fbCategory').value;
    var message  = document.getElementById('fbMessage').value.trim();

    if (!message) {
      result.textContent   = 'Please enter a message before submitting.';
      result.className     = 'fb-result error';
      result.style.display = 'block';
      return;
    }

    btn.disabled  = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:7px"></i>Sending…';
    result.style.display = 'none';

    try {
      var res = await fetch(TS_PROXY_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:     'generalFeedback',
          name:     name,
          email:    email,
          rating:   rating ? rating.value : '',
          category: category,
          message:  message
        })
      });
      var json = await res.json().catch(function () { return {}; });

      if (res.ok && json.ok) {
        document.getElementById('fbFormCard').style.display = 'none';
        document.getElementById('fbSuccess').style.display  = 'block';
      } else {
        result.textContent   = json.error || 'Submission failed. Please try again.';
        result.className     = 'fb-result error';
        result.style.display = 'block';
        btn.disabled  = false;
        btn.innerHTML = '<i class="fas fa-paper-plane" style="margin-right:7px"></i>Send Feedback';
      }
    } catch (err) {
      result.textContent   = 'Network error. Please check your connection and try again.';
      result.className     = 'fb-result error';
      result.style.display = 'block';
      btn.disabled  = false;
      btn.innerHTML = '<i class="fas fa-paper-plane" style="margin-right:7px"></i>Send Feedback';
    }
  });
})();
