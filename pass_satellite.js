//console.log('Loading satellite...');

function getSatellite() {
  setTimeout(() => {
    var main = {};
    var container = (window._satellite && window._satellite._container) || {};

    function cloneJsonSafe(value) {
      return JSON.parse(
        JSON.stringify(value, (key, val) => {
          if (typeof val === 'function') return val.toString();
          return val;
        })
      );
    }

    function stripFunctionWrapper(source) {
      if (typeof source !== 'string') return source;
      var trimmed = source.trim();
      var wrappedFn = trimmed.match(
        /^function\s*\([^)]*\)\s*\{([\s\S]*)\}$/
      );
      if (wrappedFn && wrappedFn[1]) return wrappedFn[1].trim();
      return trimmed;
    }

    function getRuntimeDataElements(ctn) {
      if (!ctn || typeof ctn !== 'object') return {};
      if (ctn.data_elements && typeof ctn.data_elements === 'object') {
        return ctn.data_elements;
      }
      if (ctn.dataElements && typeof ctn.dataElements === 'object') {
        return ctn.dataElements;
      }
      return {};
    }

    function buildDataElementsSnapshot(ctn) {
      var runtimeDE = getRuntimeDataElements(ctn);
      var sourceDE =
        (ctn && ctn.dataElements && typeof ctn.dataElements === 'object'
          ? ctn.dataElements
          : {}) || {};
      var mergedNames = new Set(
        Object.keys(sourceDE).concat(Object.keys(runtimeDE))
      );
      var snapshot = {};

      mergedNames.forEach((deName) => {
        try {
          var base = sourceDE[deName] || runtimeDE[deName] || {};
          var deClone = cloneJsonSafe(base);
          var runtimeDef = runtimeDE[deName];
          var runtimeSource =
            runtimeDef &&
            runtimeDef.settings &&
            typeof runtimeDef.settings === 'object'
              ? runtimeDef.settings.source
              : null;

          if (
            runtimeSource !== null &&
            runtimeSource !== undefined &&
            (typeof runtimeSource === 'function' || typeof runtimeSource === 'string')
          ) {
            if (!deClone.settings || typeof deClone.settings !== 'object') {
              deClone.settings = {};
            }
            var sourceText =
              typeof runtimeSource === 'function'
                ? runtimeSource.toString()
                : runtimeSource;
            deClone.settings.source = stripFunctionWrapper(sourceText);
          }

          snapshot[deName] = deClone;
        } catch (elemErr) {
          // Serialization failed for this element — preserve key with minimal safe info
          try {
            var fallback = sourceDE[deName] || runtimeDE[deName];
            snapshot[deName] = {
              modulePath: (fallback && typeof fallback.modulePath === 'string') ? fallback.modulePath : ''
            };
          } catch (_) {
            snapshot[deName] = {};
          }
        }
      });

      return snapshot;
    }

    // Capture raw count before any serialization so it reflects the true container count
    var rawDECount = Object.keys((container && container.dataElements) || {}).length;

    console.log('in line 5 in pass_satellite ' + container);
    main.satellite = cloneJsonSafe(container);
    main.dataElementsRawCount = rawDECount;
    try {
      var deSnapshot = buildDataElementsSnapshot(container);
      if (deSnapshot && Object.keys(deSnapshot).length > 0) {
        main.satellite.dataElements = deSnapshot;
      }
    } catch (deErr) {
      console.warn('Unable to enrich runtime data element custom code:', deErr);
    }

    // After the data is ready, send the message
    window.postMessage({ type: 'FROM_PAGE', essential: main });
  }, 3000); // Delay execution by 3 seconds
}

// Call the function to initiate the process
getSatellite();
