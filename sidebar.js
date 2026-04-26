document.addEventListener('DOMContentLoaded', function () {
  function sidebar() {
    const sidebar = document.getElementById('sidebar-click');
    if (sidebar.classList.contains('active')) {
      sidebar.classList.remove('active');
      document.getElementById('home-button-sidebar').innerHTML =
        '<i class="px-1 fas fa-home"></i><span>Home</span>';
      document.getElementById('ext-button-sidebar').innerHTML =
        '<i class="px-1 fas fa-plug"></i><span>Extensions</span>';
      document.getElementById('rule-button-sidebar').innerHTML =
        '<i class="px-1 fas fa-wrench"></i><span>Rules</span>';
      document.getElementById('de-button-sidebar').innerHTML =
        '<i class="px-1 fas fa-database"></i><span>Data Elements</span>';
      document.getElementById(
        'feedback-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-envelope"></i><span>Feedback</span>`;
      if (document.getElementById('advanced-button-sidebar')) {
        document.getElementById('advanced-button-sidebar').innerHTML =
          '<i class="px-1 fas fa-cog"></i><span>Advanced Mode</span>';
      }
      document.getElementById('code-button-sidebar').innerHTML =
        '<i class="px-1 fas fa-code"></i><span>Custom Code</span>';

      document.getElementById(
        'collapse-click'
      ).innerHTML = `<i id="collapse-click-right" class="fas fa-angle-right text-white"></i>`;
    } else {
      sidebar.classList.add('active');
      document.getElementById(
        'home-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-home"></i><span>Home</span>`;
      document.getElementById(
        'ext-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-plug"></i><span>Extensions</span>`;
      document.getElementById(
        'rule-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-wrench"></i><span>Rules</span>`;
      document.getElementById(
        'de-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-database"></i><span>Data Elements</span>`;
      document.getElementById(
        'code-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-code"></i><span>Custom Code</span>`;

      document.getElementById(
        'feedback-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-envelope"></i><span>Feedback</span>`;
      if (document.getElementById('advanced-button-sidebar')) {
        document.getElementById('advanced-button-sidebar').innerHTML =
          '<i class="px-1 fas fa-cog"></i><span>Advanced Mode</span>';
      }
      document.getElementById(
        'collapse-click'
      ).innerHTML = `<i id="collapse-click-left" class="fas fa-angle-left text-white"></i>`;
    }
  }

  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar-click');
    const icon = document.getElementById('sidebar-toggle-icon');
    const label = document.getElementById('sidebar-toggle-label');
    
    if (sidebar.classList.contains('active')) {
      sidebar.classList.remove('active');
      if (icon) icon.className = 'fas fa-angle-right';
      if (label) label.textContent = 'Expand';
    } else {
      sidebar.classList.add('active');
      if (icon) icon.className = 'fas fa-angle-left';
      if (label) label.textContent = 'Collapse';
    }
  }

  const btn = document.getElementById('sidebar-toggle-btn');
  if (btn) {
    btn.addEventListener('click', toggleSidebar);
  }
});
