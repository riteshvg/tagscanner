/**
 * Tour Initializer
 * Handles initialization of tours for all TagScanner components
 * This file consolidates all the tour initialization code to avoid inline scripts
 */

(function () {
  // Wait for DOM to be fully loaded
  document.addEventListener('DOMContentLoaded', function () {
    console.log('Tour initializer running');

    // Determine current page from URL path
    const path = window.location.pathname.toLowerCase();
    console.log('Current path:', path);

    let pageName = '';
    if (path.includes('rule.html')) {
      pageName = 'rules';
    } else if (path.includes('dataelement.html')) {
      pageName = 'dataElements';
    } else if (path.includes('extension.html')) {
      pageName = 'extensions';
    } else if (path.includes('summary.html')) {
      pageName = 'summary';
    } else if (path.includes('relationship-diagram.html')) {
      pageName = 'mapping';
    }

    if (!pageName) {
      console.log('No tour available for current page');
      return;
    }

    console.log('Initializing tour for page:', pageName);

    // Initialize tour with the existing button
    initializeTourButton(pageName);
  });

  // Initialize tour using the existing button in HTML
  function initializeTourButton(pageName) {
    console.log('Initializing existing tour button for page:', pageName);

    if (typeof introJs !== 'function') {
      console.error('introJs not available');
      return;
    }

    // Define tour steps based on page type
    const tourSteps = getTourStepsForPage(pageName);
    if (!tourSteps || tourSteps.length === 0) {
      console.error('No tour steps defined for page:', pageName);
      return;
    }

    // Get the existing button
    const tourButton = document.getElementById('start-tour');
    if (!tourButton) {
      console.error('Tour button with ID "start-tour" not found in the DOM');
      return;
    }

    console.log('Found existing tour button, attaching event listener');

    // Add click handler to the existing button
    tourButton.addEventListener('click', function () {
      console.log('Tour button clicked, starting tour');
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
  }

  // Get tour steps for specific page
  function getTourStepsForPage(pageName) {
    const tourSteps = {
      // Rules page tour
      rules: [
        {
          element: '#rule_details',
          intro:
            'This is the Rules table where you can see all Launch rules defined in the property.',
          position: 'bottom',
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
          element: 'th',
          intro: 'Click on column headers to sort the table.',
          position: 'bottom',
        },
      ],

      // Extensions page tour
      extensions: [
        {
          element: '#extension_details',
          intro: 'This table shows all extensions in your Launch property.',
          position: 'bottom',
        },
        {
          element: 'th',
          intro:
            'These columns show you how each extension is used in your property.',
          position: 'bottom',
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

      // Mapping page tour
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

    return tourSteps[pageName] || [];
  }
})();
