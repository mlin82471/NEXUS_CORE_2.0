const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const files = [
  'types.ts',
  'components/DAGTopology.tsx',
  'components/DAGStudio.tsx',
  'components/TaskWorkspace.tsx',
  'components/BenchmarkCenter.tsx',
  'components/EvolutionPanel.tsx',
  'components/MemoryInspector.tsx',
  'components/AgentMatrix.tsx',
  'components/DashboardOverview.tsx',
  'components/AgentCenter.tsx',
  'components/ModelCenter.tsx',
  'components/UsageCenter.tsx',
  'App.tsx'
];

let fullCode = `
const { useState, useEffect, useRef } = React;
const API_BASE = typeof window !== 'undefined' && window.location.origin.startsWith('http') ? '' : 'http://127.0.0.1:8000';
`;

files.forEach(f => {
  let content = fs.readFileSync(path.join(srcDir, f), 'utf8');
  // Remove import lines (single line and multi-line)
  content = content.replace(/import\s+[\s\S]*?from\s+['"].*?['"];?/g, '');
  // Remove duplicate const API_BASE = ...
  content = content.replace(/const\s+API_BASE\s*=[\s\S]*?;/g, '');
  // Remove export default statements
  content = content.replace(/^export\s+default\s+.*?;/gm, '');
  // Remove export keywords
  content = content.replace(/^export\s+(const|type|interface)\s+/gm, '$1 ');
  fullCode += '\n// ===== ' + f + ' =====\n' + content + '\n';
});

fullCode += `
// Mount React root
const container = document.getElementById('root');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(React.createElement(App, null));
}
`;

const m = { exports: {} };
const fn = new Function('module', 'exports', fs.readFileSync(path.join(__dirname, 'public', 'babel.min.js'), 'utf8'));
fn(m, m.exports);
const Babel = m.exports;

console.log('Transpiling React + TypeScript components into bundle.js...');
const res = Babel.transform(fullCode, {
  filename: 'bundle.tsx',
  presets: ['react', 'typescript']
});

const outPath = path.join(__dirname, 'public', 'bundle.js');
fs.writeFileSync(outPath, res.code, 'utf8');
console.log('Build completed successfully! Wrote bundle.js:', res.code.length, 'bytes');
