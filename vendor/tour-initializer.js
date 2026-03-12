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
    
    // Only run auto-tour for the summary page
    if (pageName === 'summary') {
      const tourShownKey = `tagScannerTourShown_${pageName}`;
      if (!localStorage.getItem(tourShownKey)) {
        // Set a small delay to ensure UI is fully rendered
        setTimeout(function () {
          startAutoTour(pageName);
          localStorage.setItem(tourShownKey, 'true');
        }, 2000);
      }
    }
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
          intro: 'Welcome to the Rules page! This page shows all the rules defined in your Adobe Tags property. Rules determine when and how your tags fire on your website.',
          position: 'center',
        },
        {
          element: '#rule_details',
          intro: 'This table displays all your Launch rules. Each row represents a rule with details about its events, conditions, and actions.',
          position: 'bottom',
        },
        {
          element: '#rule_details th:first-child',
          intro: 'Click on any column header to sort the table by that column. This helps you find specific rules quickly.',
          position: 'bottom',
        },
        {
          element: '#rule_details td:first-child a',
          intro: 'Click on any rule name to view detailed information about that specific rule, including all its configurations.',
          position: 'right',
        },
        {
          element: '.download-button',
          intro: 'Export the rules data to CSV format for analysis in Excel or other tools.',
          position: 'left',
        },
        {
          element: '#ruleSearchInput',
          intro: 'Use the search box to quickly find specific rules by name.',
          position: 'bottom',
        },
        {
          element: '#apply-filter',
          intro: 'Apply filters to show only rules that meet specific criteria, helping you focus on relevant rules.',
          position: 'left',
        },
      ],

      // Data Elements page tour
      dataElements: [
        {
          intro: 'Welcome to the Data Elements page! This page shows all data elements defined in your Adobe Tags property. Data elements are reusable values that can be used across multiple rules.',
          position: 'center',
        },
        {
          element: '#dataelement_details',
          intro: 'This table displays all data elements in your property. Each row shows a data element with its configuration and usage information.',
          position: 'bottom',
        },
        {
          element: '#dataelement_details th:first-child',
          intro: 'Click on any column header to sort the table by that column. This helps you find specific data elements quickly.',
          position: 'bottom',
        },
        {
          element: '#dataelement_details td:first-child a',
          intro: 'Click on any data element name to view detailed information about that specific data element.',
          position: 'right',
        },
        {
          element: '.download-button',
          intro: 'Export the data elements data to CSV format for analysis in Excel or other tools.',
          position: 'left',
        },
      ],

      // Extensions page tour
      extensions: [
        {
          intro: 'Welcome to the Extensions page! This page shows all extensions installed in your Adobe Tags property. Extensions add functionality to your implementation.',
          position: 'center',
        },
        {
          element: '#extension_details',
          intro: 'This table displays all extensions in your property. Each row shows an extension with its configuration and usage information.',
          position: 'bottom',
        },
        {
          element: '#extension_details th:first-child',
          intro: 'Click on any column header to sort the table by that column. This helps you find specific extensions quickly.',
          position: 'bottom',
        },
        {
          element: '#extension_details td:first-child a',
          intro: 'Click on any extension name to view detailed information about that specific extension.',
          position: 'right',
        },
        {
          element: '.download-button',
          intro: 'Export the extensions data to CSV format for analysis in Excel or other tools.',
          position: 'left',
        },
      ],

      // Summary page tour
      summary: [
        {
          intro: 'Welcome to the Summary page! This page provides a comprehensive overview of your Adobe Tags property and helps you identify optimization opportunities.',
          position: 'center',
        },
        {
          element: '.data-element-card',
          intro: 'This card shows data elements usage. It displays the count of unused data elements and lists them, helping you identify components that can be removed to reduce property size.',
          position: 'bottom',
        },
        {
          element: '.rule-card',
          intro: 'This card shows rules usage. It displays the count of unused rules and lists them, helping you identify rules that can be removed to optimize performance.',
          position: 'bottom',
        },
        {
          element: '.extension-card',
          intro: 'This card shows extensions usage. It displays the count of unused extensions and lists them, helping you identify extensions that can be removed to reduce property size.',
          position: 'bottom',
        },
        {
          element: '.property-details-card',
          intro: 'This card shows your property details including name, environment, and total size. It helps you understand the overall impact of your implementation.',
          position: 'bottom',
        },
        {
          element: '#download-pdf',
          intro: 'Generate a PDF report that you can share with your team or stakeholders. The report includes all the summary information in a print-friendly format.',
          position: 'left',
        },
        {
          intro: 'The summary page helps you identify unused components that are adding unnecessary weight to your property. Removing these can improve page load times and reduce costs.',
          position: 'center',
        },
      ],

      // Mapping page tour
      mapping: [
        {
          intro: 'Welcome to the Relationship Diagram page! This page shows the connections between different components in your Adobe Tags property, helping you understand dependencies.',
          position: 'center',
        },
        {
          element: '.relationship-container',
          intro: 'This interactive diagram visualizes the relationships between rules, data elements, and extensions in your property. It helps you understand how components are connected.',
          position: 'bottom',
        },
        {
          element: '.list-section',
          intro: 'Browse and select components from these lists to explore their relationships in the diagram. This helps you understand dependencies and impact of changes.',
          position: 'right',
        },
        {
          element: '.download-button',
          intro: 'Export the relationship data to CSV format for analysis or documentation.',
          position: 'left',
        },
      ],
    };

    return tourSteps[pageName] || [];
  }
  
  // Function to start auto tour for first-time users
  function startAutoTour(pageName) {
    console.log('Starting auto tour for first-time user on page:', pageName);
    
    if (typeof introJs !== 'function') {
      console.error('introJs not available for auto tour');
      return;
    }
    
    const tourSteps = getTourStepsForPage(pageName);
    if (!tourSteps || tourSteps.length === 0) {
      console.error('No tour steps defined for auto tour on page:', pageName);
      return;
    }
    
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
      tooltipClass: 'customTooltip',
      highlightClass: 'customHighlight',
    });
    
    // Add welcome message for first-time users
    tour.onbeforechange(function(targetElement) {
      if (tour._currentStep === 0) {
        // First step - add welcome message
        const tooltip = document.querySelector('.introjs-tooltip');
        if (tooltip) {
          const welcomeDiv = document.createElement('div');
          welcomeDiv.innerHTML = '<div style="background: #e3f2fd; padding: 10px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #2196f3;"><strong>Welcome to TagScanner!</strong><br>This is your first visit. Let us show you around!</div>';
          tooltip.insertBefore(welcomeDiv, tooltip.firstChild);
        }
      }
    });
    
    tour.start();
  }
})();
