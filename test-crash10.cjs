const fs = require('fs');
global.localStorage = { getItem: () => "null", setItem: () => null, removeItem: () => null };
global.document = { querySelector: () => ({ classList: { add: () => null, remove: () => null }, addEventListener: () => null }), querySelectorAll: () => [], addEventListener: () => null };
global.window = { addEventListener: () => null, setInterval: () => null, clearInterval: () => null };
const code = fs.readFileSync('app.js', 'utf8');
eval(code);
loadAdminSettings();
applyDynamicAmounts();

// Simulate we are in 2026
global.getToday = function() {
    return new Date('2026-05-11T12:00:00Z');
};
console.log("In 2026, who pays in June 2026?");
for (let offset=0; offset<12; offset++) {
    const today = startOfDay(getToday());
    const startYear = today.getFullYear();
    const startMonth = today.getMonth() - 2;
    const monthIndex = startMonth + offset;
    const yr = startYear + Math.floor(monthIndex / 12);
    const mo = ((monthIndex % 12) + 12) % 12;
    if (yr === 2026 && mo === 5) {
        console.log("Payer:", getRotationPayer('max', monthIndex));
    }
}

// Simulate we are in 2027
global.getToday = function() {
    return new Date('2027-05-11T12:00:00Z');
};
console.log("In 2027, who pays in June 2026 (if we looked back)?");
for (let offset= -12; offset<12; offset++) {
    const today = startOfDay(getToday());
    const startYear = today.getFullYear();
    const startMonth = today.getMonth() - 2;
    const monthIndex = startMonth + offset;
    const yr = startYear + Math.floor(monthIndex / 12);
    const mo = ((monthIndex % 12) + 12) % 12;
    if (yr === 2026 && mo === 5) {
        console.log("Payer:", getRotationPayer('max', monthIndex));
    }
}
