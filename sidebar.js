document.addEventListener('DOMContentLoaded', function () {
  function sidebar() {
    const sidebar = document.getElementById('sidebar-click');
    if (sidebar.classList.contains('active')) {
      sidebar.classList.remove('active');
      document.getElementById('home-button-sidebar').innerHTML =
        '<i class="px-1 fas fa-home"></i>';
      document.getElementById('ext-button-sidebar').innerHTML =
        '<i class="px-1 fas fa-plug"></i>';
      document.getElementById('rule-button-sidebar').innerHTML =
        '<i class="px-1 fas fa-wrench"></i>';
      document.getElementById('de-button-sidebar').innerHTML =
        ' <i class="px-1 fas fa-database"></i>';
      // document.getElementById('misc-click').remove();
      document.getElementById(
        'feedback-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-envelope"></i>`;
      document.getElementById('code-button-sidebar').innerHTML =
        '<i class="px-1 fas fa-code"></i>';

      // document.getElementById('request_new_feature').innerHTML='<i class="px-1 fas fa-pen text-white"></i>'
      // document.getElementById('feed_back_form').innerHTML='<i class="px-1 fas fa-share text-white"></i>'

      // document.getElementById('git_share_link').innerHTML='<i class="px-1 fas fa-share-alt text-white"></i>'

      document.getElementById(
        'collapse-click'
      ).innerHTML = `<i id="collapse-click-right" class="fas fa-angle-right text-white"></i>`;

      sidebar.style =
        'display: block; width: 100px; background-color: #252525;border-right: 1px solid #dee2e6;padding: 1rem;';
    } else {
      sidebar.classList.add('active');
      document.getElementById(
        'home-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-home"></i>Home`;
      document.getElementById(
        'ext-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-plug"></i>Extensions`;
      document.getElementById(
        'rule-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-wrench"></i>Rules`;
      document.getElementById(
        'de-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-database"></i>Data Elements`;
      document.getElementById(
        'code-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-code"></i>Custom Code`;

      // document.getElementById('misc').insertAdjacentHTML('afterbegin', '<p id="misc-click" class="m-0 py-2 px-3">Miscellaneous</p>');

      document.getElementById(
        'feedback-button-sidebar'
      ).innerHTML = `<i class="px-1 fas fa-envelope"></i>Feedback`;
      // document.getElementById('request_new_feature').innerHTML='<i class="px-1 fas fa-pen text-white"></i>Request New Feature'
      // document.getElementById('feed_back_form').innerHTML='<i class="px-1 fas fa-share text-white"></i>Share your Feedback'

      // document.getElementById('git_share_link').innerHTML='<i class="px-1 fas fa-share-alt text-white"></i>Share the Tool'
      document.getElementById(
        'collapse-click'
      ).innerHTML = `<i id="collapse-click-left" class="fas fa-angle-left text-white"></i>`;
      sidebar.style =
        'display: block; width: 250px; background-color: #252525;border-right: 1px solid #dee2e6;padding: 1rem;';
    }
  }
});
