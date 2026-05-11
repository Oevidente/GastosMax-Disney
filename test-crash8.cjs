const fs = require('fs');
global.localStorage = { getItem: () => "null", setItem: () => null, removeItem: () => null };
global.document = { querySelector: () => ({ classList: { add: () => null, remove: () => null }, addEventListener: () => null }), querySelectorAll: () => [], addEventListener: () => null };
global.window = { addEventListener: () => null, setInterval: () => null, clearInterval: () => null };
const code = fs.readFileSync('app.js', 'utf8');
eval(code);

loadAdminSettings();
applyDynamicAmounts();

paidLogsCache = { 'ianka': { 'max:2026-05-10': 'true' } };

console.log("isPaymentPaid: ", isPaymentPaid('ianka', { serviceKey: 'max', date: new Date('2026-05-10T00:00:00Z') }));

console.log("Ianka date:", getNextPayment('max', 'ianka'));
