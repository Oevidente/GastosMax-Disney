self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        const visibleClient = clientList.find((client) => "focus" in client);

        if (visibleClient) {
          return visibleClient.focus();
        }

        if (clients.openWindow) {
          return clients.openWindow("./");
        }

        return undefined;
      })
  );
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "check-payments") {
    event.waitUntil(checkPaymentRemindersSW());
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "FORCE_SYNC") {
    event.waitUntil(checkPaymentRemindersSW());
  }
});

async function checkPaymentRemindersSW() {
  try {
    const cache = await caches.open("payment-reminders-data");
    const response = await cache.match("/reminders.json");
    if (!response) return;

    const data = await response.json();
    if (!data || !data.candidates) return;

    let updatedLogs = false;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const msPerDay = 24 * 60 * 60 * 1000;

    const remindersToProcess = data.candidates.map(payment => {
       const daysUntil = Math.ceil((payment.dateMs - startOfToday) / msPerDay);
       return { ...payment, daysUntil };
    }).filter(payment => {
       const reminderKey = `${payment.baseKey}:remind-${payment.daysUntil}`;
       return payment.daysUntil >= 0 && 
              payment.daysUntil <= (data.settings.reminderDaysBefore || 3) && 
              !data.paidLogs[payment.baseKey] && 
              !data.logs[reminderKey];
    });

    if (remindersToProcess.length === 0) return;

    const groupedReminders = {};
    for (const payment of remindersToProcess) {
       const d = new Date(payment.dateMs);
       const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
       if (!groupedReminders[dateKey]) {
          groupedReminders[dateKey] = {
             payments: [],
             daysUntil: payment.daysUntil,
             dateKey: dateKey
          };
       }
       groupedReminders[dateKey].payments.push(payment);
    }

    for (const dateKey in groupedReminders) {
       const group = groupedReminders[dateKey];
       const serviceNames = group.payments.map(p => p.serviceName).join(', ');
       const whenPlural = group.daysUntil === 0 ? "vencem hoje" : `vencem em ${group.daysUntil} ${group.daysUntil === 1 ? 'dia' : 'dias'}`;
       const whenSingular = group.daysUntil === 0 ? "vence hoje" : `vence em ${group.daysUntil} ${group.daysUntil === 1 ? 'dia' : 'dias'}`;

       const title = group.payments.length === 1
         ? `${serviceNames}: pagamento ${whenSingular}`
         : `Assinaturas: pagamentos ${whenPlural}`;
         
       let body = '';
       if (group.payments.length === 1) {
          body = `${data.personName}, a sua assinatura ${serviceNames} ${whenSingular}. Clique para ver as assinaturas no site.`;
       } else {
          body = `${data.personName}, as suas assinaturas ${serviceNames} ${whenPlural}. Clique para ver as assinaturas no site.`;
       }

       const tag = `group-reminder:${data.personKey}:${group.dateKey}:remind-${group.daysUntil}`;

       await self.registration.showNotification(title, {
          body,
          tag,
          renotify: false
       });

       for (const payment of group.payments) {
          data.logs[`${payment.baseKey}:remind-${group.daysUntil}`] = new Date().toISOString();
       }
       updatedLogs = true;
    }

    if (updatedLogs) {
      await cache.put("/reminders.json", new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" }
      }));
    }
  } catch (err) {
    console.error("SW Background check failed", err);
  }
}
