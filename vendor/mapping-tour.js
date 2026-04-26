/**
 * Relationship Diagram (Mapping) page tour functionality
 * Tour steps are defined in tour-initializer.js and attached to #start-tour in the header.
 * This file only adds a fallback floating button if the page has no #start-tour (e.g. older versions).
 */
document.addEventListener('DOMContentLoaded', function () {
  // If the page has the standard Take a Tour button in the header, tour-initializer.js handles it
  if (document.getElementById('start-tour')) {
    return;
  }

  if (typeof introJs !== 'function') {
    return;
  }

  const tourSteps = [
    { intro: 'Welcome to the Rule & Data Element Relationships page. This page shows how rules connect to data elements.', position: 'bottom' },
    { element: '.relationship-container', intro: 'The left panel lists rules or data elements. The right panel shows relationship details for the selected item.', position: 'bottom' },
    { element: '.list-section', intro: 'Click a rule or data element in this list to see its relationships in the details panel.', position: 'right' },
    { element: '#searchInput', intro: 'Use the search box to filter the list.', position: 'bottom' },
    { element: '.details-section', intro: 'When you select an item, this panel shows its relationships.', position: 'left' },
  ];

  const buttonContainer = document.createElement('div');
  buttonContainer.id = 'tour-button-container';
  buttonContainer.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;';
  const button = document.createElement('button');
  button.innerText = 'Take a Tour';
  button.className = 'btn btn-primary';
  button.style.cssText = 'padding:10px 15px;border-radius:5px;box-shadow:0 4px 8px rgba(0,0,0,0.2);';
  button.addEventListener('click', function () {
    const tour = introJs();
    tour.setOptions({
      steps: tourSteps,
      showStepNumbers: true,
      showBullets: true,
      showProgress: true,
      exitOnOverlayClick: true,
      nextLabel: 'Next',
      prevLabel: 'Back',
      skipLabel: 'Skip',
      doneLabel: 'Done',
    });
    tour.start();
  });
  buttonContainer.appendChild(button);
  document.body.appendChild(buttonContainer);
});
