(function () {
  var NODE_HEIGHT = 28;
  var NODE_WIDTH = 16;
  var NODE_GAP = 8;
  var COLUMN_GAP = 100;
  var HORIZ_PADDING = 24;
  var VERT_PADDING = 52;

  function getRulesArray() {
    try {
      var raw = sessionStorage.getItem('_satellite._container.rules');
      if (!raw) return [];
      var o = JSON.parse(raw);
      if (Array.isArray(o)) return o;
      if (o && typeof o === 'object') {
        if (Array.isArray(o.rules)) return o.rules;
        return Object.values(o).filter(function (item) { return item && typeof item === 'object'; });
      }
      return [];
    } catch (e) { return []; }
  }

  function getDataElements() {
    try {
      var raw = sessionStorage.getItem('_satellite._container.dataElements');
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (e) { return {}; }
  }

  function getExtensions() {
    try {
      var raw = sessionStorage.getItem('_satellite._container.extension');
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (e) { return {}; }
  }

  function stringContainsDERef(str, deName) {
    if (!str || typeof str !== 'string') return false;
    var v = '%' + deName + '%';
    var c1 = '_satellite.getVar("' + deName + '")';
    var c2 = "_satellite.getVar('" + deName + "')";
    return str.indexOf(v) > -1 || str.indexOf(c1) > -1 || str.indexOf(c2) > -1;
  }

  function extractExtensionId(modulePath) {
    if (!modulePath || typeof modulePath !== 'string') return null;
    var parts = modulePath.split('/');
    return parts[0] || null;
  }

  function buildRelationships(rulesArray, dataElements, extensions) {
    var ruleToDataElement = {};
    var dataElementToRule = {};
    var ruleToExtension = {};
    var extensionToRule = {};

    var deKeys = Object.keys(dataElements);

    rulesArray.forEach(function (rule, rIdx) {
      var ruleName = rule.name || rule.id || 'Rule ' + (rIdx + 1);
      ruleToDataElement[ruleName] = {};
      ruleToExtension[ruleName] = {};

      function scanForDE(obj) {
        if (!obj) return;
        if (typeof obj === 'string') {
          deKeys.forEach(function (deName) {
            if (stringContainsDERef(obj, deName)) {
              ruleToDataElement[ruleName][deName] = (ruleToDataElement[ruleName][deName] || 0) + 1;
              dataElementToRule[deName] = dataElementToRule[deName] || {};
              dataElementToRule[deName][ruleName] = (dataElementToRule[deName][ruleName] || 0) + 1;
            }
          });
          return;
        }
        if (Array.isArray(obj)) {
          obj.forEach(scanForDE);
          return;
        }
        if (typeof obj === 'object') {
          Object.keys(obj).forEach(function (k) { scanForDE(obj[k]); });
        }
      }

      function scanForExt(items) {
        if (!items || !Array.isArray(items)) return;
        items.forEach(function (item) {
          var extId = item && item.modulePath ? extractExtensionId(item.modulePath) : null;
          if (extId) {
            ruleToExtension[ruleName][extId] = (ruleToExtension[ruleName][extId] || 0) + 1;
            extensionToRule[extId] = extensionToRule[extId] || {};
            extensionToRule[extId][ruleName] = (extensionToRule[extId][ruleName] || 0) + 1;
          }
        });
      }

      scanForDE(rule.events);
      scanForDE(rule.conditions);
      scanForDE(rule.actions);
      scanForExt(rule.events);
      scanForExt(rule.conditions);
      scanForExt(rule.actions);
    });

    return {
      ruleToDataElement: ruleToDataElement,
      dataElementToRule: dataElementToRule,
      ruleToExtension: ruleToExtension,
      extensionToRule: extensionToRule
    };
  }

  function buildFlowData(rels, extensions, containsFilter) {
    var DE = [];
    var R = [];
    var Ext = [];

    function matchFilter(name) {
      if (!containsFilter || !containsFilter.trim()) return true;
      return (name || '').toLowerCase().indexOf(containsFilter.toLowerCase().trim()) > -1;
    }

    Object.keys(rels.dataElementToRule).forEach(function (deName) {
      if (!matchFilter(deName)) return;
      var total = 0;
      Object.keys(rels.dataElementToRule[deName]).forEach(function (r) {
        total += rels.dataElementToRule[deName][r];
      });
      DE.push({ id: 'de_' + deName, name: deName, type: 'de', total: total });
    });

    Object.keys(rels.ruleToDataElement).forEach(function (ruleName) {
      if (!matchFilter(ruleName)) return;
      var totalIn = 0, totalOut = 0;
      Object.keys(rels.ruleToDataElement[ruleName]).forEach(function (de) {
        totalIn += rels.ruleToDataElement[ruleName][de];
      });
      Object.keys(rels.ruleToExtension[ruleName] || {}).forEach(function (extId) {
        totalOut += rels.ruleToExtension[ruleName][extId];
      });
      R.push({ id: 'rule_' + ruleName, name: ruleName, type: 'rule', total: totalIn + totalOut });
    });

    Object.keys(rels.extensionToRule).forEach(function (extId) {
      var displayName = (extensions[extId] && extensions[extId].displayName) ? extensions[extId].displayName : extId;
      if (!matchFilter(displayName) && !matchFilter(extId)) return;
      var total = 0;
      Object.keys(rels.extensionToRule[extId]).forEach(function (r) {
        total += rels.extensionToRule[extId][r];
      });
      Ext.push({ id: 'ext_' + extId, name: displayName, type: 'ext', total: total });
    });

    DE.sort(function (a, b) { return b.total - a.total; });
    R.sort(function (a, b) { return b.total - a.total; });
    Ext.sort(function (a, b) { return b.total - a.total; });

    var nodes = [];
    var nodeById = {};
    DE.forEach(function (n, i) {
      nodes.push(n);
      n.column = 0;
      n.index = i;
      nodeById[n.id] = n;
    });
    R.forEach(function (n, i) {
      nodes.push(n);
      n.column = 1;
      n.index = i;
      nodeById[n.id] = n;
    });
    Ext.forEach(function (n, i) {
      nodes.push(n);
      n.column = 2;
      n.index = i;
      nodeById[n.id] = n;
    });

    var linkMap = {};
    function addLink(source, target, value, label) {
      var key = source + '|' + target;
      if (!linkMap[key]) linkMap[key] = { source: source, target: target, value: 0, labels: [] };
      linkMap[key].value += value;
      if (label && linkMap[key].labels.indexOf(label) === -1) linkMap[key].labels.push(label);
    }

    Object.keys(rels.dataElementToRule).forEach(function (deName) {
      if (!matchFilter(deName)) return;
      var srcId = 'de_' + deName;
      Object.keys(rels.dataElementToRule[deName]).forEach(function (ruleName) {
        if (!matchFilter(ruleName)) return;
        var tgtId = 'rule_' + ruleName;
        if (nodeById[srcId] && nodeById[tgtId]) {
          addLink(srcId, tgtId, rels.dataElementToRule[deName][ruleName], deName + ' \u2192 ' + ruleName);
        }
      });
    });
    Object.keys(rels.ruleToExtension).forEach(function (ruleName) {
      if (!matchFilter(ruleName)) return;
      var srcId = 'rule_' + ruleName;
      Object.keys(rels.ruleToExtension[ruleName]).forEach(function (extId) {
        var tgtId = 'ext_' + extId;
        if (nodeById[srcId] && nodeById[tgtId]) {
          var extName = (extensions[extId] && extensions[extId].displayName) ? extensions[extId].displayName : extId;
          addLink(srcId, tgtId, rels.ruleToExtension[ruleName][extId], ruleName + ' \u2192 ' + extName);
        }
      });
    });

    var links = Object.keys(linkMap).map(function (k) {
      var l = linkMap[k];
      return { source: l.source, target: l.target, value: l.value, label: l.labels.length ? l.labels[0] + (l.labels.length > 1 ? ' (+' + (l.labels.length - 1) + ')' : '') : '', labelCount: l.labels.length };
    });

    return { nodes: nodes, links: links, nodeById: nodeById };
  }

  function buildFlowDataForSelection(rels, extensions, selectedType, selectedKey) {
    var DE = [], R = [], Ext = [];
    var nodeById = {};
    var linkMap = {};

    function addLink(source, target, value, label) {
      var key = source + '|' + target;
      if (!linkMap[key]) linkMap[key] = { source: source, target: target, value: 0, labels: [] };
      linkMap[key].value += value;
      if (label && linkMap[key].labels.indexOf(label) === -1) linkMap[key].labels.push(label);
    }

    function addNode(list, id, name, type, total) {
      var n = { id: id, name: name, type: type, total: total || 0 };
      list.push(n);
      nodeById[id] = n;
    }

    if (selectedType === 'de') {
      var deName = selectedKey;
      if (!rels.dataElementToRule[deName]) return { nodes: [], links: [], nodeById: {} };
      addNode(DE, 'de_' + deName, deName, 'de');
      var rulesUsed = Object.keys(rels.dataElementToRule[deName]);
      rulesUsed.forEach(function (r) {
        addNode(R, 'rule_' + r, r, 'rule');
        addLink('de_' + deName, 'rule_' + r, rels.dataElementToRule[deName][r], deName + ' \u2192 ' + r);
      });
      var extIds = {};
      rulesUsed.forEach(function (r) {
        Object.keys(rels.ruleToExtension[r] || {}).forEach(function (eid) {
          extIds[eid] = true;
        });
      });
      Object.keys(extIds).forEach(function (eid) {
        var disp = (extensions[eid] && extensions[eid].displayName) ? extensions[eid].displayName : eid;
        addNode(Ext, 'ext_' + eid, disp, 'ext');
      });
      rulesUsed.forEach(function (r) {
        Object.keys(rels.ruleToExtension[r] || {}).forEach(function (eid) {
          if (extIds[eid]) addLink('rule_' + r, 'ext_' + eid, rels.ruleToExtension[r][eid], r + ' \u2192 ' + ((extensions[eid] && extensions[eid].displayName) ? extensions[eid].displayName : eid));
        });
      });
    } else if (selectedType === 'rule') {
      var ruleName = selectedKey;
      var hasDE = rels.ruleToDataElement[ruleName];
      var hasExt = rels.ruleToExtension[ruleName];
      if (!hasDE && !hasExt) return { nodes: [], links: [], nodeById: {} };
      if (hasDE) {
        Object.keys(hasDE).forEach(function (de) {
          addNode(DE, 'de_' + de, de, 'de');
          addLink('de_' + de, 'rule_' + ruleName, hasDE[de], de + ' \u2192 ' + ruleName);
        });
      }
      addNode(R, 'rule_' + ruleName, ruleName, 'rule');
      if (hasExt) {
        Object.keys(hasExt).forEach(function (eid) {
          var disp = (extensions[eid] && extensions[eid].displayName) ? extensions[eid].displayName : eid;
          addNode(Ext, 'ext_' + eid, disp, 'ext');
          addLink('rule_' + ruleName, 'ext_' + eid, hasExt[eid], ruleName + ' \u2192 ' + disp);
        });
      }
    } else if (selectedType === 'ext') {
      var extId = selectedKey;
      if (!rels.extensionToRule[extId]) return { nodes: [], links: [], nodeById: {} };
      var rulesUsed = Object.keys(rels.extensionToRule[extId]);
      var deSet = {};
      rulesUsed.forEach(function (r) {
        Object.keys(rels.ruleToDataElement[r] || {}).forEach(function (de) {
          deSet[de] = true;
        });
      });
      Object.keys(deSet).forEach(function (de) {
        addNode(DE, 'de_' + de, de, 'de');
      });
      rulesUsed.forEach(function (r) {
        addNode(R, 'rule_' + r, r, 'rule');
        Object.keys(rels.ruleToDataElement[r] || {}).forEach(function (de) {
          addLink('de_' + de, 'rule_' + r, rels.ruleToDataElement[r][de], de + ' \u2192 ' + r);
        });
        addLink('rule_' + r, 'ext_' + extId, rels.extensionToRule[extId][r], r + ' \u2192 ' + ((extensions[extId] && extensions[extId].displayName) ? extensions[extId].displayName : extId));
      });
      var disp = (extensions[extId] && extensions[extId].displayName) ? extensions[extId].displayName : extId;
      addNode(Ext, 'ext_' + extId, disp, 'ext');
    }

    var nodes = [];
    DE.forEach(function (n, i) { n.column = 0; n.index = i; nodes.push(n); });
    R.forEach(function (n, i) { n.column = 1; n.index = i; nodes.push(n); });
    Ext.forEach(function (n, i) { n.column = 2; n.index = i; nodes.push(n); });

    var links = Object.keys(linkMap).map(function (k) {
      var l = linkMap[k];
      return { source: l.source, target: l.target, value: l.value, label: l.labels.length ? l.labels[0] : '' };
    });

    return { nodes: nodes, links: links, nodeById: nodeById };
  }

  function showNodeConnectionsModal(node, rels, extensions) {
    var modal = document.getElementById('flowNodeModal');
    var titleEl = document.getElementById('flowNodeModalTitle');
    var bodyEl = document.getElementById('flowNodeModalBody');
    if (!modal || !titleEl || !bodyEl) return;

    var isAggregate = node.isAggregate;
    var type = node.type;
    var name = node.name;
    var id = node.id;

    if (isAggregate) {
      titleEl.textContent = name;
      bodyEl.innerHTML = '<p class="text-muted mb-0">This group represents multiple items. Use the <strong>Contains</strong> filter to see specific items.</p>';
    } else if (type === 'rule') {
      titleEl.textContent = 'Rule: ' + name;
      var deMap = rels.ruleToDataElement[name] || {};
      var extMap = rels.ruleToExtension[name] || {};
      var deList = Object.keys(deMap).sort();
      var extList = Object.keys(extMap).map(function (extId) {
        var disp = (extensions[extId] && extensions[extId].displayName) ? extensions[extId].displayName : extId;
        return { id: extId, name: disp, count: extMap[extId] };
      });
      var html = '';
      if (deList.length) {
        html += '<h6 class="mt-2 mb-1"><i class="fas fa-database text-info mr-1"></i>Data elements used (' + deList.length + ')</h6><ul class="list-group list-group-flush mb-3">';
        deList.forEach(function (de) {
          html += '<li class="list-group-item d-flex justify-content-between align-items-center">' + escapeHtml(de) + ' <span class="badge badge-primary">' + (deMap[de] || 0) + '</span></li>';
        });
        html += '</ul>';
      }
      if (extList.length) {
        html += '<h6 class="mt-2 mb-1"><i class="fas fa-puzzle-piece text-secondary mr-1"></i>Extensions used (' + extList.length + ')</h6><ul class="list-group list-group-flush">';
        extList.forEach(function (e) {
          html += '<li class="list-group-item d-flex justify-content-between align-items-center">' + escapeHtml(e.name) + ' <span class="badge badge-secondary">' + e.count + '</span></li>';
        });
        html += '</ul>';
      }
      if (!html) html = '<p class="text-muted mb-0">No data elements or extensions linked in this flow.</p>';
      bodyEl.innerHTML = html;
    } else if (type === 'de') {
      titleEl.textContent = 'Data element: ' + name;
      var ruleMap = rels.dataElementToRule[name] || {};
      var ruleList = Object.keys(ruleMap).sort();
      if (ruleList.length) {
        bodyEl.innerHTML = '<h6 class="mt-0 mb-1"><i class="fas fa-gavel text-primary mr-1"></i>Used in rules (' + ruleList.length + ')</h6><ul class="list-group list-group-flush">' +
          ruleList.map(function (r) {
            return '<li class="list-group-item d-flex justify-content-between align-items-center">' + escapeHtml(r) + ' <span class="badge badge-primary">' + (ruleMap[r] || 0) + '</span></li>';
          }).join('') + '</ul>';
      } else {
        bodyEl.innerHTML = '<p class="text-muted mb-0">Not used in any rules in this flow.</p>';
      }
    } else if (type === 'ext') {
      var extId = id.replace(/^ext_/, '');
      titleEl.textContent = 'Extension: ' + name;
      var ruleMap = rels.extensionToRule[extId] || {};
      var ruleList = Object.keys(ruleMap).sort();
      if (ruleList.length) {
        bodyEl.innerHTML = '<h6 class="mt-0 mb-1"><i class="fas fa-gavel text-primary mr-1"></i>Used in rules (' + ruleList.length + ')</h6><ul class="list-group list-group-flush">' +
          ruleList.map(function (r) {
            return '<li class="list-group-item d-flex justify-content-between align-items-center">' + escapeHtml(r) + ' <span class="badge badge-primary">' + (ruleMap[r] || 0) + '</span></li>';
          }).join('') + '</ul>';
      } else {
        bodyEl.innerHTML = '<p class="text-muted mb-0">Not used in any rules in this flow.</p>';
      }
    }

    modal.classList.add('show');
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden', 'false');
    var backdrop = document.getElementById('flowModalBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'flowModalBackdrop';
      backdrop.className = 'flow-modal-backdrop';
      backdrop.addEventListener('click', closeFlowNodeModal);
      document.body.appendChild(backdrop);
    }
    backdrop.style.display = 'block';
    document.addEventListener('keydown', flowModalEscapeHandler);
  }

  function flowModalEscapeHandler(e) {
    if (e.key === 'Escape') closeFlowNodeModal();
  }

  function closeFlowNodeModal() {
    var modal = document.getElementById('flowNodeModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    var backdrop = document.getElementById('flowModalBackdrop');
    if (backdrop) backdrop.style.display = 'none';
    document.removeEventListener('keydown', flowModalEscapeHandler);
    if (typeof clearFlowSelection === 'function') clearFlowSelection();
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function render(container, flowData, width, height, rels, extensions) {
    if (!flowData || !flowData.nodes.length) {
      container.innerHTML = '<div class="flow-empty">No flow data. Load a property from the main page first.</div>';
      return;
    }

    var nodes = flowData.nodes;
    var links = flowData.links;
    var nodeById = flowData.nodeById;

    var padding = { top: VERT_PADDING, right: HORIZ_PADDING, bottom: VERT_PADDING, left: HORIZ_PADDING };
    var chartWidth = width - padding.left - padding.right;
    var colWidth = (chartWidth - 2 * COLUMN_GAP) / 3;

    var col0X = padding.left;
    var col1X = padding.left + colWidth + COLUMN_GAP;
    var col2X = padding.left + 2 * (colWidth + COLUMN_GAP);

    var cols = [[], [], []];
    nodes.forEach(function (n) {
      cols[n.column].push(n);
    });
    cols.forEach(function (col, c) {
      var x = c === 0 ? col0X : c === 1 ? col1X : col2X;
      col.forEach(function (n, i) {
        n.x = x;
        n.y = padding.top + i * (NODE_HEIGHT + NODE_GAP);
        n.width = NODE_WIDTH;
        n.height = NODE_HEIGHT;
      });
    });

    var maxVal = 1;
    links.forEach(function (l) {
      if (l.value > maxVal) maxVal = l.value;
    });
    var strokeScale = d3.scaleLinear().domain([0, maxVal]).range([3, 20]).clamp(true);

    container.innerHTML = '';
    var svg = d3.select(container).append('svg').attr('width', width).attr('height', height);

    var g = svg.append('g');
    var selectedNodeId = null;

    function getConnectedSet(id) {
      var set = {};
      if (!id) return set;
      set[id] = true;
      links.forEach(function (l) {
        if (l.source === id || l.target === id) {
          set[l.source] = true;
          set[l.target] = true;
        }
      });
      return set;
    }

    function applySelection() {
      var connected = getConnectedSet(selectedNodeId);
      g.selectAll('.flow-node').each(function () {
        var id = this.getAttribute('data-node-id');
        var dim = selectedNodeId && !connected[id];
        var sel = id === selectedNodeId;
        d3.select(this).classed('dimmed', dim).classed('selected', sel);
      });
      g.selectAll('.flow-link').each(function () {
        var src = this.getAttribute('data-source');
        var tgt = this.getAttribute('data-target');
        var dim = selectedNodeId && (!connected[src] && !connected[tgt]);
        d3.select(this).classed('dimmed', dim);
      });
    }

    function clearSelection() {
      selectedNodeId = null;
      applySelection();
    }

    g.append('rect')
      .attr('class', 'flow-bg')
      .attr('x', 0).attr('y', 0).attr('width', width).attr('height', height)
      .attr('fill', 'transparent')
      .style('cursor', 'default')
      .on('click', clearSelection);

    var colBandWidth = colWidth + COLUMN_GAP;
    [col0X, col1X, col2X].forEach(function (cx) {
      g.append('rect')
        .attr('class', 'flow-column-bg')
        .attr('x', cx)
        .attr('y', padding.top)
        .attr('width', colWidth)
        .attr('height', height - padding.top - padding.bottom);
    });

    var div1 = (col0X + colWidth);
    var div2 = (col1X + colWidth);
    g.append('line').attr('class', 'flow-column-divider').attr('x1', div1).attr('y1', padding.top).attr('x2', div1).attr('y2', height - padding.bottom);
    g.append('line').attr('class', 'flow-column-divider').attr('x1', div2).attr('y1', padding.top).attr('x2', div2).attr('y2', height - padding.bottom);

    var linkGroup = g.append('g').attr('class', 'flow-links');
    function linkPath(src, tgt) {
      var x0 = src.x + src.width;
      var y0 = src.y + src.height / 2;
      var x1 = tgt.x;
      var y1 = tgt.y + tgt.height / 2;
      var dx = (x1 - x0) * 0.4;
      return 'M' + x0 + ',' + y0 + ' C' + (x0 + dx) + ',' + y0 + ' ' + (x1 - dx) + ',' + y1 + ' ' + x1 + ',' + y1;
    }

    links.forEach(function (link) {
      var src = nodeById[link.source];
      var tgt = nodeById[link.target];
      if (!src || !tgt) return;
      var stroke = strokeScale(link.value);
      linkGroup.append('path')
        .attr('d', linkPath(src, tgt))
        .attr('class', 'flow-link')
        .attr('data-source', link.source)
        .attr('data-target', link.target)
        .attr('stroke', '#64748b')
        .attr('stroke-width', stroke)
        .attr('stroke-linecap', 'round')
        .attr('fill', 'none')
        .attr('data-label', link.label)
        .on('mouseover', function () {
          var label = link.label;
          var tip = document.getElementById('flowTooltip');
          if (tip) {
            tip.textContent = label + ' (' + link.value + ')';
            tip.style.display = 'block';
          }
        })
        .on('mouseout', function () {
          var tip = document.getElementById('flowTooltip');
          if (tip) tip.style.display = 'none';
        });
    });

    var nodeGroup = g.append('g').attr('class', 'flow-nodes');
    nodes.forEach(function (n) {
      var nodeClass = n.type === 'de' ? 'de-node' : n.type === 'rule' ? 'rule-node' : 'ext-node';
      var gr = nodeGroup.append('g').attr('class', 'flow-node ' + nodeClass).attr('data-node-id', n.id).attr('transform', 'translate(' + n.x + ',' + n.y + ')');
      gr.append('rect')
        .attr('class', 'flow-node-hit')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', colBandWidth)
        .attr('height', n.height)
        .attr('fill', 'transparent');
      gr.append('rect').attr('class', 'flow-node-pill').attr('width', n.width).attr('height', n.height);
      gr.append('text')
        .attr('class', 'flow-node-label')
        .attr('x', n.width + 8)
        .attr('y', n.height / 2)
        .attr('dy', '0.35em')
        .text(n.name.length > 28 ? n.name.substring(0, 26) + '…' : n.name);
      gr.style('cursor', 'pointer').on('click', function (e) {
        e.stopPropagation();
        selectedNodeId = n.id;
        applySelection();
        showNodeConnectionsModal(n, rels || {}, extensions || {});
      });
    });

    var colLabels = ['Data Elements', 'Rules', 'Extensions'];
    [col0X, col1X, col2X].forEach(function (x, i) {
      g.append('text').attr('class', 'flow-column-label').attr('x', x).attr('y', padding.top - 10).attr('text-anchor', 'start').text(colLabels[i]);
    });

    window.clearFlowSelection = clearSelection;
  }

  function run() {
    var loader = document.getElementById('flowLoader');
    var container = document.getElementById('flowChart');
    var searchInput = document.getElementById('flowSearch');
    var searchList = document.getElementById('flowSearchList');
    var clearBtn = document.getElementById('flowSearchClear');

    if (!container) return;

    var rulesArray = getRulesArray();
    var dataElements = getDataElements();
    var extensions = getExtensions();

    loader.style.display = 'none';

    if (!rulesArray.length && !Object.keys(dataElements).length) {
      container.innerHTML = '<div class="flow-empty">No data found. Please load a website from the main page first.</div>';
      return;
    }

    var rels = buildRelationships(rulesArray, dataElements, extensions);

    var optionsList = [];
    Object.keys(rels.dataElementToRule).sort().forEach(function (name) {
      optionsList.push({ value: '[Data Element] ' + name, type: 'de', key: name });
    });
    Object.keys(rels.ruleToDataElement).sort().forEach(function (name) {
      optionsList.push({ value: '[Rule] ' + name, type: 'rule', key: name });
    });
    Object.keys(rels.extensionToRule).sort().forEach(function (extId) {
      var disp = (extensions[extId] && extensions[extId].displayName) ? extensions[extId].displayName : extId;
      optionsList.push({ value: '[Extension] ' + disp, type: 'ext', key: extId });
    });

    if (searchList) {
      optionsList.forEach(function (opt) {
        var op = document.createElement('option');
        op.value = opt.value;
        searchList.appendChild(op);
      });
    }

    var tooltip = document.createElement('div');
    tooltip.id = 'flowTooltip';
    tooltip.style.cssText = 'position:fixed;display:none;background:#333;color:#fff;padding:6px 10px;border-radius:4px;font-size:12px;z-index:9999;pointer-events:none;';
    document.body.appendChild(tooltip);

    function updateTooltipPosition(e) {
      var t = document.getElementById('flowTooltip');
      if (t && t.style.display === 'block') {
        t.style.left = (e.pageX + 10) + 'px';
        t.style.top = (e.pageY + 10) + 'px';
      }
    }
    document.addEventListener('mousemove', updateTooltipPosition);

    function findSelection() {
      var val = (searchInput && searchInput.value) ? searchInput.value.trim() : '';
      if (!val) return null;
      return optionsList.filter(function (o) { return o.value === val; })[0] || null;
    }

    function redraw() {
      var sel = findSelection();
      var flowData;
      if (!sel) {
        flowData = { nodes: [], links: [], nodeById: {} };
      } else {
        flowData = buildFlowDataForSelection(rels, extensions, sel.type, sel.key);
      }
      var w = Math.max(container.clientWidth || 900, container.getBoundingClientRect().width || 900);
      var h = Math.max(400, (flowData.nodes.length ? Math.max(flowData.nodes.filter(function (n) { return n.column === 0; }).length, flowData.nodes.filter(function (n) { return n.column === 1; }).length, flowData.nodes.filter(function (n) { return n.column === 2; }).length) * (NODE_HEIGHT + NODE_GAP) + VERT_PADDING * 2 + 24 : 400));
      if (!flowData.nodes.length) {
        container.innerHTML = '<div class="flow-empty">Type or select a data element, rule, or extension above to see its flow.</div>';
      } else {
        render(container, flowData, w, h, rels, extensions);
      }
      if (clearBtn) clearBtn.style.display = sel ? 'inline-block' : 'none';
    }

    var closeBtn = document.getElementById('flowNodeModalClose');
    if (closeBtn) closeBtn.addEventListener('click', closeFlowNodeModal);
    document.getElementById('flowNodeModal').addEventListener('click', function (e) {
      if (e.target === this) closeFlowNodeModal();
    });

    redraw();
    if (searchInput) {
      searchInput.addEventListener('input', redraw);
      searchInput.addEventListener('change', redraw);
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (searchInput) searchInput.value = '';
        redraw();
        searchInput.focus();
      });
    }
    window.addEventListener('resize', function () {
      var sel = findSelection();
      if (sel) redraw();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
