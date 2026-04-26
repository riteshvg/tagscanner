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

    // Initialize tour with the existing button (no auto-tour on first load)
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
          intro: 'Welcome to the Rules page! This page shows all the rules defined in your Adobe Tags property. Rules determine when and how your tags fire on your website.',
          position: 'center',
        },
        {
          element: '#rule_details',
          intro: 'This table displays all your rules. Each row shows a rule with its events, conditions, and actions. Columns can be sorted by clicking the header.',
          position: 'bottom',
        },
        {
          element: '#rule_details th.rule-col-id',
          intro: 'Click on any column header to sort the table by that column. This helps you find specific rules quickly.',
          position: 'bottom',
        },
        {
          element: '#rule_details .rule-name-cell',
          intro: 'Click on any rule name to expand the row and view events, conditions, and actions in detail. Click again to collapse.',
          position: 'right',
        },
        {
          element: '#ruleSearchInput',
          intro: 'Use the search box to quickly find rules by name.',
          position: 'bottom',
        },
        {
          element: '.download-button',
          intro: 'Export the rules data to CSV format for analysis in Excel or other tools.',
          position: 'left',
        },
      ],

      // Data Elements page tour
      dataElements: [
        {
          intro: 'Welcome to the Data Elements page! This page shows all data elements defined in your Adobe Tags property. Data elements are reusable values used across rules and extensions.',
          position: 'center',
        },
        {
          element: '#dataelement_details',
          intro: 'This table displays all data elements. Each row shows type, usage in rules and extensions, and size. Click column headers to sort.',
          position: 'bottom',
        },
        {
          element: '#dataelement_details th.de-col-id',
          intro: 'Click on any column header to sort the table by that column. This helps you find specific data elements quickly.',
          position: 'bottom',
        },
        {
          element: '#dataelement_details .de-name-cell',
          intro: 'Click on any data element name to expand the row and view where it is used in rules and extensions.',
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
          intro: 'This table displays all extensions. Each row shows an extension with usage in rules, events, conditions, and data elements. Click column headers to sort.',
          position: 'bottom',
        },
        {
          element: '#extension_details th.ext-col-id',
          intro: 'Click on any column header to sort the table by that column. This helps you find specific extensions quickly.',
          position: 'bottom',
        },
        {
          element: '#extension_details .ext-name-cell',
          intro: 'Click on any extension name to expand the row and view detailed usage in rules and data elements.',
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
          intro: 'Welcome to the Summary page! This page provides an overview of your Adobe Tags property and helps you identify optimization opportunities.',
          position: 'center',
        },
        {
          element: '.data-element-card',
          intro: 'This card shows data element usage: counts of unused vs total, and a list of unused data elements you can consider removing to reduce property size.',
          position: 'bottom',
        },
        {
          element: '.rule-card',
          intro: 'This card shows rules usage: counts of unused vs total, and a list of unused rules you can consider removing to optimize performance.',
          position: 'bottom',
        },
        {
          element: '.extension-card',
          intro: 'This card shows extensions usage: counts of unused vs total, and a list of unused extensions you can consider removing.',
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
          intro: 'The summary helps you identify unused components that add weight to your property. Removing them can improve page load times and reduce costs.',
          position: 'center',
        },
      ],

      // Mapping page tour (Rule & Data Element Relationships)
      mapping: [
        {
          intro: 'Welcome to the Rule & Data Element Relationships page! Here you can see how rules connect to data elements in your Adobe Tags property.',
          position: 'center',
        },
        {
          element: '.tab-buttons',
          intro: 'Switch between Rules and Data Elements tabs to view the list of components. Select a tab to load the corresponding list.',
          position: 'bottom',
        },
        {
          element: '.relationship-container',
          intro: 'The left panel lists rules or data elements. The right panel shows relationship details for the selected item.',
          position: 'bottom',
        },
        {
          element: '.list-section',
          intro: 'Browse and click a rule or data element in this list. The details panel on the right will show where it is used and how it connects to other components.',
          position: 'right',
        },
        {
          element: '#searchInput',
          intro: 'Use the search box to filter the list and quickly find a specific rule or data element.',
          position: 'bottom',
        },
        {
          element: '.details-section',
          intro: 'When you select an item from the list, this panel shows its relationships: which data elements a rule uses, or which rules use a data element.',
          position: 'left',
        },
      ],
    };

    return tourSteps[pageName] || [];
  }
})();
