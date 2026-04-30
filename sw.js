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
