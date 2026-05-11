const fs = require('fs');
global.localStorage = { getItem: () => "null", setItem: () => null, removeItem: () => null };
global.document = { querySelector: () => ({ classList: { add: () => null, remove: () => null }, addEventListener: () => null }), querySelectorAll: () => [], addEventListener: () => null };
global.window = { addEventListener: () => null, setInterval: () => null, clearInterval: () => null };
// global.Intl = require('intl'); // Node has Intl
const code = fs.readFileSync('app.js', 'utf8');
eval(code);

try {
  loadAdminSettings(); // Populates defaults
  applyDynamicAmounts(); // Populates amounts
  
  console.log("Testing createSubscriptionCard...");
  console.log(createSubscriptionCard('disney', 'andre'));
  console.log("Testing renderUpcomingPayments...");
  renderUpcomingPayments('disney', 'andre');
  console.log("Testing next payment for MAX...");
  console.log(getNextPayment('max', 'andre'));
  console.log(getUpcomingPaymentsForPerson('max', 'andre', 6));
  console.log("Testing renderFullSheet(disney)...");
  renderFullSheet('disney');
  console.log("Testing renderFullSheet(max)...");
  renderFullSheet('max');
  console.log("No crash!");
} catch (e) {
  console.error("Crash detected!", e);
}
