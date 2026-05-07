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

const PEOPLE = {
  andre: {
    name: 'André Luiz',
    aliases: ['andre', 'andré'],
    subscriptions: ['disney', 'max', 'spotify', 'crunchyroll', 'prime_video', 'google_one', 'f1_tv_pro', 'globoplay'],
    color: '#4f46e5',
    avatar: 'AL',
  },
  isabela: {
    name: 'Bela Lustosa',
    aliases: ['isabela'],
    subscriptions: ['disney', 'max', 'spotify'],
    color: '#ec4899',
    avatar: 'BL',
  },
  ianka: {
    name: 'Ianka Lacerda',
    aliases: ['ianka'],
    subscriptions: ['disney', 'max'],
    color: '#10b981',
    avatar: 'IL',
  },
  sarha: {
    name: 'Sarha Pedrosa',
    aliases: ['sarha'],
    subscriptions: ['max'],
    color: '#f59e0b',
    avatar: 'SP',
  },
};

const SERVICES = {
  disney: {
    name: 'Disney+',
    shortName: 'D+',
    cssClass: 'service-disney',
    model: 'monthly',
    modelLabel: 'Todo mês',
    amount: 22.31,
    participants: ['andre', 'isabela', 'ianka'],
  },
  max: {
    name: 'HBO Max',
    shortName: 'M',
    cssClass: 'service-max',
    model: 'rotation',
    modelLabel: 'Rodízio',
    amount: 22.45,
    participants: ['andre', 'isabela', 'ianka', 'sarha'],
  },
  spotify: {
    name: 'Spotify',
    shortName: 'S',
    cssClass: 'service-spotify',
    model: 'monthly',
    modelLabel: 'Todo mês',
    amount: 15.95,
    participants: ['andre', 'isabela'],
  },
  crunchyroll: {
    name: 'Crunchyroll',
    shortName: 'CR',
    cssClass: 'service-crunchyroll',
    model: 'monthly',
    modelLabel: 'Todo mês',
    amount: 19.90,
    participants: ['andre'],
  },
  prime_video: {
    name: 'Prime Video',
    shortName: 'PV',
    cssClass: 'service-prime',
    model: 'monthly',
    modelLabel: 'Todo mês',
    amount: 9.95,
    participants: ['andre'],
  },
  google_one: {
    name: 'Google One',
    shortName: 'G1',
    cssClass: 'service-google',
    model: 'monthly',
    modelLabel: 'Todo mês',
    amount: 10.00,
    participants: ['andre'],
  },
  f1_tv_pro: {
    name: 'F1 TV Pro',
    shortName: 'F1',
    cssClass: 'service-f1',
    model: 'monthly',
    modelLabel: 'Todo mês',
    amount: 29.00,
    participants: ['andre'],
  },
  globoplay: {
    name: 'Globoplay',
    shortName: 'GP',
    cssClass: 'service-globoplay',
    model: 'monthly',
    modelLabel: 'Todo mês',
    amount: 20.00,
    participants: ['andre'],
  },
};

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const STORAGE_KEYS = {
  profile: 'streaming-payments-profile-v2',
  notifications: 'streaming-payments-notifications-v2',
  theme: 'streaming-payments-theme',
  paid: 'streaming-payments-paid-v2',
};

// Esta é a API publicada no Google Apps Script.
// O arquivo apps_script/Code.gs é só a cópia versionada do código que roda nessa URL.
const API_URL =
  'https://script.google.com/macros/s/AKfycbzGXlEF0PCOS1KW2SlAWIrcgjg_9rjomXq55jAGEkWm9IRQeqHH130Vvi68OHs6pHOd/exec';

const state = {
  currentPersonKey: null,
  selectedServiceKey: null,
  selectedYear: getToday().getFullYear(),
};

let refreshIntervalId = null;
let reminderCheckInProgress = false;
let serviceWorkerRegistrationPromise = null;
let paidLogsCache = {};

const profileScreen = document.querySelector('#profileScreen');
const dashboard = document.querySelector('#dashboard');
const profileSelection = document.querySelector('#profileSelection');
const profileGrid = document.querySelector('#profileGrid');
const profileForm = document.querySelector('#profileForm');
const profileNameInput = document.querySelector('#profileNameInput');
const profileMessage = document.querySelector('#profileMessage');
const notificationButton = document.querySelector('#notificationButton');
const notificationStatus = document.querySelector('#notificationStatus');
const changeProfileButton = document.querySelector('#changeProfileButton');
const personName = document.querySelector('#personName');
const summaryCount = document.querySelector('#summaryCount');
const summaryLabel = document.querySelector('#summaryLabel');
const totalMonthAmount = document.querySelector('#totalMonthAmount');
const subscriptionList = document.querySelector('#subscriptionList');
const detailsPanel = document.querySelector('#detailsPanel');
const detailsLoadingState = document.querySelector('#detailsLoadingState');
const detailsContent = document.querySelector('#detailsContent');
const detailsService = document.querySelector('#detailsService');
const detailsTitle = document.querySelector('#detailsTitle');
const upcomingPanel = document.querySelector('#upcomingPanel');
const fullPanel = document.querySelector('#fullPanel');
const closeDetailsButton = document.querySelector('#closeDetailsButton');
const tabButtons = document.querySelectorAll('.tab-button');
const yearControls = document.querySelector('#yearControls');
const previousYearButton = document.querySelector('#previousYearButton');
const nextYearButton = document.querySelector('#nextYearButton');
const selectedYearLabel = document.querySelector('#selectedYearLabel');
const syncSheetsButton = document.querySelector('#syncSheetsButton');
const notificationModal = document.querySelector('#notificationModal');
const closeNotificationModal = document.querySelector('#closeNotificationModal');
const allowNotificationsButton = document.querySelector('#allowNotificationsButton');
const tutorialButton = document.querySelector('#tutorialButton');
const tutorialModal = document.querySelector('#tutorialModal');
const closeTutorialModal = document.querySelector('#closeTutorialModal');

const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

bindEvents();
restoreProfile();
renderProfileSelection();
checkInitialNotificationPermission();

function checkInitialNotificationPermission() {
  const capability = getNotificationCapability();
  if (!capability.available) return;

  if (Notification.permission === 'default') {
    notificationModal.classList.remove('is-hidden');
  }
}

function bindEvents() {
  profileForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleProfileSubmit();
  });

  notificationButton.addEventListener('click', () => {
    const capability = getNotificationCapability();
    if (capability.available && Notification.permission === 'default') {
      notificationModal.classList.remove('is-hidden');
    } else {
      void requestNotificationAccess();
    }
  });

  closeNotificationModal.addEventListener('click', () => {
    notificationModal.classList.add('is-hidden');
  });

  tutorialButton.addEventListener('click', () => {
    tutorialModal.classList.remove('is-hidden');
  });

  closeTutorialModal.addEventListener('click', () => {
    tutorialModal.classList.add('is-hidden');
  });

  tutorialModal.addEventListener('click', (event) => {
    if (event.target === tutorialModal) {
      tutorialModal.classList.add('is-hidden');
    }
  });

  allowNotificationsButton.addEventListener('click', async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'default') {
        notificationModal.classList.add('is-hidden');
        updateNotificationButton();
        if (state.currentPersonKey) {
          updateNotificationStatus();
        }
        if (permission === 'granted') {
          await registerServiceWorker();
          if (state.currentPersonKey) {
            await checkPaymentReminders();
          }
        }
      }
    } catch {
      notificationModal.classList.add('is-hidden');
    }
  });

  upcomingPanel.addEventListener('click', async (event) => {
    const testButton = event.target.closest('[data-test-notification]');
    const calendarButton = event.target.closest('[data-add-calendar]');
    const markButton = event.target.closest('[data-mark-paid]');

    if (testButton) {
      void showTestNotification();
    }

    if (calendarButton) {
      openGoogleCalendarEvent();
    }
    if (markButton) {
      if (!state.currentPersonKey) {
        setNotificationStatus(
          'Selecione um perfil antes de marcar pagamentos.',
        );
        return;
      }

      const serviceKey = markButton.dataset.service;
      const dateMs = Number(markButton.dataset.dateMs);
      const payment = {
        serviceKey,
        date: new Date(dateMs),
        amount: SERVICES[serviceKey]?.amount ?? 0,
      };

      const paid = isPaymentPaid(state.currentPersonKey, payment);

      if (paid) {
        markButton.classList.add('pulse-success');
        setTimeout(() => markButton.classList.remove('pulse-success'), 600);
        await unmarkPayment(state.currentPersonKey, payment);
        setNotificationStatus('Parcela desmarcada como paga.');
      } else {
        markButton.classList.add('pulse-success');
        setTimeout(() => markButton.classList.remove('pulse-success'), 600);
        await markPaymentAsPaid(state.currentPersonKey, payment);
        setNotificationStatus('Parcela marcada como paga.');
      }
    }
  });

  fullPanel.addEventListener('click', async (event) => {
    const toggleButton = event.target.closest('[data-toggle-paid]');
    if (!toggleButton) return;

    if (!state.currentPersonKey) {
      setNotificationStatus('Selecione um perfil antes de marcar pagamentos.');
      return;
    }

    const personKey = toggleButton.dataset.person;
    const serviceKey = toggleButton.dataset.service;
    const dateMs = Number(toggleButton.dataset.dateMs);
    const payment = {
      serviceKey,
      date: new Date(dateMs),
      amount: SERVICES[serviceKey]?.amount ?? 0,
    };

    const paid = isPaymentPaid(personKey, payment);

    if (paid) {
      toggleButton.classList.add('pulse-success');
      setTimeout(() => toggleButton.classList.remove('pulse-success'), 600);
      await unmarkPayment(personKey, payment);
      setNotificationStatus('Parcela desmarcada como paga.');
    } else {
      toggleButton.classList.add('pulse-success');
      setTimeout(() => toggleButton.classList.remove('pulse-success'), 600);
      await markPaymentAsPaid(personKey, payment);
      setNotificationStatus('Parcela marcada como paga.');
    }
  });

  changeProfileButton.addEventListener('click', changeProfile);

  closeDetailsButton.addEventListener('click', () => {
    state.selectedServiceKey = null;
    detailsPanel.classList.add('is-hidden');
    document
      .querySelectorAll('.subscription-card')
      .forEach((card) => card.classList.remove('is-selected'));
  });

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setActiveTab(button.dataset.panel);
    });
  });

  previousYearButton.addEventListener('click', () => {
    const currentYear = getToday().getFullYear();

    if (state.selectedYear <= currentYear) {
      return;
    }

    state.selectedYear -= 1;
    renderDetails();
  });

  nextYearButton.addEventListener('click', () => {
    state.selectedYear += 1;
    renderDetails();
  });

  syncSheetsButton.addEventListener('click', async () => {
    if (syncSheetsButton.classList.contains('is-syncing')) return;

    syncSheetsButton.classList.add('is-syncing');
    syncSheetsButton.disabled = true;
    
    try {
      await fetchPaidLogs();
      setNotificationStatus('Dados sincronizados com sucesso.', true);
    } catch (error) {
      console.error('Erro na sincronização manual:', error);
      setNotificationStatus(error.message || 'Erro ao sincronizar. Tente novamente.', true);
    } finally {
      syncSheetsButton.classList.remove('is-syncing');
      syncSheetsButton.disabled = false;
    }
  });

  window.addEventListener('focus', () => {
    refreshCurrentDates();
    void (async () => {
      await fetchPaidLogs().catch(() => {});
      void checkPaymentReminders();
    })();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshCurrentDates();
      void (async () => {
        await fetchPaidLogs().catch(() => {});
        void checkPaymentReminders();
      })();
    }
  });
}

async function handleProfileSubmit() {
  const personKey = findPersonKey(profileNameInput.value);
  profileMessage.textContent = '';

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
    profileScreen.classList.remove('is-hidden');
    dashboard.classList.add('is-hidden');
    notificationButton.classList.add('is-hidden');
    changeProfileButton.classList.add('is-hidden');
    renderProfileSelection();
    return;
  }

  openDashboard(personKey);
}

function renderProfileSelection() {
  if (!profileGrid) return;
  
  profileGrid.innerHTML = Object.entries(PEOPLE)
    .map(([key, person]) => `
      <button class="profile-item" type="button" data-person="${key}">
        <div class="profile-avatar" style="background-color: ${person.color}">${person.avatar}</div>
        <span class="profile-name">${person.name}</span>
      </button>
    `)
    .join('');

  profileGrid.querySelectorAll('.profile-item').forEach(button => {
    button.addEventListener('click', () => {
      const personKey = button.dataset.person;
      if (personKey && PEOPLE[personKey]) {
        saveProfile(personKey);
        openDashboard(personKey);
      }
    });
  });
}

function changeProfile() {
  clearProfile();
  stopSessionLoops();
  state.currentPersonKey = null;
  state.selectedServiceKey = null;
  state.selectedYear = getToday().getFullYear();
  dashboard.classList.add('is-hidden');
  subscriptionList.classList.remove('is-ready');
  detailsPanel.classList.add('is-hidden');
  notificationButton.classList.add('is-hidden');
  changeProfileButton.classList.add('is-hidden');
  yearControls.classList.add('is-hidden');
  profileScreen.classList.remove('is-hidden');
  renderProfileSelection();
  if (profileNameInput) profileNameInput.value = '';
  if (profileMessage) profileMessage.textContent = '';
}

async function openDashboard(personKey) {
  const person = PEOPLE[personKey];
  state.currentPersonKey = personKey;
  state.selectedServiceKey = null;
  state.selectedYear = getToday().getFullYear();

  personName.textContent = person.name;
  summaryCount.textContent = person.subscriptions.length;
  summaryLabel.textContent =
    person.subscriptions.length === 1 ? 'assinatura' : 'assinaturas';
  profileScreen.classList.add('is-hidden');
  dashboard.classList.remove('is-hidden');
  changeProfileButton.classList.remove('is-hidden');
  detailsPanel.classList.add('is-hidden');

  // Inicializa com dados locais IMEDIATAMENTE
  paidLogsCache = getPaidLogs();
  updateMonthlyTotal(personKey);
  subscriptionList.classList.remove('is-ready');
  renderSubscriptionCards(personKey);
  
  // Marca como ready após o primeiro render para evitar redunância de animação no sync
  setTimeout(() => {
    subscriptionList.classList.add('is-ready');
  }, 1000);

  updateNotificationButton();
  updateNotificationStatus();
  
  // Tenta sincronizar "no fundo"
  void (async () => {
    try {
      const isSyncingManual = syncSheetsButton.classList.contains('is-syncing');
      if (!isSyncingManual) {
        setNotificationStatus('Sincronizando...');
      }
      
      await fetchPaidLogs();
      
      // Força a atualização da tela após o download bem-sucedido
      renderSubscriptionCards(personKey);
      if (state.selectedServiceKey) {
        renderDetails();
      }
      
      if (!isSyncingManual) {
        setNotificationStatus('');
      }
    } catch (error) {
      console.error('Sincronização em segundo plano falhou:', error);
      // Não mostramos erro gritante aqui para não atrapalhar o uso dos dados locais
      if (notificationStatus && notificationStatus.textContent === 'Sincronizando...') {
        setNotificationStatus('Modo offline (dados locais)');
      }
    } finally {
      void checkPaymentReminders();
    }
  })();

  startSessionLoops();
}

function renderSubscriptionCards(personKey) {
  const person = PEOPLE[personKey];
  const sortedServices = [...person.subscriptions].sort((a, b) =>
    SERVICES[a].name.localeCompare(SERVICES[b].name, 'pt-BR'),
  );

  // Preserve detailsPanel if it has been moved inside subscriptionList
  if (detailsPanel.parentElement === subscriptionList) {
    subscriptionList.insertAdjacentElement('afterend', detailsPanel);
  }

  subscriptionList.innerHTML = sortedServices
    .map((serviceKey) => createSubscriptionCard(serviceKey, personKey))
    .join('');

  subscriptionList.querySelectorAll('.subscription-card').forEach((card) => {
    card.addEventListener('click', () => {
      void openServiceDetails(card.dataset.service);
    });
  });

  if (state.selectedServiceKey) {
    document.querySelectorAll('.subscription-card').forEach((card) => {
      card.classList.toggle('is-selected', card.dataset.service === state.selectedServiceKey);
    });
    positionDetailsPanel();
  }
}

function updateMonthlyTotal(personKey) {
  if (!totalMonthAmount) return;

  const today = getToday();
  const currentMonthIndex = today.getMonth();
  const currentYear = today.getFullYear();
  const person = PEOPLE[personKey];
  
  if (!person) return;

  let total = 0;
  person.subscriptions.forEach((serviceKey) => {
    if (personPaysInMonth(serviceKey, personKey, currentMonthIndex)) {
      const date = createPaymentDate(currentYear, currentMonthIndex);
      const paid = isPaymentPaid(personKey, { serviceKey, date });
      if (!paid) {
        total += SERVICES[serviceKey].amount;
      }
    }
  });

  totalMonthAmount.textContent = moneyFormatter.format(total);
}

function createSubscriptionCard(serviceKey, personKey) {
  const service = SERVICES[serviceKey];
  const nextPayment = getNextPayment(serviceKey, personKey);
  const paid = nextPayment ? isPaymentPaid(personKey, nextPayment) : false;
  
  const dateText = nextPayment
    ? formatShortDate(nextPayment.date)
    : 'Sem data restante';
  const amountText = moneyFormatter.format(service.amount);
  const statusPill = paid 
    ? '<span class="status-pill status-pago" style="margin-left: 8px; vertical-align: middle;">Pago</span>'
    : '';

  return `
    <button class="subscription-card ${service.cssClass}${paid ? ' is-paid' : ''}" type="button" data-service="${serviceKey}">
      <span class="subscription-top">
        <span class="subscription-title">
          <span class="service-symbol">${service.shortName}</span>
          <strong>${service.name} ${statusPill}</strong>
        </span>
        <span class="share-type">${service.modelLabel}</span>
      </span>

      <span class="payment-line">
        <span>
          <span>${paid ? 'Data paga' : 'Próxima data'}</span>
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

async function openServiceDetails(serviceKey) {
  state.selectedServiceKey = serviceKey;
  const service = SERVICES[serviceKey];
  const person = PEOPLE[state.currentPersonKey];
  state.selectedYear = getToday().getFullYear();

  document.querySelectorAll('.subscription-card').forEach((card) => {
    card.classList.toggle('is-selected', card.dataset.service === serviceKey);
  });

  detailsService.textContent = service.name;
  detailsTitle.textContent = `${person.name}, estes são os pagamentos dessa assinatura`;
  
  detailsPanel.className = 'details-panel is-hidden';
  detailsPanel.classList.add(`details-${serviceKey}`);
  detailsPanel.classList.remove('is-hidden');
  
  // Exibir loading e esconder conteúdo
  detailsContent.classList.add('is-hidden');
  detailsLoadingState.classList.remove('is-hidden');
  
  positionDetailsPanel();
  
  setActiveTab('upcoming');

  try {
    await fetchPaidLogs();
    renderDetails();
  } finally {
    // Esconder loading e mostrar conteúdo
    detailsLoadingState.classList.add('is-hidden');
    detailsContent.classList.remove('is-hidden');
    
    // Pequeno delay para garantir que o layout mobile se ajustou se o conteúdo for grande
    setTimeout(() => {
      detailsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }
}

function renderDetails() {
  if (!state.selectedServiceKey || !state.currentPersonKey) {
    return;
  }

  upcomingPanel.innerHTML = renderUpcomingPayments(
    state.selectedServiceKey,
    state.currentPersonKey,
  );
  fullPanel.innerHTML = renderFullSheet(state.selectedServiceKey);
  updateYearControls();
}

function renderUpcomingPayments(serviceKey, personKey) {
  const payments = getUpcomingPaymentsForPerson(
    serviceKey,
    personKey,
    SETTINGS.upcomingPaymentLimit,
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
      <button class="ghost-button calendar-button" type="button" data-add-calendar>
        <img src="Google_Calendar_icon_(2020).svg.png" alt="Google Agenda" class="calendar-logo" />
        Abrir no Google Agenda
      </button>
      <button class="ghost-button" type="button" data-test-notification>
        Testar notificação
      </button>
    </div>
    <ul class="payment-list">
      ${payments
        .map((payment) => {
          const paid = isPaymentPaid(personKey, payment);
          return `
            <li class="payment-item">
              <span class="payment-info-group">
                <strong>${capitalize(MONTHS[payment.date.getMonth()])}</strong>
                <span>${formatLongDate(payment.date)}</span>
              </span>
              <span class="payment-item-right">
                <span class="amount">${moneyFormatter.format(payment.amount)}</span>
                ${
                  paid
                    ? `<button class="ghost-button" type="button" data-mark-paid data-service="${payment.serviceKey}" data-date-ms="${payment.date.getTime()}">Desfazer pago</button>`
                    : `<button class="ghost-button" type="button" data-mark-paid data-service="${payment.serviceKey}" data-date-ms="${payment.date.getTime()}">Marcar como pago</button>`
                }
              </span>
            </li>
          `;
        })
        .join('')}
    </ul>
  `;
}

function renderFullSheet(serviceKey) {
  const service = SERVICES[serviceKey];
  const year = state.selectedYear;

  if (service.model === 'monthly') {
    return renderMonthlySheet(serviceKey, year);
  }

  return renderRotationSheet(serviceKey, year);
}

function renderMonthlySheet(serviceKey, year) {
  const service = SERVICES[serviceKey];
  const participantHeaders = service.participants
    .map((personKey) => `<th>${PEOPLE[personKey].name}</th>`)
    .join('');

  const rows = getYearMonths(year)
    .map((date) => {
      const status = getDateStatus(date);
      const currentPersonPaid = state.currentPersonKey
        ? isPaymentPaid(state.currentPersonKey, { serviceKey, date })
        : false;
      const rowStatus = currentPersonPaid ? 'pago' : status;
      const statusClass =
        rowStatus === 'atrasada'
          ? ' status-atrasada'
          : rowStatus === 'pago'
            ? ' status-pago'
            : rowStatus === 'futuro'
              ? ' status-futuro'
              : '';

      const participantCells = service.participants
        .map((participantKey) => {
          const paid = isPaymentPaid(participantKey, { serviceKey, date });
          const isCurrentUser = participantKey === state.currentPersonKey;
          const actionButton = isCurrentUser
            ? `<button class="ghost-button action-btn" type="button" data-toggle-paid data-person="${participantKey}" data-service="${serviceKey}" data-date-ms="${date.getTime()}">${paid ? 'Desfazer pago' : 'Marcar como pago'}</button>`
            : '';
          const innerContent = paid
            ? `<div class="status-actions"><span class="status-pill status-pago">pago</span>${actionButton}</div>`
            : `<div class="status-actions"><span class="amount">${moneyFormatter.format(service.amount)}</span>${actionButton}</div>`;
          return `<td data-label="${PEOPLE[participantKey].name}">${innerContent}</td>`;
        })
        .join('');

      return `
        <tr>
          <td data-label="Mês">${capitalize(MONTHS[date.getMonth()])}</td>
          <td data-label="Data">${formatLongDate(date)}</td>
          ${participantCells}
          <td data-label="Status"><div class="status-actions"><span class="status-pill${statusClass}">${rowStatus}</span></div></td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="table-responsive">
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
    </div>
  `;
}

function renderRotationSheet(serviceKey, year) {
  const rows = getYearMonths(year)
    .map((date) => {
      const payerKey = getRotationPayer(date.getMonth());
      const baseStatus = getDateStatus(date);
      const paid = isPaymentPaid(payerKey, { serviceKey, date });
      const status = paid ? 'pago' : baseStatus;
      const statusClass =
        status === 'atrasada'
          ? ' status-atrasada'
          : status === 'pago'
            ? ' status-pago'
            : status === 'futuro'
              ? ' status-futuro'
              : '';
      const actionButton =
        payerKey === state.currentPersonKey
          ? `<button class="ghost-button" type="button" data-toggle-paid data-person="${payerKey}" data-service="${serviceKey}" data-date-ms="${date.getTime()}">${paid ? 'Desfazer pago' : 'Marcar como pago'}</button>`
          : '';
      return `
        <tr>
          <td data-label="Mês">${capitalize(MONTHS[date.getMonth()])}</td>
          <td data-label="Data">${formatLongDate(date)}</td>
          <td data-label="Responsável">${PEOPLE[payerKey].name}</td>
          <td data-label="Valor"><span class="amount">${moneyFormatter.format(SERVICES[serviceKey].amount)}</span></td>
          <td data-label="Status"><div class="status-actions"><span class="status-pill${statusClass}">${status}</span>${actionButton}</div></td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="table-responsive">
      <table class="sheet-table sheet-rotation">
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
    </div>
  `;
}

function getNextPayment(serviceKey, personKey) {
  return getUpcomingPaymentsForPerson(serviceKey, personKey, 1)[0] ?? null;
}

function getUpcomingPaymentsForPerson(serviceKey, personKey, limit) {
  const today = startOfDay(getToday());
  const payments = [];
  
  // Retrocede 2 meses para pegar parcelas vencidas que ainda NÃO foram pagas
  const startYear = today.getFullYear();
  const startMonth = today.getMonth() - 2;

  for (let offset = 0; offset < 120 && payments.length < limit; offset += 1) {
    const monthIndex = startMonth + offset;
    const year = startYear + Math.floor(monthIndex / 12);
    const normalizedMonth = ((monthIndex % 12) + 12) % 12;
    const date = createPaymentDate(year, normalizedMonth);

    // Se for no futuro, adicionamos
    // Se for no passado, SÓ adicionamos se NÃO estiver pago
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

function openGoogleCalendarEvent() {
  if (!state.currentPersonKey || !state.selectedServiceKey) {
    return;
  }

  const nextPayment = getNextPayment(
    state.selectedServiceKey,
    state.currentPersonKey,
  );

  if (!nextPayment) {
    setNotificationStatus(
      'Não há pagamento futuro para adicionar ao Google Agenda.',
    );
    return;
  }

  const calendarUrl = createGoogleCalendarUrl(
    state.currentPersonKey,
    state.selectedServiceKey,
    nextPayment.date,
  );
  const openedWindow = window.open(calendarUrl, '_blank', 'noopener');

  if (!openedWindow) {
    window.location.href = calendarUrl;
  }

  setNotificationStatus(
    'O Google Agenda foi aberto com o evento preenchido. Revise os lembretes e salve o evento.',
  );
}

function createGoogleCalendarUrl(personKey, serviceKey, startDate) {
  const person = PEOPLE[personKey];
  const service = SERVICES[serviceKey];
  const eventStart = createCalendarEventDate(
    startDate,
    SETTINGS.calendarEventHour,
    0,
  );
  const eventEnd = createCalendarEventDate(
    startDate,
    SETTINGS.calendarEventHour,
    15,
  );
  const recurrenceInterval = getCalendarRecurrenceInterval(serviceKey);
  const recurrenceCount = getCalendarRecurrenceCount(serviceKey);
  const timeZone = getCalendarTimeZone();
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Pagamento ${service.name} - ${moneyFormatter.format(service.amount)}`,
    dates: `${formatGoogleCalendarDate(eventStart)}/${formatGoogleCalendarDate(eventEnd)}`,
    details: [
      `${person.name}, este é o lembrete de pagamento de ${service.name}.`,
      `Valor: ${moneyFormatter.format(service.amount)}.`,
      `Primeiro vencimento: ${formatLongDate(startDate)}.`,
      'Confira os lembretes do evento antes de salvar.',
    ].join('\n'),
    recur: `RRULE:FREQ=MONTHLY;INTERVAL=${recurrenceInterval};COUNT=${recurrenceCount}`,
    ctz: timeZone,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function getCalendarRecurrenceInterval(serviceKey) {
  return SERVICES[serviceKey].model === 'rotation'
    ? SETTINGS.maxRotation.length
    : 1;
}

function getCalendarRecurrenceCount(serviceKey) {
  const interval = getCalendarRecurrenceInterval(serviceKey);
  return Math.max(1, Math.ceil(SETTINGS.calendarMonthsAhead / interval));
}

function createCalendarEventDate(date, hour, minute) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    minute,
    0,
  );
}

function personPaysInMonth(serviceKey, personKey, monthIndex) {
  const service = SERVICES[serviceKey];

  if (!service.participants.includes(personKey)) {
    return false;
  }

  if (service.model === 'monthly') {
    return true;
  }

  return getRotationPayer(monthIndex) === personKey;
}

function getRotationPayer(monthIndex) {
  const rotation = SETTINGS.maxRotation;
  const offset = monthIndex - SETTINGS.maxRotationStartMonth;
  const rotationIndex =
    ((offset % rotation.length) + rotation.length) % rotation.length;
  return rotation[rotationIndex];
}

function getYearMonths(year) {
  return Array.from({ length: 12 }, (_, monthIndex) =>
    createPaymentDate(year, monthIndex),
  );
}

function createPaymentDate(year, monthIndex) {
  return new Date(year, monthIndex, SETTINGS.dueDay);
}

function getDateStatus(date) {
  const today = startOfDay(getToday());
  const paymentDate = startOfDay(date);

  if (paymentDate < today) {
    return 'atrasada';
  }

  return paymentDate.getTime() === today.getTime() ? 'vence hoje' : 'futuro';
}

function setActiveTab(panelName) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.panel === panelName;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  upcomingPanel.classList.toggle('is-hidden', panelName !== 'upcoming');
  fullPanel.classList.toggle('is-hidden', panelName !== 'full');
  yearControls.classList.toggle('is-hidden', panelName !== 'full');
  updateYearControls();
}

function updateYearControls() {
  const currentYear = getToday().getFullYear();

  selectedYearLabel.textContent = state.selectedYear;
  previousYearButton.disabled = state.selectedYear <= currentYear;
}

function startSessionLoops() {
  stopSessionLoops();

  refreshIntervalId = window.setInterval(
    () => {
      refreshCurrentDates();
      void checkPaymentReminders();
    },
    SETTINGS.refreshMinutes * 60 * 1000,
  );
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

  updateMonthlyTotal(state.currentPersonKey);
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
    if (Notification.permission === 'default') {
      setNotificationStatus(
        'O navegador deve abrir o pedido de permissão agora.',
      );
      await Notification.requestPermission();
    }
  } catch {
    setNotificationStatus('O navegador bloqueou o pedido de permissão.');
    updateNotificationButton();
    return false;
  }

  updateNotificationButton();

  if (Notification.permission === 'denied') {
    setNotificationStatus(
      'As notificações estão bloqueadas. Libere nas configurações do navegador para este site.',
    );
    return false;
  }

  if (Notification.permission === 'default') {
    setNotificationStatus('A permissão ainda não foi concedida.');
    return false;
  }

  if (Notification.permission === 'granted') {
    const registration = await registerServiceWorker();

    if ('serviceWorker' in navigator && !registration) {
      setNotificationStatus(
        'Permissão concedida, mas o service worker não foi registrado. No Android, abra pelo GitHub Pages em HTTPS.',
      );
      return false;
    }

    if (runReminderCheck) {
      await checkPaymentReminders();
    }

    setNotificationStatus('Notificações permitidas neste navegador.');
    return true;
  }

  return false;
}

function updateNotificationButton() {
  if (!state.currentPersonKey) {
    notificationButton.classList.add('is-hidden');
    return;
  }

  notificationButton.classList.remove('is-hidden');

  const capability = getNotificationCapability();

  if (!capability.available) {
    setNotificationButtonState('unavailable');
    return;
  }

  if (Notification.permission === 'granted') {
    setNotificationButtonState('enabled');
    return;
  }

  if (Notification.permission === 'denied') {
    setNotificationButtonState('blocked');
    return;
  }

  setNotificationButtonState('prompt');
}

function setNotificationButtonState(stateName) {
  const stateConfig = {
    unavailable: {
      icon: `<img src="icones/icons8-no-reminders-100.png" class="top-icon" alt="" />`,
      ariaLabel: 'Notificações indisponíveis neste dispositivo',
      title: 'Notificações indisponíveis',
      disabled: true,
    },
    enabled: {
      icon: `<img src="icones/icons8-notification-100.png" class="top-icon" alt="" />`,
      ariaLabel: 'Notificações ativas',
      title: 'Notificações ativas',
      disabled: false,
    },
    blocked: {
      icon: `<img src="icones/icons8-no-reminders-100.png" class="top-icon" alt="" />`,
      ariaLabel: 'Notificações bloqueadas',
      title: 'Notificações bloqueadas',
      disabled: true,
    },
    prompt: {
      icon: `<img src="icones/icons8-notification-100.png" class="top-icon" alt="" />`,
      ariaLabel: 'Ativar notificações',
      title: 'Ativar notificações',
      disabled: false,
    },
  };

  const config = stateConfig[stateName] || stateConfig.prompt;

  notificationButton.innerHTML = config.icon;
  notificationButton.setAttribute('aria-label', config.ariaLabel);
  notificationButton.title = config.title;
  notificationButton.disabled = config.disabled;
}

function updateNotificationStatus() {
  if (!state.currentPersonKey) {
    setNotificationStatus('');
    return;
  }

  // We intentionally leave the notification status empty by default.
  // The notification icon in the topbar and the modal handle the UX.
  // Status text should only be used for transient feedback (like 'Parcela paga').
  setNotificationStatus('');
}

async function checkPaymentReminders() {
  if (
    reminderCheckInProgress ||
    !state.currentPersonKey ||
    !supportsNotifications() ||
    Notification.permission !== 'granted'
  ) {
    return;
  }

  reminderCheckInProgress = true;

  try {
    await syncLogsFromSW();
    const personKey = state.currentPersonKey;
    const logs = getNotificationLogs();
    const personLog = logs[personKey] ?? {};
    const rawReminders = getReminderCandidates(personKey);
    const remindersToProcess = rawReminders.filter(
      (payment) => 
        !personLog[getReminderNotificationKey(payment)] && 
        !isPaymentPaid(personKey, payment)
    );

    if (remindersToProcess.length === 0) {
      void syncRemindersToSW();
      return;
    }

    const groupedReminders = {};
    for (const payment of remindersToProcess) {
       const dateKey = formatDateKey(payment.date);
       if (!groupedReminders[dateKey]) {
          groupedReminders[dateKey] = {
             payments: [],
             daysUntil: payment.daysUntil,
             date: payment.date
          };
       }
       groupedReminders[dateKey].payments.push(payment);
    }

    for (const dateKey in groupedReminders) {
      const group = groupedReminders[dateKey];
      try {
        await showGroupedPaymentNotification(personKey, group);
        for (const payment of group.payments) {
          markPaymentAsNotified(personKey, payment);
        }
      } catch {
        setNotificationStatus(
          'Não foi possível exibir um lembrete agora. Use o botão de teste para diagnosticar.',
        );
      }
    }
    
    void syncRemindersToSW();
  } finally {
    reminderCheckInProgress = false;
  }
}

async function syncRemindersToSW() {
  if (!('caches' in window) || !state.currentPersonKey) return;
  
  const reminders = {
    personKey: state.currentPersonKey,
    personName: PEOPLE[state.currentPersonKey].name,
    candidates: PEOPLE[state.currentPersonKey].subscriptions.flatMap((serviceKey) =>
      getUpcomingPaymentsForPerson(serviceKey, state.currentPersonKey, 12).map((payment) => ({
        serviceKey: payment.serviceKey,
        serviceName: SERVICES[payment.serviceKey].name,
        dateMs: payment.date.getTime(),
        amount: payment.amount,
        baseKey: getPaymentNotificationKey(payment),
      }))
    ),
    logs: getNotificationLogs()[state.currentPersonKey] ?? {},
    paidLogs: getPaidLogs()[state.currentPersonKey] ?? {},
    settings: {
      reminderDaysBefore: SETTINGS.reminderDaysBefore
    }
  };

  try {
    const cache = await caches.open('payment-reminders-data');
    await cache.put('/reminders.json', new Response(JSON.stringify(reminders), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (err) {
    // Ignorar falhas silenciosamente
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
          payment.daysUntil >= 0 &&
          payment.daysUntil <= SETTINGS.reminderDaysBefore,
      ),
  );
}

async function showGroupedPaymentNotification(personKey, group) {
  const serviceNames = group.payments.map(p => SERVICES[p.serviceKey].name).join(', ');
  const whenPlural = group.daysUntil === 0 ? "vencem hoje" : `vencem em ${group.daysUntil} ${group.daysUntil === 1 ? 'dia' : 'dias'}`;
  const whenSingular = group.daysUntil === 0 ? "vence hoje" : `vence em ${group.daysUntil} ${group.daysUntil === 1 ? 'dia' : 'dias'}`;

  const title = group.payments.length === 1
    ? `${serviceNames}: pagamento ${whenSingular}`
    : `Assinaturas: pagamentos ${whenPlural}`;
    
  let body = '';
  if (group.payments.length === 1) {
    body = `${PEOPLE[personKey].name}, a sua assinatura ${serviceNames} ${whenSingular}. Clique para ver as assinaturas no site.`;
  } else {
    body = `${PEOPLE[personKey].name}, as suas assinaturas ${serviceNames} ${whenPlural}. Clique para ver as assinaturas no site.`;
  }

  const baseTag = `group-reminder:${personKey}:${formatDateKey(group.date)}:remind-${group.daysUntil}`;

  const options = {
    body,
    tag: baseTag,
    renotify: false,
  };

  await showBrowserNotification(title, options);
}

async function showTestNotification() {
  if (!state.currentPersonKey || !state.selectedServiceKey) {
    return;
  }

  setNotificationStatus('Preparando a notificação de teste...');
  const hasPermission = await requestNotificationAccess({
    runReminderCheck: false,
  });

  if (!hasPermission) {
    updateNotificationButton();
    return;
  }

  const payment = getNextPayment(
    state.selectedServiceKey,
    state.currentPersonKey,
  );
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
      'Notificação de teste enviada. Se ela não apareceu, confira as notificações do navegador e do sistema operacional.',
    );
  } catch {
    setNotificationStatus(
      'A permissão foi concedida, mas o navegador não exibiu a notificação. No Android, teste pelo endereço HTTPS do GitHub Pages.',
    );
  }
}

async function showBrowserNotification(title, options) {
  const registration = await registerServiceWorker();

  if (registration?.showNotification) {
    await registration.showNotification(title, options);
    return;
  }

  if (typeof Notification === 'function') {
    new Notification(title, options);
    return;
  }

  throw new Error('Notifications are not available.');
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker
      .register('./sw.js')
      .then(async (reg) => {
        await navigator.serviceWorker.ready;
        if ('periodicSync' in reg) {
          try {
            const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
            if (status.state === 'granted') {
              await reg.periodicSync.register('check-payments', {
                minInterval: 12 * 60 * 60 * 1000,
              });
            }
          } catch (err) {
            // Permission not found or denied, ignore.
          }
        }
        return reg;
      })
      .catch(() => null);
  }

  return serviceWorkerRegistrationPromise;
}

function supportsNotifications() {
  return getNotificationCapability().available;
}

function getNotificationCapability() {
  if (!('Notification' in window)) {
    return {
      available: false,
      message: 'Este navegador não oferece notificações para sites.',
    };
  }

  if (!window.isSecureContext) {
    return {
      available: false,
      message:
        'Notificações precisam de HTTPS. Elas não funcionam abrindo o HTML direto; teste pelo GitHub Pages.',
    };
  }

  return {
    available: true,
    message: '',
  };
}

function setNotificationStatus(message, showAsSystem = false) {
  if (notificationStatus) {
    notificationStatus.textContent = message;
  }
  
  if (showAsSystem && message) {
    const title = message.includes('erro') || message.includes('Falha') || message.includes('Erro') ? 'Aviso de Sincronização' : 'Sincronização';
    showBrowserNotification(title, {
      body: message,
      icon: '/icon-192x192.png',
      tag: 'sync-status',
      renotify: true
    }).catch(err => console.warn('Não foi possível exibir notificação do sistema:', err));
  }
}

function markPaymentAsNotified(personKey, payment) {
  const logs = getNotificationLogs();

  logs[personKey] = logs[personKey] ?? {};
  logs[personKey][getReminderNotificationKey(payment)] =
    new Date().toISOString();
  saveNotificationLogs(logs);
}

function getReminderNotificationKey(payment) {
  return `${payment.serviceKey}:${formatDateKey(payment.date)}:remind-${payment.daysUntil}`;
}

function getPaymentNotificationKey(payment) {
  return `${payment.serviceKey}:${formatDateKey(payment.date)}`;
}

function getPaymentSyncPayload(personKey, payment, paid) {
  const service = SERVICES[payment.serviceKey];
  const person = PEOPLE[personKey];
  const mes = formatDateKey(payment.date);

  return {
    personKey,
    paymentKey: getPaymentNotificationKey(payment),
    nome: person?.name ?? personKey,
    serviceKey: payment.serviceKey,
    assinatura: service?.name ?? payment.serviceKey,
    mes,
    pago: paid,
  };
}

function getNotificationLogs() {
  const localLogs = readJson(STORAGE_KEYS.notifications, {});
  return localLogs;
}

// Background sync from SW cache
async function syncLogsFromSW() {
  if (!('caches' in window) || !state.currentPersonKey) return;
  try {
    const cache = await caches.open('payment-reminders-data');
    const response = await cache.match('/reminders.json');
    if (response) {
      const data = await response.json();
      if (data && data.logs) {
        const localLogs = readJson(STORAGE_KEYS.notifications, {});
        localLogs[state.currentPersonKey] = {
          ...localLogs[state.currentPersonKey],
          ...data.logs
        };
        saveNotificationLogs(localLogs);
      }
    }
  } catch (err) {}
}

function saveNotificationLogs(logs) {
  writeJson(STORAGE_KEYS.notifications, logs);
}

function getPaidLogs() {
  return readJson(STORAGE_KEYS.paid, {});
}

function savePaidLogs(logs) {
  writeJson(STORAGE_KEYS.paid, logs);
}

function isValidPaidLogsResponse(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  if (data.success === false || data.ok === true || data.action) return false;

  return Object.values(data).every((personLogs) => {
    if (!personLogs || typeof personLogs !== 'object' || Array.isArray(personLogs)) {
      return false;
    }

    return Object.values(personLogs).every((paidAt) => typeof paidAt === 'string');
  });
}

function normalizePaidLogs(data) {
  return Object.entries(data).reduce((logs, [personKey, personLogs]) => {
    const normalizedPersonKey = String(personKey || '').trim();
    if (!normalizedPersonKey || !personLogs || typeof personLogs !== 'object') {
      return logs;
    }

    Object.entries(personLogs).forEach(([paymentKey, paidAt]) => {
      const normalizedPaymentKey = String(paymentKey || '').trim();
      if (!normalizedPaymentKey) return;

      logs[normalizedPersonKey] = logs[normalizedPersonKey] ?? {};
      logs[normalizedPersonKey][normalizedPaymentKey] = String(paidAt || new Date().toISOString());
    });

    return logs;
  }, {});
}

async function fetchPaidLogs(retryCount = 0) {
  if (!API_URL || API_URL.includes('COLA_TUA_URL_DO_APPS_SCRIPT_AQUI')) {
    paidLogsCache = getPaidLogs();
    return;
  }

  const MAX_RETRIES = 2;

  try {
    // Adicionamos um timestamp (t=) para evitar que o navegador use um erro 404 cacheado
    const urlWithCacheBuster = `${API_URL}${API_URL.includes('?') ? '&' : '?'}t=${Date.now()}`;
    
    const response = await fetch(urlWithCacheBuster, {
      method: 'GET',
      mode: 'cors',
      redirect: 'follow',
      cache: 'no-store' // Força o navegador a não guardar o resultado dessa requisição
    });
    
    if (!response.ok) throw new Error(`Erro ${response.status}`);
    
    const textData = (await response.text()).trim();
    if (!textData) throw new Error('Vazio');

    let data;
    try {
      data = JSON.parse(textData);
    } catch (e) {
      if (textData.includes('<html') || textData.includes('<!DOCTYPE')) {
        throw new Error('HTML_ERROR');
      }
      throw new Error('JSON_ERROR');
    }

    if (!isValidPaidLogsResponse(data)) {
      throw new Error(data?.error || 'INVALID_SYNC_RESPONSE');
    }

    paidLogsCache = normalizePaidLogs(data);
    savePaidLogs(paidLogsCache);
    
    // SE mudou algo, atualizamos a interface
    if (state.currentPersonKey) {
      refreshCurrentDates();
      renderSubscriptionCards(state.currentPersonKey);
      if (state.selectedServiceKey) renderDetails();
      void syncRemindersToSW();
    }
  } catch (error) {
    console.warn(`Tentativa ${retryCount + 1} falhou:`, error);
    
    if (retryCount < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      return fetchPaidLogs(retryCount + 1);
    }

    paidLogsCache = getPaidLogs();
    
    let userMessage = 'Erro de sincronização. Usando dados locais.';
    if (error.message === 'HTML_ERROR') {
      userMessage = 'O Google Script não está configurado corretamente (retornou página em vez de dados).';
    } else if (error.message.includes('fetch') || error.message.includes('Network')) {
      userMessage = 'Conexão bloqueada. Verifique se há bloqueadores de anúncios ativos.';
    }
    
    throw new Error(userMessage);
  }
}

async function markPaymentAsPaid(personKey, payment) {
  const paymentKey = getPaymentNotificationKey(payment);
  const timestamp = new Date().toISOString();

  // Atualização otimista na UI
  paidLogsCache[personKey] = paidLogsCache[personKey] ?? {};
  paidLogsCache[personKey][paymentKey] = timestamp;
  savePaidLogs(paidLogsCache);
  renderDetails();
  refreshCurrentDates();
  void syncRemindersToSW();

  if (!API_URL || API_URL.includes('COLA_TUA_URL_DO_APPS_SCRIPT_AQUI')) {
    return;
  }

  try {
    setNotificationStatus('Salvando no banco de dados...');
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(getPaymentSyncPayload(personKey, payment, true)),
    });
    
    setNotificationStatus('Parcela marcada como paga e salva.');
  } catch (error) {
    console.error('Erro ao salvar no Sheets:', error);
    setNotificationStatus('Erro de conexão ao salvar. O dado está salvo localmente e tentará sincronizar depois.', true);
  }
}

async function unmarkPayment(personKey, payment) {
  const paymentKey = getPaymentNotificationKey(payment);

  if (!paidLogsCache[personKey]) {
    return;
  }

  // Atualização otimista
  delete paidLogsCache[personKey][paymentKey];
  if (Object.keys(paidLogsCache[personKey]).length === 0) {
    delete paidLogsCache[personKey];
  }

  savePaidLogs(paidLogsCache);
  renderDetails();
  refreshCurrentDates();
  void syncRemindersToSW();
  
  if (!API_URL || API_URL.includes('COLA_TUA_URL_DO_APPS_SCRIPT_AQUI')) {
    return;
  }

  try {
    setNotificationStatus('Removendo do banco de dados...');
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        ...getPaymentSyncPayload(personKey, payment, false),
        remove: true,
      }),
    });
    setNotificationStatus('Parcela desmarcada e sincronizada.');
  } catch (error) {
    console.error('Erro ao remover no Sheets:', error);
    setNotificationStatus('Erro de conexão ao remover. Alteração salva localmente.', true);
  }
}

function isPaymentPaid(personKey, payment) {
  if (!personKey) return false;
  return Boolean(
    paidLogsCache[personKey] &&
    paidLogsCache[personKey][getPaymentNotificationKey(payment)],
  );
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
      person.aliases.map(normalizeName).includes(normalized),
    )?.[0] ?? null
  );
}

function getNameError(rawName) {
  const normalized = normalizeName(rawName);

  if (normalized === 'ianca') {
    return 'Esse cadastro está como Ianka, com k.';
  }

  if (normalized === 'sara' || normalized === 'sarah') {
    return 'Esse cadastro está como Sarha.';
  }

  return 'Nome não encontrado. Use André, Isabela, Ianka ou Sarha.';
}

function normalizeName(value) {
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatGoogleCalendarDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    'T',
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join('');
}

function getCalendarTimeZone() {
  return (
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    SETTINGS.calendarTimeZone
  );
}

function capitalize(value) {
  return value.charAt(0).toLocaleUpperCase('pt-BR') + value.slice(1);
}

function getDaysUntil(date) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil(
    (startOfDay(date) - startOfDay(getToday())) / millisecondsPerDay,
  );
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getToday() {
  return new Date();
}

function positionDetailsPanel() {
  if (!state.selectedServiceKey) return;
  const activeCard = Array.from(subscriptionList.querySelectorAll('.subscription-card')).find(c => c.dataset.service === state.selectedServiceKey);

  if (activeCard) {
    activeCard.insertAdjacentElement('afterend', detailsPanel);
  } else {
    subscriptionList.insertAdjacentElement('afterend', detailsPanel);
  }
}

window.addEventListener('resize', () => {
  if (!detailsPanel.classList.contains('is-hidden')) {
    positionDetailsPanel();
  }
});
