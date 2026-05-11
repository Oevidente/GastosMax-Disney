const fs = require('fs');
global.localStorage = { getItem: () => "null", setItem: () => null, removeItem: () => null };
global.document = { querySelector: () => ({ classList: { add: () => null, remove: () => null }, addEventListener: () => null }), querySelectorAll: () => [], addEventListener: () => null };
global.window = { addEventListener: () => null, setInterval: () => null, clearInterval: () => null };
const code = fs.readFileSync('app.js', 'utf8');
eval(code);

try {
  loadAdminSettings();
  applyDynamicAmounts();
  
  console.log("andre NEXT:");
  console.log(getNextPayment('max', 'andre'));
  console.log("andre ALL 6:");
  console.log(getUpcomingPaymentsForPerson('max', 'andre', 6));
  
  console.log("isabela NEXT:");
  console.log(getNextPayment('max', 'isabela'));
  console.log("ianka NEXT:");
  console.log(getNextPayment('max', 'ianka'));
  console.log("sarha NEXT:");
  console.log(getNextPayment('max', 'sarha'));

} catch (e) {
  console.error("Crash detected!", e);
}
