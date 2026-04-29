// TagScanner — Health Payload Builder
// Assembles structured health signals from already-computed summary.js data
// and passes them to bedrockClient.js for analysis
(function (global) {
  'use strict';

  function buildHealthPayload(p) {
    // p: { dataElements, rules, extensions, usageData,
    //       unusedDataElements, unusedRules, unusedExtensions, sizes }
    var de   = p.dataElements;
    var rl   = p.rules;
    var ext  = p.extensions;
    var ud   = p.usageData;
    var sz   = p.sizes;

    var deCount  = Object.keys(de).length;
    var rlCount  = rl.length;
    var extCount = Object.keys(ext).length;
    var totalSz  = sz.totalDeSize + sz.totalRuleSize + sz.totalExtSize;
    var unusedSz = sz.unusedDeSize + sz.unusedRuleSize + sz.unusedExtSize;

    // DE type distribution (last segment of modulePath)
    var typeDist = {};
    Object.keys(de).forEach(function (n) {
      var mp = ((de[n].modulePath || '').split('/').pop() || 'unknown').replace('.js', '');
      typeDist[mp] = (typeDist[mp] || 0) + 1;
    });

    // Most referenced DEs
    var deRefs = Object.keys(ud.dataElements)
      .filter(function (n) { return ud.dataElements[n].usedInRules && ud.dataElements[n].usedInRules.length; })
      .map(function (n) { return { name: n, rule_count: ud.dataElements[n].usedInRules.length }; })
      .sort(function (a, b) { return b.rule_count - a.rule_count; })
      .slice(0, 5);

    // DE → DE dependency chains
    var deChains = Object.keys(ud.dataElements)
      .filter(function (n) { return ud.dataElements[n].usedInDataElements && ud.dataElements[n].usedInDataElements.length; })
      .map(function (n) { return { name: n, referenced_by_de_count: ud.dataElements[n].usedInDataElements.length }; })
      .slice(0, 5);

    // Rule signals
    var rulesCustomCode = 0, rulesNoConditions = 0, rulesHighActions = 0, totalActions = 0;
    rl.forEach(function (rule) {
      var components = [].concat(rule.events || [], rule.conditions || [], rule.actions || []);
      var hasCode = components.some(function (c) {
        return c && c.settings && (c.settings.source || c.settings.customCode || c.settings.script);
      });
      if (hasCode) rulesCustomCode++;
      if (rule.events && rule.events.length > 0 && (!rule.conditions || rule.conditions.length === 0)) rulesNoConditions++;
      var ac = (rule.actions || []).length;
      totalActions += ac;
      if (ac > 5) rulesHighActions++;
    });

    // DE custom code count
    var deCustomCode = Object.keys(de).filter(function (n) {
      var d = de[n];
      return d.settings && (d.settings.source || d.settings.customCode || d.settings.script);
    }).length;

    // Top unused by size
    function topUnused(names, usageMap, labelKey) {
      return names
        .map(function (id) {
          return {
            name: (usageMap[id] && (usageMap[id].name || id)) || id,
            size_kb: (usageMap[id] && usageMap[id].size) || 0
          };
        })
        .sort(function (a, b) { return b.size_kb - a.size_kb; })
        .slice(0, 8);
    }

    return {
      property: {
        name:        sessionStorage.getItem('launch_property_name') || 'Unknown',
        environment: sessionStorage.getItem('launch_property_environment') || 'Production',
        url:         sessionStorage.getItem('launch_page_url') || '',
        total_size_kb: round2(totalSz)
      },
      rules: {
        total:             rlCount,
        without_events:    p.unusedRules.length,
        with_custom_code:  rulesCustomCode,
        no_conditions:     rulesNoConditions,
        high_action_count: rulesHighActions,
        avg_actions:       rlCount > 0 ? Math.round((totalActions / rlCount) * 10) / 10 : 0,
        top_unused:        topUnused(p.unusedRules, ud.rules, 'name')
      },
      data_elements: {
        total:                   deCount,
        unused:                  p.unusedDataElements.length,
        unused_pct:              deCount > 0 ? Math.round((p.unusedDataElements.length / deCount) * 100) : 0,
        with_custom_code:        deCustomCode,
        type_distribution:       typeDist,
        orphaned:                p.unusedDataElements.slice(0, 10),
        deep_dependency_chains:  deChains,
        most_referenced:         deRefs,
        top_unused_by_size:      topUnused(p.unusedDataElements, ud.dataElements, 'name')
      },
      extensions: {
        total:  extCount,
        unused: p.unusedExtensions.length,
        list:   Object.keys(ud.extensions).map(function (k) {
          return { name: ud.extensions[k].name || k, used: ud.extensions[k].used };
        })
      },
      size: {
        total_kb:        round2(totalSz),
        unused_kb:       round2(unusedSz),
        unused_pct:      totalSz > 0 ? Math.round((unusedSz / totalSz) * 100) : 0,
        rules_kb:        round2(sz.totalRuleSize),
        data_elements_kb: round2(sz.totalDeSize),
        extensions_kb:   round2(sz.totalExtSize)
      }
    };
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  // Returns a 16-char SHA-256 hex prefix of the property's structural composition.
  // Same composition (same sorted DE/rule/extension names) → same fingerprint.
  async function computeFingerprint(p) {
    var deNames  = Object.keys(p.dataElements || {}).sort();
    var rlNames  = (p.rules || []).map(function(r) { return r.name || r.id || ''; }).sort();
    var extNames = Object.keys(p.extensions || {}).sort();
    var str = deNames.join(',') + '|' + rlNames.join(',') + '|' + extNames.join(',');
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf))
      .map(function(b) { return b.toString(16).padStart(2, '0'); })
      .join('')
      .slice(0, 16);
  }

  global.TagScannerHealthPayload = { build: buildHealthPayload, computeFingerprint: computeFingerprint };

})(typeof window !== 'undefined' ? window : this);
