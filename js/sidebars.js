// /* global bootstrap: false */
(function () {
  'use strict';
  var tooltipTriggerList = [].slice.call(
    document.querySelectorAll('[data-bs-toggle="tooltip"]')
  );
  tooltipTriggerList.forEach(function (tooltipTriggerEl) {
    new bootstrap.Tooltip(tooltipTriggerEl);
  });

  var STORAGE_KEY = 'tagscanner_active_nav';

  function setActive(btnId) {
    document.querySelectorAll('#sidebar-click .btn-toggle').forEach(function (btn) {
      btn.classList.remove('nav-active');
    });
    var target = document.getElementById(btnId);
    if (target) target.classList.add('nav-active');
    localStorage.setItem(STORAGE_KEY, btnId);
  }

  // Wire up all nav links in the sidebar
  document.querySelectorAll('#sidebar-click a[href]').forEach(function (link) {
    link.addEventListener('click', function () {
      var btn = link.querySelector('.btn-toggle');
      if (btn && btn.id) setActive(btn.id);
    });
  });

  // Always start with Home highlighted — the iframe defaults to display.html on every open.
  // Restoring a previous nav item would make the sidebar out of sync with the content.
  setActive('home-button-sidebar');
})();
