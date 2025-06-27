// Add accordion functionality
document.addEventListener('DOMContentLoaded', function () {
  var acc = document.getElementsByClassName('accordion');
  for (var i = 0; i < acc.length; i++) {
    acc[i].addEventListener('click', function () {
      this.classList.toggle('active');
      var panel = this.nextElementSibling;
      if (panel.style.maxHeight) {
        panel.style.maxHeight = null;
      } else {
        panel.style.maxHeight = panel.scrollHeight + 'px';
      }
    });
  }

  // Open the first accordion by default
  if (acc.length > 0) {
    acc[0].click();
  }
});
