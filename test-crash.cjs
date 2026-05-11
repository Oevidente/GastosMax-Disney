const fs = require('fs');
eval(fs.readFileSync('app.js', 'utf8').replace(/document\./g, '//').replace(/window\./g, '//').replace(/localStorage/g, '{}'));

try {
  console.log("Testing createSubscriptionCard...");
  createSubscriptionCard('disney', 'andre');
  console.log("Testing renderUpcomingPayments...");
  renderUpcomingPayments('disney', 'andre');
  console.log("No crash!");
} catch (e) {
  console.error("Crash detected!", e);
}
