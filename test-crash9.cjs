const fs = require('fs');
global.localStorage = { getItem: () => "{\"ianka\": {\"max:2026-05-10\": \"true\"}}", setItem: () => null, removeItem: () => null };
global.document = { querySelector: () => ({ classList: { add: () => null, remove: () => null }, addEventListener: () => null }), querySelectorAll: () => [], addEventListener: () => null };
global.window = { addEventListener: () => null, setInterval: () => null, clearInterval: () => null };
const code = fs.readFileSync('app.js', 'utf8');
eval(code);

loadAdminSettings();
applyDynamicAmounts();

console.log("Ianka date:", getNextPayment('max', 'ianka'));
