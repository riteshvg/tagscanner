window._revealDashboardIfAdmin = function () {
  var ADMIN_EMAIL = 'riteshvgupta@gmail.com';
  var isAdmin = false;
  try {
    var raw = localStorage.getItem('tagscanner_session');
    if (raw) {
      var s = JSON.parse(raw);
      isAdmin = !!(s && s.email && s.email.toLowerCase().trim() === ADMIN_EMAIL);
    }
  } catch (e) {}
  var el = document.getElementById('dashboard-menu-item');
  if (el) el.style.display = isAdmin ? '' : 'none';
};
window._revealDashboardIfAdmin();
