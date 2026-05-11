const fs = require('fs');
global.localStorage = { getItem: () => "null", setItem: () => null, removeItem: () => null };
global.document = { querySelector: () => ({ classList: { add: () => null, remove: () => null }, addEventListener: () => null }), querySelectorAll: () => [], addEventListener: () => null };
global.window = { addEventListener: () => null, setInterval: () => null, clearInterval: () => null };
const code = fs.readFileSync('app.js', 'utf8');
eval(code);

loadAdminSettings();
applyDynamicAmounts();

paidLogsCache = { 'ianka': { 'max:2026-05-09': 'true' } };
console.log("formatDateKey returned:", formatDateKey(new Date('2026-05-10T00:00:00.000Z')));

['andre', 'isabela', 'ianka', 'sarha'].forEach(p => {
    console.log(p, getNextPayment('max', p));
});
