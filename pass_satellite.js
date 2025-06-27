//console.log('Loading satellite...');

function getSatellite() {
  setTimeout(() => {
    var main = {};
    console.log('in line 5 in pass_satellite ' + window._satellite._container);
    main.satellite = JSON.parse(
      JSON.stringify(window._satellite._container, (key, value) => {
        if (typeof value === 'function') {
          return value.toString();
        }
        return value;
      })
    );

    // After the data is ready, send the message
    window.postMessage({ type: 'FROM_PAGE', essential: main });
  }, 3000); // Delay execution by 3 seconds
}

// Call the function to initiate the process
getSatellite();
