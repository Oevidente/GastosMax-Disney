const SETTINGS = {
  dueDay: 10,
  upcomingPaymentLimit: 6,
  calendarMonthsAhead: 24,
  calendarEventHour: 9,
  calendarTimeZone: 'America/Fortaleza',
  reminderDaysBefore: 3,
  refreshMinutes: 30,
  maxRotationStartMonth: 5,
  maxRotation: ['sarha', 'andre', 'isabela', 'ianka'],
};

const SERVICES = {
  max: {
    name: 'HBO Max',
    shortName: 'M',
    cssClass: 'service-max',
    model: 'rotation',
    modelLabel: 'Rodízio',
    totalAmount: 22.45,
    participants: ['andre', 'isabela', 'ianka', 'sarha'],
    amount: 22.45,
  },
  disney: {
    participants: ['andre']
  }
};

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getToday() {
  return new Date('2026-05-11T19:25:26Z');
}

function createPaymentDate(year, monthIndex) {
  return new Date(year, monthIndex, SETTINGS.dueDay);
}

function isPaymentPaid(personKey, payment) {
  return false;
}

function personPaysInMonth(serviceKey, personKey, monthIndex) {
  const service = SERVICES[serviceKey];
  if (!service.participants.includes(personKey)) {
    return false;
  }
  if (service.model === 'monthly') {
    return true;
  }
  const rotationPayer = getRotationPayer(serviceKey, monthIndex);
  return rotationPayer === personKey;
}

function getRotationPayer(serviceKey, monthIndex) {
  const service = SERVICES[serviceKey];
  let rotation = service.participants || [];
  if (serviceKey === 'max') {
    rotation = SETTINGS.maxRotation;
  }
  if (rotation.length === 0) return null;
  const offset = monthIndex - SETTINGS.maxRotationStartMonth;
  const rotationIndex =
    ((offset % rotation.length) + rotation.length) % rotation.length;
  return rotation[rotationIndex];
}

function getUpcomingPaymentsForPerson(serviceKey, personKey, limit) {
  const today = startOfDay(getToday());
  const payments = [];
  const startYear = today.getFullYear();
  const startMonth = today.getMonth() - 2;
  const systemStart = new Date(2026, 4, 1);

  for (let offset = 0; offset < 120 && payments.length < limit; offset += 1) {
    const monthIndex = startMonth + offset;
    const year = startYear + Math.floor(monthIndex / 12);
    const normalizedMonth = ((monthIndex % 12) + 12) % 12;
    const date = createPaymentDate(year, normalizedMonth);

    if (date < systemStart) {
      continue;
    }

    const isFuture = date >= today;
    const paid = isPaymentPaid(personKey, { serviceKey, date });

    if (!isFuture && paid) {
      continue;
    }

    if (personPaysInMonth(serviceKey, personKey, normalizedMonth)) {
      payments.push({
        serviceKey,
        date,
        amount: SERVICES[serviceKey].amount,
      });
    }
  }

  return payments;
}

console.log("andre max", getUpcomingPaymentsForPerson('max', 'andre', 6));
console.log("isabela max", getUpcomingPaymentsForPerson('max', 'isabela', 6));
console.log("andre disney", getUpcomingPaymentsForPerson('disney', 'andre', 6));
