(function () {
  'use strict';

  var RSID            = 'ageo1xxsintagscanner';
  var TRACKING_SERVER = 'adobeintriteshgupta.sc.omtrdc.net';
  // /0 = GET path for the Data Insertion API
  var ENDPOINT        = 'https://' + TRACKING_SERVER + '/b/ss/' + RSID + '/0';
  var APP_VERSION     = '2.5.6';
  var ECID_KEY        = 'ts_ecid'; // replaces ts_analytics_vid

  var _ecid = null;

  // Generates a valid 38-digit decimal ECID-format number using crypto randomness.
  // AA uses mid (ECID) for unique visitor counting via the identity graph.
  function generateECID() {
    var arr = new Uint32Array(4); // 4 × up to 10 digits → 40 chars
    crypto.getRandomValues(arr);
    var n = Array.from(arr).map(function (v) {
      return v.toString().padStart(10, '0');
    }).join('').slice(0, 38);
    // Guarantee no leading zero
    if (n[0] === '0') n = '1' + n.slice(1);
    return n;
  }

  function getECID(cb) {
    if (_ecid) { cb(_ecid); return; }
    try {
      chrome.storage.local.get(ECID_KEY, function (data) {
        _ecid = data[ECID_KEY] || generateECID();
        if (!data[ECID_KEY]) {
          var o = {}; o[ECID_KEY] = _ecid;
          chrome.storage.local.set(o);
        }
        cb(_ecid);
      });
    } catch (e) {
      _ecid = _ecid || generateECID();
      cb(_ecid);
    }
  }

  function getSession() {
    try { return JSON.parse(localStorage.getItem('tagscanner_session') || 'null'); } catch (e) { return null; }
  }

  function hashEmail(email) {
    if (!email || !crypto.subtle) return Promise.resolve('');
    try {
      var data = new TextEncoder().encode(email.toLowerCase().trim());
      return crypto.subtle.digest('SHA-256', data).then(function (buf) {
        return Array.from(new Uint8Array(buf))
          .map(function (b) { return b.toString(16).padStart(2, '0'); })
          .join('');
      });
    } catch (e) { return Promise.resolve(''); }
  }

  function getPropCtx() {
    var hostname = '';
    try { hostname = sessionStorage.getItem('scan_hostname') || ''; } catch (e) {}
    return {
      name:     sessionStorage.getItem('launch_property_name') || '',
      env:      sessionStorage.getItem('launch_property_environment') || '',
      hostname: hostname
    };
  }

  function send(params) {
    try {
      getECID(function (ecid) {
        var s = getSession();
        var p = getPropCtx();
        var base = {
          // ── Required ──────────────────────────────────────────────────────
          mid: ecid,                       // 38-digit ECID — used by AA for unique visitor counting
          ce:  'UTF-8',                    // character encoding
          // chrome-extension:// URLs are filtered by AA; map pageName to a stable https URL
          g:   'https://tagscanner.extension/' + ((params && params.pageName) || 'home').replace('TagScanner:', '').toLowerCase().replace(/\s+/g, '-'),
          ts:  Math.floor(Date.now() / 1000).toString(), // Unix epoch seconds; suite is timestamp-optional
          // ── Recommended ───────────────────────────────────────────────────
          ch:  'TagScanner',              // site section / channel
          r:   document.referrer || '',   // referrer URL
          // ── Custom dimensions ──────────────────────────────────────────────
          v1:  p.name,                    // eVar1: Tags property name
          v2:  p.env,                     // eVar2: environment
          v3:  s ? (s.isAdmin ? 'admin' : 'user') : 'anonymous', // eVar3: user role
          v4:  APP_VERSION,               // eVar4: TagScanner version
          v12: p.hostname,               // eVar12: scanned website hostname
          c1:  p.name,                    // prop1: property name (pathing)
          c2:  (params && params.pageName) || ''  // prop2: current section
        };
        // vid = Google userId included only when signed in, so server-side Lambda
        // hits (which use vid = userId) can be stitched with client-side hits
        if (s && s.userId) base.vid = s.userId;

        function fire(hash) {
          if (hash) base.v7 = hash;
          var merged = Object.assign({}, base, params);
          if (merged.pageName && !merged.v11) merged.v11 = merged.pageName;
          var qs = Object.keys(merged).map(function (k) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(merged[k] != null ? merged[k] : '');
          }).join('&');
          fetch(ENDPOINT + '?' + qs, { method: 'GET', keepalive: true }).catch(function () {});
        }

        if (s && s.email) {
          hashEmail(s.email).then(fire).catch(function () { fire(''); });
        } else {
          fire('');
        }
      });
    } catch (e) {}
  }

  var _suppressNextPageView = null;

  // ── Time-spent heartbeat ──────────────────────────────────────────────────
  // Fires event15 once per minute while a property is active.
  // In AA: sum(event15) grouped by eVar1 = total minutes per property.

  var _heartbeatTimer = null;

  function fireHeartbeat() {
    var p = getPropCtx();
    if (!p.name || p.name === 'No Launch Code') return;
    send({
      pageName: 'TagScanner:Session',
      pe:       'lnk_o',
      pev2:     'Session:Heartbeat',
      v9:       'Session:Heartbeat',
      events:   'event15'
    });
  }

  function startHeartbeat() {
    if (_heartbeatTimer) return; // already running
    _heartbeatTimer = setInterval(fireHeartbeat, 60000);
  }

  window.TagScannerAnalytics = {
    page: function (pageName, extra) {
      if (_suppressNextPageView === pageName) {
        _suppressNextPageView = null;
        return;
      }
      var prev = '';
      try { prev = sessionStorage.getItem('ts_prev_page') || ''; } catch (e) {}
      try { sessionStorage.setItem('ts_prev_page', pageName); } catch (e) {}
      send(Object.assign({ pageName: pageName, v10: prev }, extra || {}));
    },
    suppressNextPageView: function (pageName) {
      _suppressNextPageView = pageName;
    },
    track: function (linkName, extra) {
      send(Object.assign({
        pe:      'lnk_o',
        pev2:    linkName,
        v9:      linkName,  // eVar9: link name dimension (mirrors pev2 for reporting)
        pageName: 'TagScanner'
      }, extra || {}));
    },
    startHeartbeat: startHeartbeat
  };
})();
