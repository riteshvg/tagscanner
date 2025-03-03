/**
 * Relationship Diagram (Mapping) page tour functionality
 */
document.addEventListener('DOMContentLoaded', function () {
  console.log('Mapping page tour initializer running');

  // Only proceed if introJs is available
  if (typeof introJs !== 'function') {
    console.error('introJs not available');
    return;
  }

  // Create button container
  const buttonContainer = document.createElement('div');
  buttonContainer.id = 'tour-button-container';
  buttonContainer.style.position = 'fixed';
  buttonContainer.style.bottom = '20px';
  buttonContainer.style.right = '20px';
  buttonContainer.style.zIndex = '9999';

  // Create button
  const button = document.createElement('button');
  button.innerText = 'Take a Tour';
  button.className = 'btn btn-primary';
  button.style.padding = '10px 15px';
  button.style.borderRadius = '5px';
  button.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';

  // Configure tour steps
  const tourSteps = [
    {
      intro:
        'Welcome to the Relationship Diagram. This page shows the connections between different components of your Adobe Launch property.',
      position: 'bottom',
    },
    {
      element: '#cy',
      intro:
        'This is the relationship diagram that visually maps connections between rules, data elements, and extensions.',
      position: 'bottom',
    },
    {
      element: '.legend',
      intro:
        'The legend explains what each node and connection type represents in the diagram.',
      position: 'left',
    },
    {
      element: '.controls',
      intro:
        'These controls allow you to adjust the view of the diagram, zoom in/out, and filter what is displayed.',
      position: 'top',
    },
  ];

  // Add click handler
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

  // Add to page
  buttonContainer.appendChild(button);
  document.body.appendChild(buttonContainer);
});
