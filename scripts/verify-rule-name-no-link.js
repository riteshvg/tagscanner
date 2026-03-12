#!/usr/bin/env node
/**
 * Unit test: verify rule.js does not add any <a> link in the rule name cell.
 * Run: node scripts/verify-rule-name-no-link.js
 */
const fs = require('fs');
const path = require('path');

const ruleJsPath = path.join(__dirname, '..', 'vendor', 'rule.js');
const content = fs.readFileSync(ruleJsPath, 'utf8');

// Section that builds the rule name cell (between "Rule Name with chevron" and "Rule Event(s)")
const ruleNameSectionStart = content.indexOf('// Rule Name with chevron');
const ruleNameSectionEnd = content.indexOf('// Rule Event(s) – icon only');
if (ruleNameSectionStart === -1 || ruleNameSectionEnd === -1) {
  console.error('Could not find rule name section in rule.js');
  process.exit(1);
}
const ruleNameSection = content.slice(ruleNameSectionStart, ruleNameSectionEnd);

const hasCreateElementA = /createElement\s*\(\s*['"]a['"]\s*\)/.test(ruleNameSection);
const hasDotHref = /\.href\s*=/.test(ruleNameSection);
const hasAnchorTag = /<a\s|<\/a>/.test(ruleNameSection);
const hasRuleNameCell = ruleNameSection.includes('rule-name-cell');
const hasTdName = ruleNameSection.includes('tdName');

let failed = 0;
if (hasCreateElementA) {
  console.error('FAIL: Rule name section contains createElement("a")');
  failed++;
}
if (hasDotHref) {
  console.error('FAIL: Rule name section contains .href =');
  failed++;
}
if (hasAnchorTag) {
  console.error('FAIL: Rule name section contains <a> tag');
  failed++;
}
if (!hasRuleNameCell) {
  console.error('FAIL: Rule name section should use class rule-name-cell');
  failed++;
}
if (!hasTdName) {
  console.error('FAIL: Rule name section should use tdName cell');
  failed++;
}

if (failed > 0) {
  process.exit(1);
}
console.log('PASS: rule.js rule name cell has no link (no <a>, no .href)');
process.exit(0);
