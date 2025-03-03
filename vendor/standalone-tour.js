/**
 * Standalone Tour Functionality
 * This script provides a self-contained tour implementation that doesn't rely on the TagScannerTours module
 */

(function () {
  console.log('Standalone tour script loaded');

  // Tour step definitions
  const tourDefinitions = {
    // Rules page tour
    rules: [
      {
        element: '#rule_details',
        intro:
          'This is the Rules table where you can see all Launch rules defined in the property.',
        position: 'bottom',
      },
      {
        element: '.search-box',
        intro: 'Search for specific rules by name or attributes.',
        position: 'bottom',
      },
      {
        element: '#download',
        intro: 'Download the rules data as a CSV file for further analysis.',
        position: 'left',
      },
      {
        element: 'th',
        intro: 'Click on any column header to sort the table by that column.',
        position: 'bottom',
      },
    ],

    // Data Elements page tour
    dataElements: [
      {
        element: '#dataelement_details',
        intro:
          'This table displays all data elements defined in your Launch property.',
        position: 'bottom',
      },
      {
        element: '.search-box',
        intro: 'Search for specific data elements by name or type.',
        position: 'bottom',
      },
      {
        element: '.download-button',
        intro:
          'Download the data elements information as a CSV file for further analysis.',
        position: 'left',
      },
    ],

    // Extensions page tour
    extensions: [
      {
        element: '#extension_details',
        intro:
          'This table displays all extensions installed in your Launch property.',
        position: 'bottom',
      },
      {
        element: '#extension_details th:first-child',
        intro:
          'Extensions are organized by name, version, and configuration details.',
        position: 'bottom',
      },
      {
        element: '.download-button',
        intro: 'Download the extensions data as a CSV file.',
        position: 'left',
      },
    ],

    // Summary page tour
    summary: [
      {
        element: '.summary-card',
        intro:
          'The summary page provides an overview of your Launch property configuration.',
        position: 'bottom',
      },
      {
        element: '#download-pdf',
        intro: 'Download a summary report for your records or sharing.',
        position: 'left',
      },
    ],

    // Mapping/Relationship diagram tour
    mapping: [
      {
        element: '.relationship-container',
        intro:
          'This diagram shows the relationships between different components in your Launch property.',
        position: 'bottom',
      },
      {
        element: '.list-section',
        intro: 'Browse and select components to explore their relationships.',
        position: 'right',
      },
    ],
  };

  // Function to add tour button to the page
  function addTourButton(pageName) {
    console.log('Adding standalone tour button for:', pageName);

    // Create container if it doesn't exist
    let container = document.getElementById('standalone-tour-button');
    if (!container) {
      container = document.createElement('div');
      container.id = 'standalone-tour-button';
      container.style.position = 'fixed';
      container.style.bottom = '20px';
      container.style.right = '20px';
      container.style.zIndex = '9999';
      document.body.appendChild(container);
    }

    // Create button
    const button = document.createElement('button');
    button.innerText = 'Take a Tour';
    button.className = 'btn btn-primary';
    button.style.padding = '10px 15px';
    button.style.fontSize = '16px';
    button.style.fontWeight = 'bold';
    button.style.borderRadius = '5px';
    button.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';

    // Add click event
    button.addEventListener('click', function () {
      try {
        console.log('Starting tour for:', pageName);
        startTour(pageName);
      } catch (e) {
        console.error('Error starting tour:', e);
        alert('Error starting tour. Please check the console for details.');
      }
    });

    // Add to container
    container.innerHTML = ''; // Clear any existing content
    container.appendChild(button);
  }

  // Function to start the tour
  function startTour(pageName) {
    const steps = tourDefinitions[pageName];

    if (!steps) {
      console.error('No tour defined for page:', pageName);
      return;
    }

    if (typeof introJs !== 'function') {
      console.error('introJs is not defined');
      alert(
        'Tour library is not available. Please refresh the page and try again.'
      );
      return;
    }

    // Start the tour
    const tour = introJs();
    tour.setOptions({
      steps: steps,
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
  }

  // Initialize tour based on page
  function initTourForCurrentPage() {
    const path = window.location.pathname.toLowerCase();

    console.log('Initializing standalone tour for path:', path);

    // Determine which page we're on
    if (path.includes('rule.html')) {
      addTourButton('rules');
    } else if (path.includes('dataelement.html')) {
      addTourButton('dataElements');
    } else if (path.includes('extension.html')) {
      addTourButton('extensions');
    } else if (path.includes('summary.html')) {
      addTourButton('summary');
    } else if (path.includes('relationship-diagram.html')) {
      addTourButton('mapping');
    } else {
      console.log('No tour available for current page');
    }
  }

  // Add the init function to various events to ensure it runs

  // Try to run immediately
  if (
    document.readyState === 'complete' ||
    document.readyState === 'interactive'
  ) {
    console.log('Document already ready, initializing immediately');
    setTimeout(initTourForCurrentPage, 100);
  }

  // Also run on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', function () {
    console.log('DOMContentLoaded event fired for standalone tour');
    setTimeout(initTourForCurrentPage, 100);
  });

  // Final fallback with a delay
  setTimeout(function () {
    console.log('Fallback initialization for standalone tour');
    initTourForCurrentPage();
  }, 1000);

  // Expose methods globally for direct access
  window.StandaloneTour = {
    start: startTour,
    addButton: addTourButton,
  };
})();
