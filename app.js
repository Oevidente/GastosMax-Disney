const SETTINGS = {
  dueDay: 10,
  upcomingPaymentLimit: 6,
  calendarMonthsAhead: 24,
  calendarEventHour: 9,
  calendarTimeZone: "America/Fortaleza",
  reminderDaysBefore: 3,
  refreshMinutes: 30,
  maxRotationStartMonth: 5,
  maxRotation: ["sarha", "andre", "isabela", "ianka"],
};

const PEOPLE = {
  andre: {
    name: "André",
    aliases: ["andre", "andré"],
    subscriptions: ["disney", "max"],
  },
  isabela: {
    name: "Isabela",
    aliases: ["isabela"],
    subscriptions: ["disney", "max"],
  },
  ianka: {
    name: "Ianka",
    aliases: ["ianka"],
    subscriptions: ["disney", "max"],
  },
  sarha: {
    name: "Sarha",
    aliases: ["sarha"],
    subscriptions: ["max"],
  },
};

const SERVICES = {
  disney: {
    name: "Disney+",
    shortName: "D+",
    cssClass: "service-disney",
    model: "monthly",
    modelLabel: "Todo mês",
    amount: 22.31,
    participants: ["andre", "isabela", "ianka"],
  },
  max: {
    name: "HBO Max",
    shortName: "M",
    cssClass: "service-max",
    model: "rotation",
    modelLabel: "Rodízio",
    amount: 22.45,
    participants: ["andre", "isabela", "ianka", "sarha"],
  },
};

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const STORAGE_KEYS = {
  profile: "streaming-payments-profile-v2",
  notifications: "streaming-payments-notifications-v2",
  theme: "streaming-payments-theme",
};

const state = {
  currentPersonKey: null,
  selectedServiceKey: null,
  selectedYear: getToday().getFullYear(),
};

let refreshIntervalId = null;
let reminderCheckInProgress = false;
let serviceWorkerRegistrationPromise = null;

const profileScreen = document.querySelector("#profileScreen");
const dashboard = document.querySelector("#dashboard");
const profileForm = document.querySelector("#profileForm");
const profileNameInput = document.querySelector("#profileNameInput");
const profileMessage = document.querySelector("#profileMessage");
const themeButton = document.querySelector("#themeButton");
const notificationButton = document.querySelector("#notificationButton");
const notificationStatus = document.querySelector("#notificationStatus");
const changeProfileButton = document.querySelector("#changeProfileButton");
const personName = document.querySelector("#personName");
const summaryCount = document.querySelector("#summaryCount");
const summaryLabel = document.querySelector("#summaryLabel");
const subscriptionList = document.querySelector("#subscriptionList");
const detailsPanel = document.querySelector("#detailsPanel");
const detailsService = document.querySelector("#detailsService");
const detailsTitle = document.querySelector("#detailsTitle");
const upcomingPanel = document.querySelector("#upcomingPanel");
const fullPanel = document.querySelector("#fullPanel");
const closeDetailsButton = document.querySelector("#closeDetailsButton");
const tabButtons = document.querySelectorAll(".tab-button");
const yearControls = document.querySelector("#yearControls");
const previousYearButton = document.querySelector("#previousYearButton");
const nextYearButton = document.querySelector("#nextYearButton");
const selectedYearLabel = document.querySelector("#selectedYearLabel");

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

initTheme();
bindEvents();
restoreProfile();

function bindEvents() {
  profileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleProfileSubmit();
  });

  themeButton.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    saveTheme(nextTheme);
  });

  notificationButton.addEventListener("click", () => {
    void requestNotificationAccess();
  });

  upcomingPanel.addEventListener("click", (event) => {
    const testButton = event.target.closest("[data-test-notification]");
    const calendarButton = event.target.closest("[data-add-calendar]");

    if (testButton) {
      void showTestNotification();
    }

    if (calendarButton) {
      openGoogleCalendarEvent();
    }
  });

  changeProfileButton.addEventListener("click", changeProfile);

  closeDetailsButton.addEventListener("click", () => {
    state.selectedServiceKey = null;
    detailsPanel.classList.add("is-hidden");
    document
      .querySelectorAll(".subscription-card")
      .forEach((card) => card.classList.remove("is-selected"));
  });

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.panel);
    });
  });

  previousYearButton.addEventListener("click", () => {
    const currentYear = getToday().getFullYear();

    if (state.selectedYear <= currentYear) {
      return;
    }

    state.selectedYear -= 1;
    renderDetails();
  });

  nextYearButton.addEventListener("click", () => {
    state.selectedYear += 1;
    renderDetails();
  });

  window.addEventListener("focus", () => {
    refreshCurrentDates();
    void checkPaymentReminders();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refreshCurrentDates();
      void checkPaymentReminders();
    }
  });
}

async function handleProfileSubmit() {
  const personKey = findPersonKey(profileNameInput.value);
  profileMessage.textContent = "";

  if (!personKey) {
    profileMessage.textContent = getNameError(profileNameInput.value);
    profileNameInput.focus();
    return;
  }

  saveProfile(personKey);
  openDashboard(personKey);
}

function restoreProfile() {
  const personKey = getSavedProfile();

  updateNotificationButton();

  if (!personKey || !PEOPLE[personKey]) {
    profileScreen.classList.remove("is-hidden");
    dashboard.classList.add("is-hidden");
    notificationButton.classList.add("is-hidden");
    changeProfileButton.classList.add("is-hidden");
    return;
  }

  openDashboard(personKey);
}

function changeProfile() {
  clearProfile();
  stopSessionLoops();
  state.currentPersonKey = null;
  state.selectedServiceKey = null;
  state.selectedYear = getToday().getFullYear();
  dashboard.classList.add("is-hidden");
  detailsPanel.classList.add("is-hidden");
  notificationButton.classList.add("is-hidden");
  changeProfileButton.classList.add("is-hidden");
  yearControls.classList.add("is-hidden");
  profileScreen.classList.remove("is-hidden");
  profileNameInput.value = "";
  profileMessage.textContent = "";
  profileNameInput.focus();
}

function openDashboard(personKey) {
  const person = PEOPLE[personKey];
  state.currentPersonKey = personKey;
  state.selectedServiceKey = null;
  state.selectedYear = getToday().getFullYear();

  personName.textContent = person.name;
  summaryCount.textContent = person.subscriptions.length;
  summaryLabel.textContent = person.subscriptions.length === 1 ? "assinatura" : "assinaturas";
  profileScreen.classList.add("is-hidden");
  dashboard.classList.remove("is-hidden");
  changeProfileButton.classList.remove("is-hidden");
  detailsPanel.classList.add("is-hidden");
  renderSubscriptionCards(personKey);
  updateNotificationButton();
  updateNotificationStatus();
  startSessionLoops();
  void checkPaymentReminders();
}

function renderSubscriptionCards(personKey) {
  const person = PEOPLE[personKey];
  const sortedServices = [...person.subscriptions].sort((a, b) =>
    SERVICES[a].name.localeCompare(SERVICES[b].name, "pt-BR")
  );

  subscriptionList.innerHTML = sortedServices
    .map((serviceKey) => createSubscriptionCard(serviceKey, personKey))
    .join("");

  subscriptionList.querySelectorAll(".subscription-card").forEach((card) => {
    card.addEventListener("click", () => openServiceDetails(card.dataset.service));
  });
}

function createSubscriptionCard(serviceKey, personKey) {
  const service = SERVICES[serviceKey];
  const nextPayment = getNextPayment(serviceKey, personKey);
  const dateText = nextPayment ? formatShortDate(nextPayment.date) : "Sem data restante";
  const amountText = moneyFormatter.format(service.amount);

  return `
    <button class="subscription-card ${service.cssClass}" type="button" data-service="${serviceKey}">
      <span class="subscription-top">
        <span class="subscription-title">
          <span class="service-symbol">${service.shortName}</span>
          <strong>${service.name}</strong>
        </span>
        <span class="share-type">${service.modelLabel}</span>
      </span>

      <span class="payment-line">
        <span>
          <span>Próxima data</span>
          <strong>${dateText}</strong>
        </span>
        <span>
          <span>Valor</span>
          <strong>${amountText}</strong>
        </span>
      </span>
    </button>
  `;
}

function openServiceDetails(serviceKey) {
  state.selectedServiceKey = serviceKey;
  const service = SERVICES[serviceKey];
  const person = PEOPLE[state.currentPersonKey];
  state.selectedYear = getToday().getFullYear();

  document.querySelectorAll(".subscription-card").forEach((card) => {
    card.classList.toggle("is-selected", card.dataset.service === serviceKey);
  });

  detailsService.textContent = service.name;
  detailsTitle.textContent = `${person.name}, estes são os pagamentos dessa assinatura`;
  detailsPanel.classList.remove("is-hidden");
  setActiveTab("upcoming");
  renderDetails();
  detailsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderDetails() {
  if (!state.selectedServiceKey || !state.currentPersonKey) {
    return;
  }

  upcomingPanel.innerHTML = renderUpcomingPayments(
    state.selectedServiceKey,
    state.currentPersonKey
  );
  fullPanel.innerHTML = renderFullSheet(state.selectedServiceKey);
  updateYearControls();
}

function renderUpcomingPayments(serviceKey, personKey) {
  const payments = getUpcomingPaymentsForPerson(
    serviceKey,
    personKey,
    SETTINGS.upcomingPaymentLimit
  );

  if (!payments.length) {
    return `
      <div class="empty-state">
        <strong>Nenhuma parcela futura encontrada.</strong>
        <span>Confira se essa pessoa ainda participa dessa assinatura.</span>
      </div>
    `;
  }

  return `
    <div class="panel-actions">
      <button class="ghost-button" type="button" data-add-calendar>
        Abrir no Google Agenda
      </button>
      <button class="ghost-button" type="button" data-test-notification>
        Testar notificação
      </button>
    </div>
    <ul class="payment-list">
      ${payments
        .map(
          (payment) => `
            <li class="payment-item">
              <span>
                <strong>${capitalize(MONTHS[payment.date.getMonth()])}</strong>
                <span>${formatLongDate(payment.date)}</span>
              </span>
              <span class="amount">${moneyFormatter.format(payment.amount)}</span>
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

function renderFullSheet(serviceKey) {
  const service = SERVICES[serviceKey];
  const year = state.selectedYear;

  if (service.model === "monthly") {
    return renderMonthlySheet(serviceKey, year);
  }

  return renderRotationSheet(serviceKey, year);
}

function renderMonthlySheet(serviceKey, year) {
  const service = SERVICES[serviceKey];
  const participantHeaders = service.participants
    .map((personKey) => `<th>${PEOPLE[personKey].name}</th>`)
    .join("");

  const rows = getYearMonths(year)
    .map((date) => {
      const status = getDateStatus(date);
      return `
        <tr>
          <td>${capitalize(MONTHS[date.getMonth()])}</td>
          <td>${formatLongDate(date)}</td>
          ${service.participants
            .map(() => `<td>${moneyFormatter.format(service.amount)}</td>`)
            .join("")}
          <td><span class="status-pill">${status}</span></td>
        </tr>
      `;
    })
    .join("");

  return `
    <table class="sheet-table">
      <thead>
        <tr>
          <th>Mês</th>
          <th>Data</th>
          ${participantHeaders}
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderRotationSheet(serviceKey, year) {
  const rows = getYearMonths(year)
    .map((date) => {
      const payerKey = getRotationPayer(date.getMonth());
      return `
        <tr>
          <td>${capitalize(MONTHS[date.getMonth()])}</td>
          <td>${formatLongDate(date)}</td>
          <td>${PEOPLE[payerKey].name}</td>
          <td>${moneyFormatter.format(SERVICES[serviceKey].amount)}</td>
          <td><span class="status-pill">${getDateStatus(date)}</span></td>
        </tr>
      `;
    })
    .join("");

  return `
    <table class="sheet-table">
      <thead>
        <tr>
          <th>Mês</th>
          <th>Data</th>
          <th>Responsável</th>
          <th>Valor</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function getNextPayment(serviceKey, personKey) {
  return getUpcomingPaymentsForPerson(serviceKey, personKey, 1)[0] ?? null;
}

function getUpcomingPaymentsForPerson(serviceKey, personKey, limit) {
  const today = startOfDay(getToday());
  const payments = [];
  const startYear = today.getFullYear();
  const startMonth = today.getMonth();

  for (let offset = 0; offset < 120 && payments.length < limit; offset += 1) {
    const monthIndex = startMonth + offset;
    const year = startYear + Math.floor(monthIndex / 12);
    const normalizedMonth = monthIndex % 12;
    const date = createPaymentDate(year, normalizedMonth);

    if (date < today) {
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

function openGoogleCalendarEvent() {
  if (!state.currentPersonKey || !state.selectedServiceKey) {
    return;
  }

  const nextPayment = getNextPayment(state.selectedServiceKey, state.currentPersonKey);

  if (!nextPayment) {
    setNotificationStatus("Não há pagamento futuro para adicionar ao Google Agenda.");
    return;
  }

  const calendarUrl = createGoogleCalendarUrl(
    state.currentPersonKey,
    state.selectedServiceKey,
    nextPayment.date
  );
  const openedWindow = window.open(calendarUrl, "_blank", "noopener");

  if (!openedWindow) {
    window.location.href = calendarUrl;
  }

  setNotificationStatus(
    "O Google Agenda foi aberto com o evento preenchido. Revise os lembretes e salve o evento."
  );
}

function createGoogleCalendarUrl(personKey, serviceKey, startDate) {
  const person = PEOPLE[personKey];
  const service = SERVICES[serviceKey];
  const eventStart = createCalendarEventDate(startDate, SETTINGS.calendarEventHour, 0);
  const eventEnd = createCalendarEventDate(startDate, SETTINGS.calendarEventHour, 15);
  const recurrenceInterval = getCalendarRecurrenceInterval(serviceKey);
  const recurrenceCount = getCalendarRecurrenceCount(serviceKey);
  const timeZone = getCalendarTimeZone();
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Pagamento ${service.name} - ${moneyFormatter.format(service.amount)}`,
    dates: `${formatGoogleCalendarDate(eventStart)}/${formatGoogleCalendarDate(eventEnd)}`,
    details: [
      `${person.name}, este é o lembrete de pagamento de ${service.name}.`,
      `Valor: ${moneyFormatter.format(service.amount)}.`,
      `Primeiro vencimento: ${formatLongDate(startDate)}.`,
      "Confira os lembretes do evento antes de salvar.",
    ].join("\n"),
    recur: `RRULE:FREQ=MONTHLY;INTERVAL=${recurrenceInterval};COUNT=${recurrenceCount}`,
    ctz: timeZone,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function getCalendarRecurrenceInterval(serviceKey) {
  return SERVICES[serviceKey].model === "rotation" ? SETTINGS.maxRotation.length : 1;
}

function getCalendarRecurrenceCount(serviceKey) {
  const interval = getCalendarRecurrenceInterval(serviceKey);
  return Math.max(1, Math.ceil(SETTINGS.calendarMonthsAhead / interval));
}

function createCalendarEventDate(date, hour, minute) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0);
}

function personPaysInMonth(serviceKey, personKey, monthIndex) {
  const service = SERVICES[serviceKey];

  if (!service.participants.includes(personKey)) {
    return false;
  }

  if (service.model === "monthly") {
    return true;
  }

  return getRotationPayer(monthIndex) === personKey;
}

function getRotationPayer(monthIndex) {
  const rotation = SETTINGS.maxRotation;
  const offset = monthIndex - SETTINGS.maxRotationStartMonth;
  const rotationIndex = ((offset % rotation.length) + rotation.length) % rotation.length;
  return rotation[rotationIndex];
}

function getYearMonths(year) {
  return Array.from({ length: 12 }, (_, monthIndex) => createPaymentDate(year, monthIndex));
}

function createPaymentDate(year, monthIndex) {
  return new Date(year, monthIndex, SETTINGS.dueDay);
}

function getDateStatus(date) {
  const today = startOfDay(getToday());
  const paymentDate = startOfDay(date);

  if (paymentDate < today) {
    return "passou";
  }

  return paymentDate.getTime() === today.getTime() ? "vence hoje" : "futuro";
}

function setActiveTab(panelName) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.panel === panelName;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  upcomingPanel.classList.toggle("is-hidden", panelName !== "upcoming");
  fullPanel.classList.toggle("is-hidden", panelName !== "full");
  yearControls.classList.toggle("is-hidden", panelName !== "full");
  updateYearControls();
}

function updateYearControls() {
  const currentYear = getToday().getFullYear();

  selectedYearLabel.textContent = state.selectedYear;
  previousYearButton.disabled = state.selectedYear <= currentYear;
}

function startSessionLoops() {
  stopSessionLoops();

  refreshIntervalId = window.setInterval(() => {
    refreshCurrentDates();
    void checkPaymentReminders();
  }, SETTINGS.refreshMinutes * 60 * 1000);
}

function stopSessionLoops() {
  if (refreshIntervalId) {
    window.clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
}

function refreshCurrentDates() {
  if (!state.currentPersonKey) {
    return;
  }

  renderSubscriptionCards(state.currentPersonKey);

  if (state.selectedServiceKey) {
    renderDetails();
  }
}

async function requestNotificationAccess({ runReminderCheck = true } = {}) {
  const capability = getNotificationCapability();

  if (!state.currentPersonKey) {
    updateNotificationButton();
    return false;
  }

  if (!capability.available) {
    updateNotificationButton();
    setNotificationStatus(capability.message);
    return false;
  }

  try {
    if (Notification.permission === "default") {
      setNotificationStatus("O navegador deve abrir o pedido de permissão agora.");
      await Notification.requestPermission();
    }
  } catch {
    setNotificationStatus("O navegador bloqueou o pedido de permissão.");
    updateNotificationButton();
    return false;
  }

  updateNotificationButton();

  if (Notification.permission === "denied") {
    setNotificationStatus(
      "As notificações estão bloqueadas. Libere nas configurações do navegador para este site."
    );
    return false;
  }

  if (Notification.permission === "default") {
    setNotificationStatus("A permissão ainda não foi concedida.");
    return false;
  }

  if (Notification.permission === "granted") {
    const registration = await registerServiceWorker();

    if ("serviceWorker" in navigator && !registration) {
      setNotificationStatus(
        "Permissão concedida, mas o service worker não foi registrado. No Android, abra pelo GitHub Pages em HTTPS."
      );
      return false;
    }

    if (runReminderCheck) {
      await checkPaymentReminders();
    }

    setNotificationStatus("Notificações permitidas neste navegador.");
    return true;
  }

  return false;
}

function updateNotificationButton() {
  if (!state.currentPersonKey) {
    notificationButton.classList.add("is-hidden");
    return;
  }

  notificationButton.classList.remove("is-hidden");

  const capability = getNotificationCapability();

  if (!capability.available) {
    notificationButton.textContent = "Notificações indisponíveis";
    notificationButton.disabled = true;
    return;
  }

  if (Notification.permission === "granted") {
    notificationButton.textContent = "Notificações ativas";
    notificationButton.disabled = false;
    return;
  }

  if (Notification.permission === "denied") {
    notificationButton.textContent = "Notificações bloqueadas";
    notificationButton.disabled = true;
    return;
  }

  notificationButton.textContent = "Ativar notificações";
  notificationButton.disabled = false;
}

function updateNotificationStatus() {
  if (!state.currentPersonKey) {
    setNotificationStatus("");
    return;
  }

  const capability = getNotificationCapability();

  if (!capability.available) {
    setNotificationStatus(capability.message);
    return;
  }

  if (Notification.permission === "granted") {
    setNotificationStatus(
      "Notificações permitidas. Use o botão de teste em Meus próximos pagamentos para ver como elas aparecem."
    );
    return;
  }

  if (Notification.permission === "denied") {
    setNotificationStatus(
      "Notificações bloqueadas para este site. Libere nas configurações do navegador se quiser receber avisos."
    );
    return;
  }

  setNotificationStatus(
    "Ative as notificações para receber aviso quando uma parcela estiver perto do vencimento."
  );
}

async function checkPaymentReminders() {
  if (
    reminderCheckInProgress ||
    !state.currentPersonKey ||
    !supportsNotifications() ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  reminderCheckInProgress = true;

  try {
    const personKey = state.currentPersonKey;
    const logs = getNotificationLogs();
    const personLog = logs[personKey] ?? {};
    const reminders = getReminderCandidates(personKey).filter(
      (payment) => !personLog[getPaymentNotificationKey(payment)]
    );

    for (const payment of reminders) {
      try {
        await showPaymentNotification(personKey, payment);
        markPaymentAsNotified(personKey, payment);
      } catch {
        setNotificationStatus(
          "Não foi possível exibir um lembrete agora. Use o botão de teste para diagnosticar."
        );
      }
    }
  } finally {
    reminderCheckInProgress = false;
  }
}

function getReminderCandidates(personKey) {
  return PEOPLE[personKey].subscriptions.flatMap((serviceKey) =>
    getUpcomingPaymentsForPerson(serviceKey, personKey, 12)
      .map((payment) => ({
        ...payment,
        daysUntil: getDaysUntil(payment.date),
      }))
      .filter(
        (payment) =>
          payment.daysUntil >= 0 && payment.daysUntil <= SETTINGS.reminderDaysBefore
      )
  );
}

async function showPaymentNotification(personKey, payment) {
  const service = SERVICES[payment.serviceKey];
  const when =
    payment.daysUntil === 0
      ? "vence hoje"
      : `vence em ${payment.daysUntil} ${payment.daysUntil === 1 ? "dia" : "dias"}`;
  const title = `${service.name}: pagamento ${when}`;
  const body = `${PEOPLE[personKey].name}, ${formatLongDate(payment.date)} - ${moneyFormatter.format(payment.amount)}.`;
  const options = {
    body,
    tag: getPaymentNotificationKey(payment),
    renotify: false,
  };

  await showBrowserNotification(title, options);
}

async function showTestNotification() {
  if (!state.currentPersonKey || !state.selectedServiceKey) {
    return;
  }

  setNotificationStatus("Preparando a notificação de teste...");
  const hasPermission = await requestNotificationAccess({ runReminderCheck: false });

  if (!hasPermission) {
    updateNotificationButton();
    return;
  }

  const payment = getNextPayment(state.selectedServiceKey, state.currentPersonKey);
  const service = SERVICES[state.selectedServiceKey];
  const person = PEOPLE[state.currentPersonKey];
  const title = `Teste: ${service.name}`;
  const body = payment
    ? `${person.name}, sua próxima parcela é ${formatLongDate(payment.date)} - ${moneyFormatter.format(payment.amount)}.`
    : `${person.name}, não há parcela futura para testar nessa assinatura.`;
  const options = {
    body,
    tag: `test:${state.selectedServiceKey}:${state.currentPersonKey}`,
    renotify: true,
  };

  try {
    await showBrowserNotification(title, options);
    setNotificationStatus(
      "Notificação de teste enviada. Se ela não apareceu, confira as notificações do navegador e do sistema operacional."
    );
  } catch {
    setNotificationStatus(
      "A permissão foi concedida, mas o navegador não exibiu a notificação. No Android, teste pelo endereço HTTPS do GitHub Pages."
    );
  }
}

async function showBrowserNotification(title, options) {
  const registration = await registerServiceWorker();

  if (registration?.showNotification) {
    await registration.showNotification(title, options);
    return;
  }

  if (typeof Notification === "function") {
    new Notification(title, options);
    return;
  }

  throw new Error("Notifications are not available.");
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker
      .register("./sw.js")
      .then(() => navigator.serviceWorker.ready)
      .catch(() => null);
  }

  return serviceWorkerRegistrationPromise;
}

function supportsNotifications() {
  return getNotificationCapability().available;
}

function getNotificationCapability() {
  if (!("Notification" in window)) {
    return {
      available: false,
      message: "Este navegador não oferece notificações para sites.",
    };
  }

  if (!window.isSecureContext) {
    return {
      available: false,
      message:
        "Notificações precisam de HTTPS. Elas não funcionam abrindo o HTML direto; teste pelo GitHub Pages.",
    };
  }

  return {
    available: true,
    message: "",
  };
}

function setNotificationStatus(message) {
  if (notificationStatus) {
    notificationStatus.textContent = message;
  }
}

function markPaymentAsNotified(personKey, payment) {
  const logs = getNotificationLogs();

  logs[personKey] = logs[personKey] ?? {};
  logs[personKey][getPaymentNotificationKey(payment)] = new Date().toISOString();
  saveNotificationLogs(logs);
}

function getPaymentNotificationKey(payment) {
  return `${payment.serviceKey}:${formatDateKey(payment.date)}`;
}

function getNotificationLogs() {
  return readJson(STORAGE_KEYS.notifications, {});
}

function saveNotificationLogs(logs) {
  writeJson(STORAGE_KEYS.notifications, logs);
}

function getSavedProfile() {
  const profile = readJson(STORAGE_KEYS.profile, null);
  return profile?.personKey ?? null;
}

function saveProfile(personKey) {
  writeJson(STORAGE_KEYS.profile, {
    personKey,
    savedAt: new Date().toISOString(),
  });
}

function clearProfile() {
  localStorage.removeItem(STORAGE_KEYS.profile);
}

function readJson(key, fallback) {
  try {
    const rawValue = localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function findPersonKey(rawName) {
  const normalized = normalizeName(rawName);

  return (
    Object.entries(PEOPLE).find(([, person]) =>
      person.aliases.map(normalizeName).includes(normalized)
    )?.[0] ?? null
  );
}

function getNameError(rawName) {
  const normalized = normalizeName(rawName);

  if (normalized === "ianca") {
    return "Esse cadastro está como Ianka, com k.";
  }

  if (normalized === "sara" || normalized === "sarah") {
    return "Esse cadastro está como Sarha.";
  }

  return "Nome não encontrado. Use André, Isabela, Ianka ou Sarha.";
}

function normalizeName(value) {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatShortDate(date) {
  return `${date.getDate()} de ${MONTHS[date.getMonth()]}`;
}

function formatLongDate(date) {
  return `${date.getDate()} de ${MONTHS[date.getMonth()]} de ${date.getFullYear()}`;
}

function formatDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatGoogleCalendarDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "T",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
}

function getCalendarTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || SETTINGS.calendarTimeZone;
}

function capitalize(value) {
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
}

function getDaysUntil(date) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((startOfDay(date) - startOfDay(getToday())) / millisecondsPerDay);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getToday() {
  return new Date();
}

function initTheme() {
  const storedTheme = getStoredTheme();
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  applyTheme(storedTheme ?? (prefersDark ? "dark" : "light"));
}

function applyTheme(theme) {
  const normalizedTheme = theme === "dark" ? "dark" : "light";

  document.documentElement.dataset.theme = normalizedTheme;
  themeButton.textContent = normalizedTheme === "dark" ? "Modo claro" : "Modo escuro";
  themeButton.setAttribute("aria-pressed", String(normalizedTheme === "dark"));
}

function getStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEYS.theme);
  } catch {
    return null;
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  } catch {
    // The selected theme still applies for the current page even if storage is blocked.
  }
}
