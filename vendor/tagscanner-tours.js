/**
 * TagScanner Tours - Guided tour functionality for TagScanner components
 * This file contains all tour definitions for the different components
 */

// Add debug logging
console.log('TagScanner Tours script loaded');

// Tour definitions for each component
const tagScannerTours = {
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
      element: 'th[onclick="sortTable(0)"]',
      intro: 'Click on any column header to sort the table by that column.',
      position: 'bottom',
    },
  ],

  // Data Elements page tour
  dataElements: [
    {
      element: '#dataelements',
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
      element: '#download',
      intro:
        'Download the data elements information as a CSV file for further analysis.',
      position: 'left',
    },
    {
      element: 'th[onclick="sortTable(0)"]',
      intro: 'Click on any column header to sort the table by that column.',
      position: 'bottom',
    },
  ],

  // Extensions page tour
  extensions: [
    {
      element: '#extension',
      intro:
        'This table displays all extensions installed in your Launch property.',
      position: 'bottom',
    },
    {
      element: '#extension th:first-child',
      intro:
        'Extensions are organized by name, version, and configuration details.',
      position: 'bottom',
    },
    {
      element: '#download',
      intro: 'Download the extensions data as a CSV file.',
      position: 'left',
    },
  ],

  // Summary page tour
  summary: [
    {
      element: '#summary_table',
      intro:
        'The summary page provides an overview of your Launch property configuration.',
      position: 'bottom',
    },
    {
      element: '#websdk_count',
      intro:
        'This section shows a count of Web SDK implementations and configurations.',
      position: 'right',
    },
    {
      element: '#analytics_count',
      intro:
        'Here you can see Analytics implementations and their configurations.',
      position: 'left',
    },
    {
      element: '#download',
      intro: 'Download a summary report for your records or sharing.',
      position: 'left',
    },
  ],

  // Mapping/Relationship diagram tour
  mapping: [
    {
      element: '#relationship-diagram',
      intro:
        'This diagram shows the relationships between different components in your Launch property.',
      position: 'bottom',
    },
    {
      element: '.node',
      intro:
        'Each node represents a component. Click on nodes to explore relationships.',
      position: 'right',
    },
    {
      element: '.controls',
      intro: 'Use these controls to zoom in/out and adjust the diagram view.',
      position: 'left',
    },
  ],
};

/**
 * Initialize a tour for a specific component
 * @param {string} componentName - Name of the component (rules, dataElements, extensions, summary, mapping)
 * @returns {Object} - The initialized tour object
 */
function initTour(componentName) {
  console.log('Initializing tour for component:', componentName);

  // Get the tour steps for the specified component
  const tourSteps = tagScannerTours[componentName];

  if (!tourSteps) {
    console.error(`Tour not found for component: ${componentName}`);
    return null;
  }

  // Check if introJs is available
  if (typeof introJs !== 'function') {
    console.error(
      'introJs is not defined! Make sure intro.js is loaded before calling initTour.'
    );
    return null;
  }

  // Initialize the tour
  try {
    const tour = introJs();

    // Configure tour options
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

    console.log('Tour initialized successfully');
    return tour;
  } catch (error) {
    console.error('Error initializing tour:', error);
    return null;
  }
}

/**
 * Adds a tour button to the page
 * @param {string} componentName - Name of the component
 */
function addTourButton(componentName) {
  console.log('Adding tour button for component:', componentName);

  // Check if button already exists
  if (document.querySelector('.tour-button-container')) {
    console.log('Tour button already exists, skipping');
    return;
  }

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'tour-button-container';
  buttonContainer.style.position = 'fixed';
  buttonContainer.style.bottom = '20px';
  buttonContainer.style.right = '20px';
  buttonContainer.style.zIndex = '9999';

  const tourButton = document.createElement('button');
  tourButton.innerText = 'Start Tour';
  tourButton.className = 'btn btn-primary btn-tour';
  tourButton.style.padding = '8px 16px';
  tourButton.style.borderRadius = '4px';
  tourButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';

  tourButton.addEventListener('click', function () {
    console.log('Tour button clicked for component:', componentName);
    const tour = initTour(componentName);
    if (tour) {
      tour.start();
    }
  });

  buttonContainer.appendChild(tourButton);
  document.body.appendChild(buttonContainer);
  console.log('Tour button added to the page');
}

// Make sure introJs is loaded before exposing our functions
function checkAndInitialize() {
  console.log('Checking if introJs is available...');
  if (typeof introJs === 'function') {
    console.log('introJs is available, exposing TagScannerTours');
    // Export functions
    window.TagScannerTours = {
      initTour,
      addTourButton,
    };
    console.log('TagScannerTours initialized and exposed globally');
  } else {
    console.error('introJs is not available yet, waiting...');
    // Try again in 500ms
    setTimeout(checkAndInitialize, 500);
  }
}

// Initialize the module
checkAndInitialize();

// Also directly add listeners to ensure initialization
document.addEventListener('DOMContentLoaded', function () {
  console.log('DOM content loaded event fired');
  if (window.TagScannerTours) {
    console.log('TagScannerTours is available');

    // Try to determine which component this is
    const path = window.location.pathname;
    if (path.includes('rule.html')) {
      console.log('Detected rules page');
      window.TagScannerTours.addTourButton('rules');
    } else if (path.includes('dataelement.html')) {
      console.log('Detected data elements page');
      window.TagScannerTours.addTourButton('dataElements');
    } else if (path.includes('extension.html')) {
      console.log('Detected extensions page');
      window.TagScannerTours.addTourButton('extensions');
    } else if (path.includes('summary.html')) {
      console.log('Detected summary page');
      window.TagScannerTours.addTourButton('summary');
    } else if (path.includes('relationship-diagram.html')) {
      console.log('Detected mapping page');
      window.TagScannerTours.addTourButton('mapping');
    } else {
      console.log('Could not detect component from path:', path);
    }
  } else {
    console.error('TagScannerTours is not available on DOMContentLoaded');
  }
});
