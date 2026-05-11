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

// Estado global da aplicação
const state = {
  currentPersonKey: null,
  selectedServiceKey: null,
  selectedYear: new Date().getFullYear(),
  groupId: localStorage.getItem("streaming-payments-group-id") || null,
  groupName: localStorage.getItem("streaming-payments-group-name") || null,
};

let refreshIntervalId = null;
let reminderCheckInProgress = false;
let serviceWorkerRegistrationPromise = null;

let PEOPLE = {
  andre: {
    name: "André Luiz",
    aliases: ["andre", "andré"],
    subscriptions: [
      "disney",
      "max",
      "spotify",
      "crunchyroll",
      "prime_video",
      "google_one",
      "f1_tv_pro",
      "globoplay",
    ],
    color: "#4f46e5",
    avatar: "AL",
    isAdmin: true,
  },
  isabela: {
    name: "Bela Lustosa",
    aliases: ["isabela"],
    subscriptions: ["disney", "max", "spotify"],
    color: "#ec4899",
    avatar: "BL",
  },
  ianka: {
    name: "Ianka Lacerda",
    aliases: ["ianka"],
    subscriptions: ["disney", "max"],
    color: "#10b981",
    avatar: "IL",
  },
  sarha: {
    name: "Sarha Pedrosa",
    aliases: ["sarha"],
    subscriptions: ["max"],
    color: "#f59e0b",
    avatar: "SP",
  },
};

let SERVICES = {
  disney: {
    name: "Disney+",
    shortName: "D+",
    cssClass: "service-disney",
    model: "monthly",
    modelLabel: "Todo mês",
    totalAmount: 66.93,
    participants: ["andre", "isabela", "ianka"],
  },
  max: {
    name: "HBO Max",
    shortName: "M",
    cssClass: "service-max",
    model: "rotation",
    modelLabel: "Rodízio",
    totalAmount: 22.45,
    participants: ["andre", "isabela", "ianka", "sarha"],
  },
  spotify: {
    name: "Spotify",
    shortName: "S",
    cssClass: "service-spotify",
    model: "monthly",
    modelLabel: "Todo mês",
    totalAmount: 31.9,
    participants: ["andre", "isabela"],
  },
  crunchyroll: {
    name: "Crunchyroll",
    shortName: "CR",
    cssClass: "service-crunchyroll",
    model: "monthly",
    modelLabel: "Todo mês",
    totalAmount: 19.9,
    participants: ["andre"],
  },
  prime_video: {
    name: "Prime Video",
    shortName: "PV",
    cssClass: "service-prime",
    model: "monthly",
    modelLabel: "Todo mês",
    totalAmount: 9.95,
    participants: ["andre"],
  },
  google_one: {
    name: "Google One",
    shortName: "G1",
    cssClass: "service-google",
    model: "monthly",
    modelLabel: "Todo mês",
    totalAmount: 10.0,
    participants: ["andre"],
  },
  f1_tv_pro: {
    name: "F1 TV Pro",
    shortName: "F1",
    cssClass: "service-f1",
    model: "monthly",
    modelLabel: "Todo mês",
    totalAmount: 29.0,
    participants: ["andre"],
  },
  globoplay: {
    name: "Globoplay",
    shortName: "GP",
    cssClass: "service-globoplay",
    model: "monthly",
    modelLabel: "Todo mês",
    totalAmount: 20.0,
    participants: ["andre"],
  },
};

function applyDynamicAmounts() {
  for (const sKey in SERVICES) {
    const s = SERVICES[sKey];

    // Garantir que temos um valor base para calcular
    const baseValue =
      s.totalAmount !== undefined
        ? s.totalAmount
        : s.amount !== undefined
          ? s.amount
          : 0;
    if (s.totalAmount === undefined) s.totalAmount = baseValue;

    if (s.model === "rotation") {
      s.amount = baseValue;
    } else {
      const participantsCount =
        s.participants && s.participants.length > 0 ? s.participants.length : 1;
      s.amount = Number((baseValue / participantsCount).toFixed(2));
    }
  }
}

function syncRelationships() {
  for (const pKey in PEOPLE) PEOPLE[pKey].subscriptions = [];
  for (const sKey in SERVICES) {
    for (const rawPKey of SERVICES[sKey].participants || []) {
      const pKey = findPersonKey(rawPKey) || rawPKey;
      if (PEOPLE[pKey] && !PEOPLE[pKey].subscriptions.includes(sKey)) {
        PEOPLE[pKey].subscriptions.push(sKey);
      }
    }
  }
}

function loadAdminSettings() {
  let settingsStr = localStorage.getItem("site_settings");

  // Tentar encontrar configurações globais nos logs (pode estar em 'admin' ou personKey atual)
  const settingsProviders = ["admin", state?.currentPersonKey].filter(Boolean);

  for (const provider of settingsProviders) {
    const providerLogs = paidLogsCache && paidLogsCache[provider];
    if (!providerLogs) continue;

    // 1) Single entry (legacy)
    const singleKeys = Object.keys(providerLogs)
      .filter((k) => k.includes(":site_settings|"))
      .sort()
      .reverse();
    if (singleKeys.length > 0) {
      const parts = singleKeys[0].split("|");
      if (parts.length >= 3) {
        settingsStr = parts.slice(2).join("|");
        localStorage.setItem("site_settings", settingsStr);
        break; // Mais recente disponível
      }
    }

    // 2) Multi-part chunked upload support (site_settings_chunk)
    const chunkKeys = Object.keys(providerLogs).filter(
      (k) =>
        k.includes(":site_settings_chunk|") ||
        k.includes(":site_settings_part|"),
    );

    if (chunkKeys.length > 0) {
      const groups = {};
      chunkKeys.forEach((k) => {
        const colonIndex = k.indexOf(":");
        if (colonIndex === -1) return;
        const payload = k.slice(colonIndex + 1); // site_settings_chunk|gid|idx|total|b64
        const parts = payload.split("|");
        if (parts.length < 5) return;
        const tag = parts[0];
        if (!tag.startsWith("site_settings")) return;
        const gid = parts[1];
        const partIndex = parseInt(parts[2], 10);
        const total = parseInt(parts[3], 10) || 0;
        const b64 = parts.slice(4).join("|");

        groups[gid] = groups[gid] || { total: total, parts: {} };
        if (!isNaN(partIndex)) groups[gid].parts[partIndex] = b64;
      });

      const sortedGids = Object.keys(groups).sort().reverse();
      for (const gid of sortedGids) {
        const g = groups[gid];
        if (!g || !g.total) continue;
        const haveAll = Object.keys(g.parts).length === g.total;
        if (!haveAll) continue;
        try {
          const encoded = Array.from(
            { length: g.total },
            (_, i) => g.parts[i] || "",
          ).join("");
          const json = fromBase64Unicode(encoded);
          settingsStr = json;
          localStorage.setItem("site_settings", settingsStr);
          break;
        } catch (e) {
          // ignore and try earlier groups
        }
      }

      if (settingsStr) break;
    }
  }

  if (settingsStr) {
    try {
      const parsed = JSON.parse(settingsStr);
      if (parsed.PEOPLE) PEOPLE = parsed.PEOPLE;
      if (parsed.SERVICES) SERVICES = parsed.SERVICES;
    } catch (e) {
      console.warn("Erro ao ler configs do localStorage", e);
    }
  }

  syncRelationships();
  applyDynamicAmounts();
}

const STORAGE_KEYS = {
  profile: "streaming-payments-profile-v2",
  notifications: "streaming-payments-notifications-v2",
  theme: "streaming-payments-theme",
  paid: "streaming-payments-paid-v2",
  order: "streaming-payments-order-v3",
};

function readJson(key, fallback) {
  try {
    const rawValue = localStorage.getItem(key);
    const parsed = rawValue ? JSON.parse(rawValue) : null;
    return parsed !== null ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function getPaidLogs() {
  return readJson(STORAGE_KEYS.paid, {});
}

let paidLogsCache = getPaidLogs();

function slugify(text) {
  if (!text) return "";
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_") // Sempre usar underscore para compatibilidade com o Code.gs
    .replace(/[^\w]/g, "");
}

function toBase64Unicode(str) {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch (e) {
    return btoa(str);
  }
}

function fromBase64Unicode(b64) {
  try {
    return decodeURIComponent(escape(atob(b64)));
  } catch (e) {
    return atob(b64);
  }
}

function ensureDarkColor(hex) {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (luminance > 0.45) {
    const factor = 0.45 / luminance;
    r = Math.floor(r * factor);
    g = Math.floor(g * factor);
    b = Math.floor(b * factor);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }
  return hex;
}

// Estado global da aplicação

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

// Esta é a API publicada no Google Apps Script.
// O arquivo apps_script/Code.gs é só a cópia versionada do código que roda nessa URL.
const API_URL =
  "https://script.google.com/macros/s/AKfycbydWZzphnDnAeH4panv0GLfUrInDrZuPzUAQLxsGF7-15l6ldxkzs6f4kZMKO5vSL7h/exec".trim();

// Estado global da aplicação

const profileScreen = document.querySelector("#profileScreen");
const dashboard = document.querySelector("#dashboard");
const profileSelection = document.querySelector("#profileSelection");
const profileGrid = document.querySelector("#profileGrid");
const profileForm = document.querySelector("#profileForm");
const profileNameInput = document.querySelector("#profileNameInput");
const profileMessage = document.querySelector("#profileMessage");
const notificationButton = document.querySelector("#notificationButton");
const notificationStatus = document.querySelector("#notificationStatus");
const changeProfileButton = document.querySelector("#changeProfileButton");
const personName = document.querySelector("#personName");
const summaryCount = document.querySelector("#summaryCount");
const summaryLabel = document.querySelector("#summaryLabel");
const totalMonthAmount = document.querySelector("#totalMonthAmount");
const subscriptionList = document.querySelector("#subscriptionList");
const detailsPanel = document.querySelector("#detailsPanel");
const detailsLoadingState = document.querySelector("#detailsLoadingState");
const detailsContent = document.querySelector("#detailsContent");
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
const syncSheetsButton = document.querySelector("#syncSheetsButton");
const notificationModal = document.querySelector("#notificationModal");
const closeNotificationModal = document.querySelector(
  "#closeNotificationModal",
);
const allowNotificationsButton = document.querySelector(
  "#allowNotificationsButton",
);
const tutorialButton = document.querySelector("#tutorialButton");
const tutorialModal = document.querySelector("#tutorialModal");
const closeTutorialModal = document.querySelector("#closeTutorialModal");
const adminButton = document.querySelector("#adminButton");
const adminScreen = document.querySelector("#adminScreen");
const backFromAdminButton = document.querySelector("#backFromAdminButton");
const adminServicesList = document.querySelector("#adminServicesList");
const adminProfilesList = document.querySelector("#adminProfilesList");
const addServiceButton = document.querySelector("#addServiceButton");
const addProfileButton = document.querySelector("#addProfileButton");
const adminSharedModal = document.querySelector("#adminSharedModal");
const closeAdminModal = document.querySelector("#closeAdminModal");
const adminModalBody = document.querySelector("#adminModalBody");
const adminModalTitle = document.querySelector("#adminModalTitle");
const adminModalSaveButton = document.querySelector("#adminModalSaveButton");
const adminModalCancelButton = document.querySelector(
  "#adminModalCancelButton",
);
const adminModalDeleteButton = document.querySelector(
  "#adminModalDeleteButton",
);

let currentAdminContext = null;

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

loadAdminSettings();
// Removidos os inícios antigos, agora usamos o initApp()
bindEvents();
checkInitialNotificationPermission();
// restoreProfile();
// renderProfileSelection();
// checkInitialNotificationPermission();
// Aguarda uma fração de segundo para garantir que o HTML carregou e roda a nova função
setTimeout(() => {
  initApp();
}, 100);

function checkInitialNotificationPermission() {
  const capability = getNotificationCapability();
  if (!capability.available) return;

  if (Notification.permission === "default") {
    notificationModal.classList.remove("is-hidden");
  }
}

function bindEvents() {
  // --- CLIQUE PARA ABRIR A FATURA ---
  document.querySelector(".id-total-pill").addEventListener("click", () => {
    if (state.currentPersonKey) {
      openInvoiceModal(state.currentPersonKey);
    }
  });

  document.querySelector("#closeInvoiceModal").addEventListener("click", () => {
    document.querySelector("#invoiceModal").classList.add("is-hidden");
  });

  document.addEventListener("click", (event) => {
    if (event.target === document.querySelector("#invoiceModal")) {
      document.querySelector("#invoiceModal").classList.add("is-hidden");
    }
  });
  // ----------------------------------

  // (aqui continua o resto do seu bindEvents que já existe...)
  profileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleProfileSubmit();
  });

  notificationButton.addEventListener("click", () => {
    const capability = getNotificationCapability();
    if (capability.available && Notification.permission === "default") {
      notificationModal.classList.remove("is-hidden");
    } else {
      void requestNotificationAccess();
    }
  });

  closeNotificationModal.addEventListener("click", () => {
    notificationModal.classList.add("is-hidden");
  });

  tutorialButton.addEventListener("click", () => {
    tutorialModal.classList.remove("is-hidden");
  });

  closeTutorialModal.addEventListener("click", () => {
    tutorialModal.classList.add("is-hidden");
  });

  tutorialModal.addEventListener("click", (event) => {
    if (event.target === tutorialModal) {
      tutorialModal.classList.add("is-hidden");
    }
  });

  allowNotificationsButton.addEventListener("click", async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "default") {
        notificationModal.classList.add("is-hidden");
        updateNotificationButton();
        if (state.currentPersonKey) {
          updateNotificationStatus();
        }
        if (permission === "granted") {
          await registerServiceWorker();
          if (state.currentPersonKey) {
            await checkPaymentReminders();
          }
        }
      }
    } catch {
      notificationModal.classList.add("is-hidden");
    }
  });

  upcomingPanel.addEventListener("click", async (event) => {
    const testButton = event.target.closest("[data-test-notification]");
    const calendarButton = event.target.closest("[data-add-calendar]");
    const markButton = event.target.closest("[data-mark-paid]");

    if (testButton) {
      void showTestNotification();
    }

    if (calendarButton) {
      openGoogleCalendarEvent();
    }
    if (markButton) {
      if (!state.currentPersonKey) {
        setNotificationStatus(
          "Selecione um perfil antes de marcar pagamentos.",
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
        markButton.classList.add("pulse-success");
        setTimeout(() => markButton.classList.remove("pulse-success"), 600);
        await unmarkPayment(state.currentPersonKey, payment);
        setNotificationStatus("Parcela desmarcada como paga.");
      } else {
        markButton.classList.add("pulse-success");
        setTimeout(() => markButton.classList.remove("pulse-success"), 600);
        await markPaymentAsPaid(state.currentPersonKey, payment);
        setNotificationStatus("Parcela marcada como paga.");
      }
    }
  });

  fullPanel.addEventListener("click", async (event) => {
    const toggleButton = event.target.closest("[data-toggle-paid]");
    if (!toggleButton) return;

    if (!state.currentPersonKey) {
      setNotificationStatus("Selecione um perfil antes de marcar pagamentos.");
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
      toggleButton.classList.add("pulse-success");
      setTimeout(() => toggleButton.classList.remove("pulse-success"), 600);
      await unmarkPayment(personKey, payment);
      setNotificationStatus("Parcela desmarcada como paga.");
    } else {
      toggleButton.classList.add("pulse-success");
      setTimeout(() => toggleButton.classList.remove("pulse-success"), 600);
      await markPaymentAsPaid(personKey, payment);
      setNotificationStatus("Parcela marcada como paga.");
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
    if (state.selectedYear <= 2026) {
      return;
    }
    state.selectedYear -= 1;
    renderDetails();
  });

  nextYearButton.addEventListener("click", () => {
    state.selectedYear += 1;
    renderDetails();
  });

  syncSheetsButton.addEventListener("click", async () => {
    if (syncSheetsButton.classList.contains("is-syncing")) return;

    syncSheetsButton.classList.add("is-syncing");
    syncSheetsButton.disabled = true;

    try {
      await fetchPaidLogs();
      setNotificationStatus("Dados sincronizados com sucesso.", true);
    } catch (error) {
      console.error("Erro na sincronização manual:", error);
      setNotificationStatus(
        error.message || "Erro ao sincronizar. Tente novamente.",
        true,
      );
    } finally {
      syncSheetsButton.classList.remove("is-syncing");
      syncSheetsButton.disabled = false;
    }
  });

  window.addEventListener("focus", () => {
    refreshCurrentDates();
    void (async () => {
      await fetchPaidLogs().catch(() => {});
      void checkPaymentReminders();
    })();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refreshCurrentDates();
      void (async () => {
        await fetchPaidLogs().catch(() => {});
        void checkPaymentReminders();
      })();
    }
  });

  adminButton.addEventListener("click", () => {
    dashboard.classList.add("is-hidden");
    adminScreen.classList.remove("is-hidden");
    renderAdminScreen();
  });

  backFromAdminButton.addEventListener("click", () => {
    adminScreen.classList.add("is-hidden");
    dashboard.classList.remove("is-hidden");
    refreshCurrentDates();
  });

  addServiceButton.addEventListener("click", () =>
    openAdminModalForService(null),
  );
  addProfileButton.addEventListener("click", () =>
    openAdminModalForProfile(null),
  );

  closeAdminModal.addEventListener("click", () =>
    adminSharedModal.classList.add("is-hidden"),
  );
  adminModalCancelButton.addEventListener("click", () =>
    adminSharedModal.classList.add("is-hidden"),
  );

  adminModalSaveButton.addEventListener("click", handleAdminSave);
  adminModalDeleteButton.addEventListener("click", handleAdminDelete);
}

async function handleProfileSubmit() {
  const personKey = findPersonKey(profileNameInput.value);
  profileMessage.textContent = "";

  if (!personKey) {
    profileMessage.textContent = getNameError(profileNameInput.value);
    profileNameInput.focus();
    return;
  }

  // saveProfile(personKey);
  // openDashboard(personKey);
  handleProfileClick(personKey);
}

function restoreProfile() {
  const personKey = getSavedProfile();

  updateNotificationButton();

  if (!personKey || !PEOPLE[personKey]) {
    profileScreen.classList.remove("is-hidden");
    dashboard.classList.add("is-hidden");
    notificationButton.classList.add("is-hidden");
    changeProfileButton.classList.add("is-hidden");
    if (adminButton) adminButton.classList.add("is-hidden");
    renderProfileSelection();
    return;
  }

  openDashboard(personKey);
}

function renderProfileSelection() {
  if (!profileGrid) return;

  // Se o grupo foi recém-criado e não tem ninguém, mostra o botão de configurar
  if (Object.keys(PEOPLE).length === 0) {
    profileGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 24px; border: 1px dashed rgba(255,255,255,0.2); border-radius: 12px; max-width: 400px; margin: 0 auto;">
        <strong style="display: block; font-size: 1.2rem; margin-bottom: 8px;">Seu grupo está vazio!</strong>
        <span style="color: var(--muted); font-size: 0.9rem;">Para começar, você precisa cadastrar os perfis das pessoas e as assinaturas que vão dividir.</span>
        <button type="button" class="primary-button" id="btnStartAdmin" style="margin-top: 16px; padding: 10px 20px;">Configurar meu Grupo</button>
      </div>
    `;
    document.getElementById("btnStartAdmin").addEventListener("click", () => {
      profileScreen.classList.add("is-hidden");
      adminScreen.classList.remove("is-hidden");
      renderAdminScreen();
    });
    return;
  }

  // Se já tiver gente, mostra os botões coloridos normalmente
  profileGrid.innerHTML = Object.entries(PEOPLE)
    .map(
      ([key, person]) => `
      <button class="profile-item" type="button" data-person="${key}">
        <div class="profile-avatar" style="background-color: ${person.color}">${person.avatar}</div>
        <span class="profile-name">${person.name}</span>
      </button>
    `,
    )
    .join("");

  profileGrid.querySelectorAll(".profile-item").forEach((button) => {
    button.addEventListener("click", () => {
      const personKey = button.dataset.person;
      if (personKey && PEOPLE[personKey]) {
        handleProfileClick(personKey);
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
  dashboard.classList.add("is-hidden");
  subscriptionList.classList.remove("is-ready");
  detailsPanel.classList.add("is-hidden");
  notificationButton.classList.add("is-hidden");
  changeProfileButton.classList.add("is-hidden");
  if (adminButton) adminButton.classList.add("is-hidden");
  yearControls.classList.add("is-hidden");
  profileScreen.classList.remove("is-hidden");
  renderProfileSelection();
  if (profileNameInput) profileNameInput.value = "";
  if (profileMessage) profileMessage.textContent = "";
}

async function openDashboard(personKey) {
  let person = PEOPLE[personKey];
  if (!person) {
    // Tenta encontrar por alias se a chave mudou na sincronização
    const alternateKey = Object.keys(PEOPLE).find(
      (k) => PEOPLE[k].aliases?.includes(personKey) || k === personKey,
    );
    if (alternateKey) {
      personKey = alternateKey;
      person = PEOPLE[personKey];
    }
  }

  if (!person) {
    console.error("Perfil não encontrado:", personKey);
    changeProfile();
    return;
  }

  state.currentPersonKey = personKey;
  state.selectedServiceKey = null;
  state.selectedYear = getToday().getFullYear();

  personName.textContent = person.name;
  summaryCount.textContent = person.subscriptions.length;
  summaryLabel.textContent =
    person.subscriptions.length === 1 ? "assinatura" : "assinaturas";
  profileScreen.classList.add("is-hidden");
  dashboard.classList.remove("is-hidden");
  changeProfileButton.classList.remove("is-hidden");
  detailsPanel.classList.add("is-hidden");

  if (person.isAdmin) {
    adminButton.classList.remove("is-hidden");
  } else {
    adminButton.classList.add("is-hidden");
  }

  // Inicializa com dados locais IMEDIATAMENTE
  paidLogsCache = getPaidLogs();
  updateMonthlyTotal(personKey);
  subscriptionList.classList.remove("is-ready");

  renderSubscriptionCards(personKey);

  // Marca como ready após o primeiro render para evitar redunância de animação no sync
  setTimeout(() => {
    subscriptionList.classList.add("is-ready");
  }, 1000);

  updateNotificationButton();
  updateNotificationStatus();

  // Tenta sincronizar "no fundo"
  void (async () => {
    try {
      const isSyncingManual = syncSheetsButton.classList.contains("is-syncing");
      if (!isSyncingManual) {
        setNotificationStatus("Sincronizando...");
      }

      await fetchPaidLogs();

      // fetchPaidLogs já chama updateUIAfterSync que renderiza

      if (!isSyncingManual) {
        setNotificationStatus("");
      }
    } catch (error) {
      console.error("Sincronização em segundo plano falhou:", error);
      // Não mostramos erro gritante aqui para não atrapalhar o uso dos dados locais
      if (
        notificationStatus &&
        notificationStatus.textContent === "Sincronizando..."
      ) {
        setNotificationStatus("Modo offline (dados locais)");
      }
    } finally {
      void checkPaymentReminders();
    }
  })();

  startSessionLoops();
}

function renderSubscriptionCards(personKey) {
  const person = PEOPLE[personKey];

  // Buscar ordem salva (Nuvem ou Local)
  let savedOrder = getSavedSubscriptionOrder(personKey);

  let sortedServices;
  if (savedOrder && savedOrder.length > 0) {
    // Filtrar apenas assinaturas que a pessoa realmente tem e que existam em SERVICES
    sortedServices = savedOrder.filter(
      (s) => person.subscriptions.includes(s) && SERVICES[s],
    );
    // Adicionar novas assinaturas que não estavam na ordem salva
    const missing = person.subscriptions.filter(
      (s) => !sortedServices.includes(s) && SERVICES[s],
    );
    sortedServices = [...sortedServices, ...missing];
  } else {
    // Padrão alfabético
    sortedServices = [...person.subscriptions]
      .filter((s) => SERVICES[s])
      .sort((a, b) =>
        SERVICES[a].name.localeCompare(SERVICES[b].name, "pt-BR"),
      );
  }

  // Preserve detailsPanel if it has been moved inside subscriptionList
  if (detailsPanel.parentElement === subscriptionList) {
    subscriptionList.insertAdjacentElement("afterend", detailsPanel);
  }

  subscriptionList.innerHTML = sortedServices
    .map((serviceKey) => createSubscriptionCard(serviceKey, personKey))
    .join("");

  subscriptionList.querySelectorAll(".subscription-card").forEach((card) => {
    card.addEventListener("click", () => {
      void openServiceDetails(card.dataset.service);
    });
  });

  if (state.selectedServiceKey) {
    document.querySelectorAll(".subscription-card").forEach((card) => {
      card.classList.toggle(
        "is-selected",
        card.dataset.service === state.selectedServiceKey,
      );
    });
    positionDetailsPanel();
  }
}

function getSavedSubscriptionOrder(personKey) {
  // 1. Tentar da Nuvem (Configuracoes ou Logs) - Pegar o mais recente pelo timestamp
  if (paidLogsCache[personKey]) {
    const orderKeys = Object.keys(paidLogsCache[personKey])
      .filter((k) => k.includes(":ui_order|"))
      .sort()
      .reverse();

    if (orderKeys.length > 0) {
      try {
        const winningKey = orderKeys[0];
        const segments = winningKey.split("|");
        if (segments.length >= 3) {
          // A ordem está do index 2 em diante (pode conter vírgulas)
          const listStr = segments.slice(2).join("|").trim();
          if (listStr) {
            const arr = listStr
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            return Array.from(new Set(arr));
          }
        }
      } catch (e) {
        console.warn("Erro ao processar ordem da nuvem:", e);
      }
    }
  }

  // 2. Tentar LocalStorage
  const local = localStorage.getItem(`${STORAGE_KEYS.order}-${personKey}`);
  if (local) {
    try {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed)) {
        const arr = parsed.map((s) => s.trim()).filter(Boolean);
        return Array.from(new Set(arr));
      }
    } catch {
      return null;
    }
  }

  return null;
}

function updateMonthlyTotal(personKey) {
  if (!totalMonthAmount) return;

  const person = PEOPLE[personKey];
  if (!person) return;

  const today = startOfDay(getToday());
  let activeMonth = today.getMonth();
  let activeYear = today.getFullYear();

  // Se já passou do dia de vencimento, a nossa "fatura" vira a do mês que vem.
  if (today.getDate() > SETTINGS.dueDay) {
    activeMonth += 1;
    if (activeMonth > 11) {
      activeMonth = 0;
      activeYear += 1;
    }
  }

  // Essa é a nossa Data Limite de Cobrança.
  // Ex: Se hoje for 11/05, a data limite será 10/06.
  const activeCutoffDate = createPaymentDate(activeYear, activeMonth);

  let total = 0;

  person.subscriptions.forEach((serviceKey) => {
    // Puxa uma lista de até 12 parcelas (vencidas e futuras)
    const payments = getUpcomingPaymentsForPerson(serviceKey, personKey, 12);

    payments.forEach((payment) => {
      const isPaid = isPaymentPaid(personKey, payment);

      // Se NÃO está pago, E a data da parcela for menor ou igual ao nosso limite
      if (!isPaid && payment.date <= activeCutoffDate) {
        total += payment.amount;
      }
    });
  });

  totalMonthAmount.textContent = moneyFormatter.format(total);
}

function createSubscriptionCard(serviceKey, personKey) {
  const service = SERVICES[serviceKey];
  const nextPayment = getNextPayment(serviceKey, personKey);
  const paid = nextPayment ? isPaymentPaid(personKey, nextPayment) : false;

  const dateText = nextPayment
    ? formatShortDate(nextPayment.date)
    : "Sem data restante";
  const amountText = moneyFormatter.format(service.amount);
  const statusPill = paid
    ? '<span class="status-pill status-pago" style="margin-left: 8px; vertical-align: middle;">Pago</span>'
    : "";

  const participantsHtml = (service.participants || [])
    .map((pKey) => {
      const p = PEOPLE[pKey];
      return p
        ? `<span class="card-participant-avatar" style="background-color: ${p.color};" title="${p.name}">${p.avatar}</span>`
        : "";
    })
    .join("");

  const cardStyleParts = [];
  if (service.color) cardStyleParts.push(`background-color: ${service.color}`);
  if (service.logoUrl)
    cardStyleParts.push(`--card-logo: url('${service.logoUrl}')`);
  const overrideStyle =
    cardStyleParts.length > 0 ? `style="${cardStyleParts.join("; ")}"` : "";

  const symbolHtml = `<span class="service-symbol">${service.shortName}</span>`;

  return `
    <button class="subscription-card ${service.cssClass}${paid ? " is-paid" : ""}" type="button" data-service="${serviceKey}" ${overrideStyle}>
      <span class="subscription-top">
        <span class="subscription-title-container">
          <span class="subscription-title">
            ${symbolHtml}
            <strong>${service.name} ${statusPill}</strong>
          </span>
          <span class="subscription-participants">
            ${participantsHtml}
          </span>
        </span>
        <span class="share-type">${service.modelLabel}</span>
      </span>

      <span class="payment-line">
        <span>
          <span>${paid ? "Data paga" : "Próxima data"}</span>
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

  if (!service || !person) {
    if (detailsPanel) detailsPanel.classList.add("is-hidden");
    return;
  }

  document.querySelectorAll(".subscription-card").forEach((card) => {
    card.classList.toggle("is-selected", card.dataset.service === serviceKey);
  });

  detailsService.textContent = service.name;
  detailsTitle.textContent = `${person.name}, estes são os pagamentos dessa assinatura`;

  // Aplicar cores dinâmicas ao painel de detalhes
  const panelStyleParts = [];
  if (service.color) panelStyleParts.push(`background-color: ${service.color}`);
  detailsPanel.setAttribute("style", panelStyleParts.join("; "));

  detailsPanel.className = "details-panel is-hidden";
  detailsPanel.classList.add(`details-${serviceKey}`);
  detailsPanel.classList.add("is-custom-service"); // Força o tema escuro genérico
  detailsPanel.classList.remove("is-hidden");

  // Exibir loading e esconder conteúdo
  detailsContent.classList.add("is-hidden");
  detailsLoadingState.classList.remove("is-hidden");

  positionDetailsPanel();

  setActiveTab("upcoming");

  // Renderizar imediatamente com dados do cache enquanto busca do servidor
  renderDetails();

  try {
    await fetchPaidLogs();
    renderDetails();
  } finally {
    // Esconder loading e mostrar conteúdo
    detailsLoadingState.classList.add("is-hidden");
    detailsContent.classList.remove("is-hidden");

    // Pequeno delay para garantir que o layout mobile se ajustou se o conteúdo for grande
    setTimeout(() => {
      detailsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
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
    .map((personKey) => `<th>${PEOPLE[personKey]?.name || personKey}</th>`)
    .join("");

  const rows = getYearMonths(year)
    .map((date) => {
      const status = getDateStatus(date);
      const currentPersonPaid = state.currentPersonKey
        ? isPaymentPaid(state.currentPersonKey, { serviceKey, date })
        : false;
      const rowStatus = currentPersonPaid ? "pago" : status;
      const statusClass =
        rowStatus === "atrasada"
          ? " status-atrasada"
          : rowStatus === "pago"
            ? " status-pago"
            : rowStatus === "futuro"
              ? " status-futuro"
              : "";

      const participantCells = service.participants
        .map((participantKey) => {
          const paid = isPaymentPaid(participantKey, { serviceKey, date });
          const innerContent = paid
            ? `<div class="status-actions"><span class="status-pill status-pago">pago</span></div>`
            : `<div class="status-actions"><span class="amount">${moneyFormatter.format(service.amount)}</span></div>`;
          return `<td data-label="${PEOPLE[participantKey]?.name || participantKey}">${innerContent}</td>`;
        })
        .join("");

      return `
        <tr>
          <td data-label="Mês">${capitalize(MONTHS[date.getMonth()])}</td>
          <td data-label="Data">${formatLongDate(date)}</td>
          ${participantCells}
          <td data-label="Status"><div class="status-actions"><span class="status-pill${statusClass}">${rowStatus}</span></div></td>
        </tr>
      `;
    })
    .join("");

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
      const payerKey = getRotationPayer(serviceKey, date.getMonth());
      const baseStatus = getDateStatus(date);
      const paid = isPaymentPaid(payerKey, { serviceKey, date });
      const status = paid ? "pago" : baseStatus;
      const statusClass =
        status === "atrasada"
          ? " status-atrasada"
          : status === "pago"
            ? " status-pago"
            : status === "futuro"
              ? " status-futuro"
              : "";
      return `
        <tr>
          <td data-label="Mês">${capitalize(MONTHS[date.getMonth()])}</td>
          <td data-label="Data">${formatLongDate(date)}</td>
          <td data-label="Responsável">${PEOPLE[payerKey]?.name || payerKey}</td>
          <td data-label="Valor"><span class="amount">${moneyFormatter.format(SERVICES[serviceKey].amount)}</span></td>
          <td data-label="Status"><div class="status-actions"><span class="status-pill${statusClass}">${status}</span></div></td>
        </tr>
      `;
    })
    .join("");

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

  // Retrocede 2 meses para pegar parcelas vencidas
  const startYear = today.getFullYear();
  const startMonth = today.getMonth() - 2;

  // O MARCO ZERO DO SISTEMA: 1º de Maio de 2026
  const systemStart = new Date(2026, 4, 1);

  // Expande de 120 para 240 meses (20 anos) garantindo que vai encontrar algo, além de logging interno.
  let futureCount = 0;
  for (let offset = 0; offset < 240 && futureCount < limit; offset += 1) {
    const monthIndex = startMonth + offset;
    const year = startYear + Math.floor(monthIndex / 12);
    const normalizedMonth = ((monthIndex % 12) + 12) % 12;
    const date = createPaymentDate(year, normalizedMonth);

    // IGNORA COMPLETAMENTE TUDO QUE FOR ANTES DE MAIO DE 2026
    if (date < systemStart) {
      continue;
    }

    // Se for no futuro, adicionamos
    // Se for no passado, SÓ adicionamos se NÃO estiver pago
    const isFuture = date.getTime() >= today.getTime();
    const paid = isPaymentPaid(personKey, { serviceKey, date });

    if (!isFuture && paid) {
      continue;
    }

    if (personPaysInMonth(serviceKey, personKey, monthIndex)) {
      payments.push({
        serviceKey,
        date,
        amount: SERVICES[serviceKey]?.amount ?? 0,
      });

      if (isFuture) {
        futureCount += 1;
      }
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
      "Não há pagamento futuro para adicionar ao Google Agenda.",
    );
    return;
  }

  const calendarUrl = createGoogleCalendarUrl(
    state.currentPersonKey,
    state.selectedServiceKey,
    nextPayment.date,
  );

  // Abrimos em uma nova aba/contexto para evitar que a navegação ocorra na aba atual do app.
  // Em dispositivos móveis, o sistema interceptará o link e abrirá o aplicativo do Google Agenda.
  // Ao fechar o app, o usuário voltará para esta aba intacta.
  window.open(calendarUrl, "_blank", "noopener");

  setNotificationStatus("O Google Agenda foi aberto. Revise e salve o evento.");
}

function createGoogleCalendarUrl(personKey, serviceKey, startDate) {
  const person = PEOPLE[personKey];
  const service = SERVICES[serviceKey];
  if (!person || !service) return "#";

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
  return SERVICES[serviceKey].model === "rotation"
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
  if (!service) return false;

  const matchPKey = findPersonKey(personKey) || personKey.toLowerCase();

  if (service.model === "monthly") {
    const participantsKeys = (service.participants || []).map(
      (p) => findPersonKey(p) || p.toLowerCase(),
    );
    return participantsKeys.includes(matchPKey);
  }

  const rotationPayer = getRotationPayer(serviceKey, monthIndex);
  if (!rotationPayer) return false;

  return (
    (findPersonKey(rotationPayer) || rotationPayer.toLowerCase()) === matchPKey
  );
}

function getRotationPayer(serviceKey, monthIndex) {
  const service = SERVICES[serviceKey];
  if (!service) return null;
  let rotation = service.participants || [];

  if (serviceKey === "max") {
    rotation = SETTINGS.maxRotation;
  }

  if (rotation.length === 0) return null;

  const offset = monthIndex - SETTINGS.maxRotationStartMonth;
  const rotationIndex =
    ((offset % rotation.length) + rotation.length) % rotation.length;
  return rotation[rotationIndex]?.toLowerCase();
}

function getYearMonths(year) {
  const months = Array.from({ length: 12 }, (_, monthIndex) =>
    createPaymentDate(year, monthIndex),
  );

  // Se for o ano de lançamento (2026), oculta tudo antes de Maio (mês 4 no JavaScript)
  if (year === 2026) {
    return months.filter((date) => date.getMonth() >= 4);
  }

  // Impede que o sistema gere calendários para 2025 ou anos anteriores
  if (year < 2026) {
    return [];
  }

  return months;
}

function createPaymentDate(year, monthIndex) {
  return new Date(year, monthIndex, SETTINGS.dueDay);
}

function getDateStatus(date) {
  const today = startOfDay(getToday());
  const paymentDate = startOfDay(date);

  if (paymentDate < today) {
    return "atrasada";
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
  // Trava o botão de voltar quando chegar no ano de criação (2026)
  previousYearButton.disabled = state.selectedYear <= 2026;
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
    if (Notification.permission === "default") {
      setNotificationStatus(
        "O navegador deve abrir o pedido de permissão agora.",
      );
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
      "As notificações estão bloqueadas. Libere nas configurações do navegador para este site.",
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
        "Permissão concedida, mas o service worker não foi registrado. No Android, abra pelo GitHub Pages em HTTPS.",
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
    setNotificationButtonState("unavailable");
    return;
  }

  if (Notification.permission === "granted") {
    setNotificationButtonState("enabled");
    return;
  }

  if (Notification.permission === "denied") {
    setNotificationButtonState("blocked");
    return;
  }

  setNotificationButtonState("prompt");
}

function setNotificationButtonState(stateName) {
  const stateConfig = {
    unavailable: {
      icon: `<img src="icones/icons8-no-reminders-100.png" class="top-icon" alt="" />`,
      ariaLabel: "Notificações indisponíveis neste dispositivo",
      title: "Notificações indisponíveis",
      disabled: true,
    },
    enabled: {
      icon: `<img src="icones/icons8-notification-100.png" class="top-icon" alt="" />`,
      ariaLabel: "Notificações ativas",
      title: "Notificações ativas",
      disabled: false,
    },
    blocked: {
      icon: `<img src="icones/icons8-no-reminders-100.png" class="top-icon" alt="" />`,
      ariaLabel: "Notificações bloqueadas",
      title: "Notificações bloqueadas",
      disabled: true,
    },
    prompt: {
      icon: `<img src="icones/icons8-notification-100.png" class="top-icon" alt="" />`,
      ariaLabel: "Ativar notificações",
      title: "Ativar notificações",
      disabled: false,
    },
  };

  const config = stateConfig[stateName] || stateConfig.prompt;

  notificationButton.innerHTML = config.icon;
  notificationButton.setAttribute("aria-label", config.ariaLabel);
  notificationButton.title = config.title;
  notificationButton.disabled = config.disabled;
}

function updateNotificationStatus() {
  if (!state.currentPersonKey) {
    setNotificationStatus("");
    return;
  }

  // We intentionally leave the notification status empty by default.
  // The notification icon in the topbar and the modal handle the UX.
  // Status text should only be used for transient feedback (like 'Parcela paga').
  setNotificationStatus("");
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
    await syncLogsFromSW();
    const personKey = state.currentPersonKey;
    const logs = getNotificationLogs();
    const personLog = logs[personKey] ?? {};
    const rawReminders = getReminderCandidates(personKey);
    const remindersToProcess = rawReminders.filter(
      (payment) =>
        !personLog[getReminderNotificationKey(payment)] &&
        !isPaymentPaid(personKey, payment),
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
          date: payment.date,
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
          "Não foi possível exibir um lembrete agora. Use o botão de teste para diagnosticar.",
        );
      }
    }

    void syncRemindersToSW();
  } finally {
    reminderCheckInProgress = false;
  }
}

async function syncRemindersToSW() {
  if (!("caches" in window) || !state.currentPersonKey) return;

  const reminders = {
    personKey: state.currentPersonKey,
    personName: PEOPLE[state.currentPersonKey].name,
    candidates: PEOPLE[state.currentPersonKey].subscriptions.flatMap(
      (serviceKey) =>
        getUpcomingPaymentsForPerson(
          serviceKey,
          state.currentPersonKey,
          12,
        ).map((payment) => ({
          serviceKey: payment.serviceKey,
          serviceName: SERVICES[payment.serviceKey].name,
          dateMs: payment.date.getTime(),
          amount: payment.amount,
          baseKey: getPaymentNotificationKey(payment),
        })),
    ),
    logs: getNotificationLogs()[state.currentPersonKey] ?? {},
    paidLogs: getPaidLogs()[state.currentPersonKey] ?? {},
    settings: {
      reminderDaysBefore: SETTINGS.reminderDaysBefore,
    },
  };

  try {
    const cache = await caches.open("payment-reminders-data");
    await cache.put(
      "/reminders.json",
      new Response(JSON.stringify(reminders), {
        headers: { "Content-Type": "application/json" },
      }),
    );
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
  const serviceNames = group.payments
    .map((p) => SERVICES[p.serviceKey].name)
    .join(", ");
  const whenPlural =
    group.daysUntil === 0
      ? "vencem hoje"
      : `vencem em ${group.daysUntil} ${group.daysUntil === 1 ? "dia" : "dias"}`;
  const whenSingular =
    group.daysUntil === 0
      ? "vence hoje"
      : `vence em ${group.daysUntil} ${group.daysUntil === 1 ? "dia" : "dias"}`;

  const title =
    group.payments.length === 1
      ? `${serviceNames}: pagamento ${whenSingular}`
      : `Assinaturas: pagamentos ${whenPlural}`;

  let body = "";
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

  setNotificationStatus("Preparando a notificação de teste...");
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
      "Notificação de teste enviada. Se ela não apareceu, confira as notificações do navegador e do sistema operacional.",
    );
  } catch {
    setNotificationStatus(
      "A permissão foi concedida, mas o navegador não exibiu a notificação. No Android, teste pelo endereço HTTPS do GitHub Pages.",
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
      .then(async (reg) => {
        await navigator.serviceWorker.ready;
        if ("periodicSync" in reg) {
          try {
            const status = await navigator.permissions.query({
              name: "periodic-background-sync",
            });
            if (status.state === "granted") {
              await reg.periodicSync.register("check-payments", {
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

function setNotificationStatus(message, showAsSystem = false) {
  if (notificationStatus) {
    notificationStatus.textContent = message;
  }

  if (showAsSystem && message) {
    const title =
      message.includes("erro") ||
      message.includes("Falha") ||
      message.includes("Erro")
        ? "Aviso de Sincronização"
        : "Sincronização";
    showBrowserNotification(title, {
      body: message,
      icon: "/App-icon.png",
      tag: "sync-status",
      renotify: true,
    }).catch((err) =>
      console.warn("Não foi possível exibir notificação do sistema:", err),
    );
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
  if (!("caches" in window) || !state.currentPersonKey) return;
  try {
    const cache = await caches.open("payment-reminders-data");
    const response = await cache.match("/reminders.json");
    if (response) {
      const data = await response.json();
      if (data && data.logs) {
        const localLogs = readJson(STORAGE_KEYS.notifications, {});
        localLogs[state.currentPersonKey] = {
          ...localLogs[state.currentPersonKey],
          ...data.logs,
        };
        saveNotificationLogs(localLogs);
      }
    }
  } catch (err) {}
}

function saveNotificationLogs(logs) {
  writeJson(STORAGE_KEYS.notifications, logs);
}

function savePaidLogs(logs) {
  writeJson(STORAGE_KEYS.paid, logs);
}

function isValidPaidLogsResponse(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;

  // Ignorar chaves de metadados conhecidas do Google Apps Script
  const metadataKeys = [
    "success",
    "ok",
    "action",
    "error",
    "message",
    "status",
  ];

  // Se tiver um erro explícito do servidor, não é um log válido para processar
  if (data.success === false) return false;

  const dataKeys = Object.keys(data).filter((k) => !metadataKeys.includes(k));

  // É válido se as chaves de dados forem objetos
  return dataKeys.every((key) => {
    const val = data[key];
    if (val === null) return true;
    if (typeof val !== "object" || Array.isArray(val)) return true; // Ignoramos chaves simples
    return true;
  });
}

function normalizePaidLogs(data) {
  const result = {};
  const metadataKeys = [
    "success",
    "ok",
    "action",
    "error",
    "message",
    "status",
  ];

  Object.entries(data).forEach(([personKey, personLogs]) => {
    // Normalizar a chave da pessoa usando a lógica do app (mapeamento + fallback)
    const normPKey =
      findPersonKey(personKey) ||
      normalizeName(personKey).replace(/[\s-]+/g, "_");

    if (!normPKey || metadataKeys.includes(normPKey)) return;
    if (
      typeof personLogs !== "object" ||
      personLogs === null ||
      Array.isArray(personLogs)
    )
      return;

    result[normPKey] = {};

    Object.entries(personLogs).forEach(([paymentKey, paidAt]) => {
      let normalizedPaymentKey = String(paymentKey || "").trim();
      if (!normalizedPaymentKey) return;

      // Se for uma chave de pagamento (contém ':'), normalizar a parte do serviço
      if (
        normalizedPaymentKey.includes(":") &&
        !normalizedPaymentKey.includes("site_settings")
      ) {
        const parts = normalizedPaymentKey.split(":");
        const sKey = findServiceKey(parts[0]);
        const date = parts.slice(1).join(":");
        normalizedPaymentKey = `${sKey}:${date}`;
      }

      const s = paidAt === undefined || paidAt === null ? "" : String(paidAt);
      if (s && s.startsWith("!")) return;
      if (s) result[normPKey][normalizedPaymentKey] = "true";
    });
  });

  return result;
}

function rowsArrayToLogs(rows) {
  const logs = {};
  if (!Array.isArray(rows)) return logs;
  rows.forEach((row) => {
    try {
      // Usar as chaves exatas que o Apps Script retorna (camelCase)
      const pKey = row.personKey;
      const payKey = row.paymentKey;

      if (!pKey || !payKey) return;

      // Status de pagamento seguindo a lógica do normalizeBoolean do Code.gs
      const p = row.pago !== undefined ? row.pago : row.paid;
      const isPaid =
        p === true ||
        String(p).toLowerCase() === "true" ||
        String(p).toLowerCase() === "sim" ||
        String(p) === "1" ||
        String(p).toLowerCase() === "pago";

      if (isPaid) {
        logs[pKey] = logs[pKey] || {};
        logs[pKey][payKey] = "true";
      }
    } catch (e) {
      // ignorar linha problemática
    }
  });
  return logs;
}

async function fetchPaidLogs() {
  if (!state.groupId) return;

  try {
    // Agora só pedimos para o Script: "Me dá os dados do grupo X"
    const url = `${API_URL}?action=carregar_dados&id_grupo=${state.groupId}`;
    const res = await fetch(url);
    const data = await res.json();

    // Se o Script devolver com sucesso, a gente processa e atualiza a tela
    if (data.success) {
      if (data.nome_grupo) salvarGrupo(state.groupId, data.nome_grupo);
      processarDadosDaPlanilha(data);
      updateUIAfterSync();
    }
  } catch (e) {
    console.warn("Erro na sincronização", e);
  }
}

function updateUIAfterSync() {
  loadAdminSettings();

  if (state.currentPersonKey) {
    refreshCurrentDates();
    renderSubscriptionCards(state.currentPersonKey);
    if (state.selectedServiceKey) renderDetails();
    void syncRemindersToSW();
  }
}

async function markPaymentAsPaid(personKey, payment) {
  const paymentKey = getPaymentNotificationKey(payment);
  // Atualização otimista na UI (Salva na hora na tela)
  paidLogsCache[personKey] = paidLogsCache[personKey] ?? {};
  paidLogsCache[personKey][paymentKey] = "true";
  savePaidLogs(paidLogsCache);
  renderDetails();
  refreshCurrentDates();
  void syncRemindersToSW();

  if (!state.groupId) return;

  try {
    setNotificationStatus("Salvando pagamento no banco...");
    await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "salvar_log",
        id_grupo: state.groupId,
        chave_perfil: personKey,
        chave_servico: payment.serviceKey,
        mes: formatDateKey(payment.date),
        pago: true,
      }),
    });
    setNotificationStatus("Parcela marcada como paga e salva.");
  } catch (error) {
    setNotificationStatus("Erro de conexão ao salvar. Salvo localmente.", true);
  }
}

async function unmarkPayment(personKey, payment) {
  const paymentKey = getPaymentNotificationKey(payment);

  if (!paidLogsCache[personKey]) return;
  delete paidLogsCache[personKey][paymentKey];
  if (Object.keys(paidLogsCache[personKey]).length === 0) {
    delete paidLogsCache[personKey];
  }

  savePaidLogs(paidLogsCache);
  renderDetails();
  refreshCurrentDates();
  void syncRemindersToSW();

  if (!state.groupId) return;

  try {
    setNotificationStatus("Removendo do banco de dados...");
    await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "salvar_log",
        id_grupo: state.groupId,
        chave_perfil: personKey,
        chave_servico: payment.serviceKey,
        mes: formatDateKey(payment.date),
        pago: false,
      }),
    });
    setNotificationStatus("Parcela desmarcada.");
  } catch (error) {
    setNotificationStatus("Erro de conexão ao remover.", true);
  }
}

async function unmarkPayment(personKey, payment) {
  const paymentKey = getPaymentNotificationKey(payment);

  // Atualização otimista: remover a marcação localmente
  if (!paidLogsCache[personKey]) {
    return;
  }

  delete paidLogsCache[personKey][paymentKey];
  if (Object.keys(paidLogsCache[personKey]).length === 0) {
    delete paidLogsCache[personKey];
  }

  savePaidLogs(paidLogsCache);
  renderDetails();
  refreshCurrentDates();
  void syncRemindersToSW();

  if (!API_URL || API_URL.includes("COLA_TUA_URL_DO_APPS_SCRIPT_AQUI")) {
    return;
  }

  try {
    setNotificationStatus("Removendo do banco de dados...");
    await fetch(API_URL, {
      method: "POST",
      mode: "no-cors",
      referrerPolicy: "no-referrer",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        ...getPaymentSyncPayload(personKey, payment, false),
        remove: true,
      }),
    });
    setNotificationStatus("Parcela desmarcada e sincronizada.");
  } catch (error) {
    console.error("Erro ao remover no Sheets:", error);
    setNotificationStatus(
      "Erro de conexão ao remover. Alteração salva localmente.",
      true,
    );
  }
}

function isPaymentPaid(personKey, payment) {
  if (!personKey) return false;
  const pKey = findPersonKey(personKey);
  const payKey = getPaymentNotificationKey(payment);

  return Boolean(paidLogsCache[pKey] && paidLogsCache[pKey][payKey]);
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

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function findPersonKey(rawName) {
  if (!rawName) return null;
  const normalized = normalizeName(rawName);

  return (
    Object.entries(PEOPLE).find(([k, person]) => {
      const pName = normalizeName(person.name || "");
      const pId = normalizeName(k);
      const aliases = (person.aliases || []).map(normalizeName);

      return (
        pId === normalized ||
        pName === normalized ||
        aliases.includes(normalized) ||
        pName.includes(normalized) ||
        normalized.includes(pName) ||
        aliases.some((a) => normalized.includes(a))
      );
    })?.[0] ?? normalized.replace(/[\s-]+/g, "_")
  );
}

function findServiceKey(rawName) {
  if (!rawName) return null;
  const normalized = normalizeName(rawName);

  // Mapeamento manual para compatibilidade com o servidor (igual ao Code.gs)
  const manualMap = {
    disney: "disney",
    "disney+": "disney",
    hbo: "max",
    max: "max",
    "hbo max": "max",
    spotify: "spotify",
    crunchyroll: "crunchyroll",
    "prime video": "prime_video",
    prime_video: "prime_video",
    "google one": "google_one",
    google_one: "google_one",
    "f1 tv pro": "f1_tv_pro",
    f1_tv_pro: "f1_tv_pro",
    globoplay: "globoplay",
  };

  if (manualMap[normalized]) return manualMap[normalized];

  return (
    Object.entries(SERVICES).find(
      ([k, s]) => k === normalized || normalizeName(s.name) === normalized,
    )?.[0] ?? normalized.replace(/[\s-]+/g, "_")
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
    .toLowerCase() // Removido pt-BR para ser idêntico ao normalizeText do Code.gs
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
  return (
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    SETTINGS.calendarTimeZone
  );
}

function capitalize(value) {
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
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
  const activeCard = Array.from(
    subscriptionList.querySelectorAll(".subscription-card"),
  ).find((c) => c.dataset.service === state.selectedServiceKey);

  if (activeCard) {
    activeCard.insertAdjacentElement("afterend", detailsPanel);
  } else {
    subscriptionList.insertAdjacentElement("afterend", detailsPanel);
  }
}

window.addEventListener("resize", () => {
  if (!detailsPanel.classList.contains("is-hidden")) {
    positionDetailsPanel();
  }
});

// Admin Logic

function renderAdminScreen() {
  adminServicesList.innerHTML = Object.entries(SERVICES)
    .map(
      ([sKey, s]) => `
    <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <strong>${s.name}</strong> <span style="font-size: 0.8rem; margin-left:8px; opacity: 0.7;">${moneyFormatter.format(s.totalAmount)}</span>
        <div style="font-size: 0.8rem; opacity: 0.7;">Pessoas: ${(s.participants || []).map((p) => PEOPLE[p]?.name).join(", ") || "Ninguém"}</div>
      </div>
      <button class="ghost-button edit-service-btn" data-key="${sKey}" style="padding: 6px;">Editar</button>
    </div>
  `,
    )
    .join("");

  adminProfilesList.innerHTML = Object.entries(PEOPLE)
    .map(
      ([pKey, p]) => `
    <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <strong>${p.name}</strong> ${p.isAdmin ? '<span style="color: #ef4444; font-size: 0.7rem; text-transform: uppercase; margin-left:4px;">ADMIN</span>' : ""}
        <div style="font-size: 0.8rem; opacity: 0.7;">Assinaturas: ${p.subscriptions.length}</div>
      </div>
      <button class="ghost-button edit-profile-btn" data-key="${pKey}" style="padding: 6px;">Editar</button>
    </div>
  `,
    )
    .join("");

  document.querySelectorAll(".edit-service-btn").forEach((btn) => {
    btn.addEventListener("click", () =>
      openAdminModalForService(btn.dataset.key),
    );
  });

  document.querySelectorAll(".edit-profile-btn").forEach((btn) => {
    btn.addEventListener("click", () =>
      openAdminModalForProfile(btn.dataset.key),
    );
  });
}

function openAdminModalForService(serviceKey) {
  currentAdminContext = {
    type: "service",
    key: serviceKey || "temp_" + generateKey(),
  };
  const s = serviceKey
    ? SERVICES[serviceKey]
    : {
        name: "",
        shortName: "",
        logoUrl: "",
        cssClass: "",
        model: "monthly",
        modelLabel: "Todo mês",
        totalAmount: 0,
        participants: [],
        color: "#1a2b4c",
      };

  adminModalTitle.textContent = serviceKey
    ? "Editar Assinatura"
    : "Nova Assinatura";
  adminModalDeleteButton.style.display = serviceKey ? "block" : "none";
  adminModalDeleteButton.textContent = "Excluir";
  adminModalDeleteButton.style.color = "#ef4444";
  adminModalDeleteButton.style.background = "transparent";

  adminModalBody.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <label style="display:flex; flex-direction:column; gap:4px;">
        <span style="font-size: 0.8rem; opacity:0.8;">Nome</span>
        <input type="text" id="adminS_name" value="${s.name}" oninput="document.getElementById('adminS_css').value = 'service-' + slugify(this.value)" style="padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: transparent; color: inherit; width: 100%; box-sizing: border-box;" />
      </label>
      <label style="display:flex; flex-direction:column; gap:4px;">
        <span style="font-size: 0.8rem; opacity:0.8;">Logo de Fundo (URL da Imagem)</span>
        <input type="text" id="adminS_logoUrl" value="${s.logoUrl || ""}" placeholder="https://exemplo.com/logo.png" style="padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: transparent; color: inherit; width: 100%; box-sizing: border-box;" />
      </label>
      <label style="display:flex; flex-direction:column; gap:4px;">
        <span style="font-size: 0.8rem; opacity:0.8;">Sigla de Referência</span>
        <input type="text" id="adminS_short" value="${s.shortName}" style="padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: transparent; color: inherit; width: 100%; box-sizing: border-box;" />
      </label>
      <label style="display:flex; flex-direction:column; gap:4px;">
        <span style="font-size: 0.8rem; opacity:0.8;">Classe CSS (Gerada automaticamente)</span>
        <input type="text" id="adminS_css" value="${s.cssClass}" readonly title="Gerada a partir do nome" style="padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: inherit; width: 100%; box-sizing: border-box; cursor: not-allowed;" />
      </label>
      <label style="display:flex; flex-direction:column; gap:4px;">
        <span style="font-size: 0.8rem; opacity:0.8;">Cor do Card (Ajustada para ser escura)</span>
        <input type="color" id="adminS_color" value="${s.color || "#1a2b4c"}" style="height:40px; width: 100%; padding:0; border:none; border-radius:8px; outline:none; background:transparent;" />
      </label>
      <label style="display:flex; flex-direction:column; gap:4px;">
        <span style="font-size: 0.8rem; opacity:0.8;">Modelo (monthly / rotation)</span>
        <select id="adminS_model" style="padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: #0f172a; color: inherit; width: 100%; box-sizing: border-box;">
          <option value="monthly" ${s.model === "monthly" ? "selected" : ""}>Mensal</option>
          <option value="rotation" ${s.model === "rotation" ? "selected" : ""}>Rodízio</option>
        </select>
      </label>
      <label style="display:flex; flex-direction:column; gap:4px;">
        <span style="font-size: 0.8rem; opacity:0.8;">Valor Total (R$)</span>
        <input type="number" step="0.01" id="adminS_total" value="${s.totalAmount}" style="padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: transparent; color: inherit; width: 100%; box-sizing: border-box;" />
      </label>
      <div>
        <span style="font-size: 0.8rem; opacity:0.8;">Participantes</span>
        <div style="display:flex; flex-direction:column; gap:10px; margin-top:8px; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px;">
          ${Object.entries(PEOPLE)
            .map(
              ([pKey, p]) => `
            <label style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" class="adminS_participant" value="${pKey}" ${(s.participants || []).includes(pKey) ? "checked" : ""} style="width:20px;height:20px;" />
              ${p.name}
            </label>
          `,
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
  adminSharedModal.classList.remove("is-hidden");
}

function openAdminModalForProfile(profileKey) {
  currentAdminContext = {
    type: "profile",
    key: profileKey || "temp_" + generateKey(),
  };
  const p = profileKey
    ? PEOPLE[profileKey]
    : {
        name: "",
        aliases: [],
        color: "#444444",
        avatar: "",
        isAdmin: false,
      };

  adminModalTitle.textContent = profileKey ? "Editar Perfil" : "Novo Perfil";
  adminModalDeleteButton.style.display = profileKey ? "block" : "none";
  adminModalDeleteButton.textContent = "Excluir";
  adminModalDeleteButton.style.color = "#ef4444";
  adminModalDeleteButton.style.background = "transparent";

  adminModalBody.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <label style="display:flex; flex-direction:column; gap:4px;">
        <span style="font-size: 0.8rem; opacity:0.8;">Nome Completo</span>
        <input type="text" id="adminP_name" value="${p.name}" style="padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: transparent; color: inherit; width: 100%; box-sizing: border-box;" />
      </label>
      <label style="display:flex; flex-direction:column; gap:4px;">
        <span style="font-size: 0.8rem; opacity:0.8;">Sigla / Iniciais (Ex: AL)</span>
        <input type="text" id="adminP_avatar" value="${p.avatar}" maxlength="2" style="padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); background: transparent; color: inherit; width: 100%; box-sizing: border-box;" />
      </label>
      <label style="display:flex; flex-direction:column; gap:4px;">
        <span style="font-size: 0.8rem; opacity:0.8;">Cor de Fundo</span>
        <input type="color" id="adminP_color" value="${p.color}" style="height:40px; width: 100%; padding:0; border:none; border-radius:8px; outline:none; background:transparent;" />
      </label>
      <label style="display:flex; align-items:center; gap:8px; margin-top:8px;">
        <input type="checkbox" id="adminP_isAdmin" ${p.isAdmin ? "checked" : ""} style="width:20px;height:20px;" />
        Administrador
      </label>
    </div>
  `;
  adminSharedModal.classList.remove("is-hidden");
}

async function handleAdminSave() {
  if (!state.groupId) return;

  if (currentAdminContext.type === "service") {
    const isNew = currentAdminContext.key.startsWith("temp_");
    const name = document.querySelector("#adminS_name").value;
    const sKey = isNew ? findServiceKey(name) : currentAdminContext.key;
    const isMonthly =
      document.querySelector("#adminS_model").value === "monthly";
    const parts = Array.from(
      document.querySelectorAll(".adminS_participant:checked"),
    ).map((el) => el.value);

    SERVICES[sKey] = {
      name: name,
      shortName: document.querySelector("#adminS_short").value,
      logoUrl: document.querySelector("#adminS_logoUrl").value,
      cssClass:
        document.querySelector("#adminS_css").value || `service-${sKey}`,
      color: ensureDarkColor(document.querySelector("#adminS_color").value),
      model: isMonthly ? "monthly" : "rotation",
      modelLabel: isMonthly ? "Todo mês" : "Rodízio",
      totalAmount:
        parseFloat(document.querySelector("#adminS_total").value) || 0,
      participants: parts,
    };

    setNotificationStatus("Salvando assinatura na nuvem...");
    await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "salvar_assinatura",
        id_grupo: state.groupId,
        chave_servico: sKey,
        nome: SERVICES[sKey].name,
        sigla: SERVICES[sKey].shortName,
        cor: SERVICES[sKey].color,
        modelo: SERVICES[sKey].model,
        valor_total: SERVICES[sKey].totalAmount,
        participantes: parts.join(","),
      }),
    });
    setNotificationStatus("Assinatura salva para todos!");
  } else if (currentAdminContext.type === "profile") {
    const isNew = currentAdminContext.key.startsWith("temp_");
    const name = document.querySelector("#adminP_name").value;
    const pKey = isNew ? findPersonKey(name) : currentAdminContext.key;
    const existing = PEOPLE[pKey] || { subscriptions: [] };

    PEOPLE[pKey] = {
      name: name,
      aliases:
        existing.aliases && existing.aliases.length > 0
          ? existing.aliases
          : [name.split(" ")[0].toLowerCase()],
      avatar: document.querySelector("#adminP_avatar").value,
      color: document.querySelector("#adminP_color").value,
      isAdmin: document.querySelector("#adminP_isAdmin").checked,
      subscriptions: existing.subscriptions,
    };

    setNotificationStatus("Salvando perfil na nuvem...");
    await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "salvar_perfil",
        id_grupo: state.groupId,
        chave_perfil: pKey,
        nome: PEOPLE[pKey].name,
        iniciais: PEOPLE[pKey].avatar,
        cor: PEOPLE[pKey].color,
        is_admin: PEOPLE[pKey].isAdmin,
      }),
    });
    setNotificationStatus("Perfil salvo para todos!");
  }

  adminSharedModal.classList.add("is-hidden");
  syncRelationships();
  applyDynamicAmounts();
  renderAdminScreen();
}

let deleteConfirmTimeout = null;
async function handleAdminDelete(e) {
  const btn = e.target;
  if (btn.textContent !== "Confirmar Exclusão") {
    btn.textContent = "Confirmar Exclusão";
    btn.style.color = "#fff";
    btn.style.background = "#ef4444";
    clearTimeout(deleteConfirmTimeout);
    deleteConfirmTimeout = setTimeout(() => {
      btn.textContent = "Excluir";
      btn.style.color = "#ef4444";
      btn.style.background = "transparent";
    }, 3000);
    return;
  }

  if (!state.groupId) return;

  setNotificationStatus("Excluindo do banco de dados...");
  if (currentAdminContext.type === "service") {
    delete SERVICES[currentAdminContext.key];
    await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "deletar_item",
        id_grupo: state.groupId,
        aba: "Assinaturas",
        coluna_chave: "chave_servico",
        valor_chave: currentAdminContext.key,
      }),
    });
  } else {
    delete PEOPLE[currentAdminContext.key];
    for (const s of Object.values(SERVICES)) {
      if (s.participants)
        s.participants = s.participants.filter(
          (p) => p !== currentAdminContext.key,
        );
    }
    await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "deletar_item",
        id_grupo: state.groupId,
        aba: "Perfis",
        coluna_chave: "chave_perfil",
        valor_chave: currentAdminContext.key,
      }),
    });
  }

  setNotificationStatus("Excluído com sucesso!");
  adminSharedModal.classList.add("is-hidden");
  syncRelationships();
  applyDynamicAmounts();
  renderAdminScreen();
}

function generateKey() {
  return Math.random().toString(36).substring(2, 9);
}

// ==========================================
// SISTEMA DE SENHAS COM DICA
// ==========================================
let currentAuthAction = null;
let authenticatingPerson = null;
let currentHintText = "";

async function handleProfileClick(personKey) {
  let person = PEOPLE[personKey];
  if (!person) {
    const alternateKey = Object.keys(PEOPLE).find(
      (k) => PEOPLE[k].aliases?.includes(personKey) || k === personKey,
    );
    if (alternateKey) {
      personKey = alternateKey;
      person = PEOPLE[personKey];
    }
  }

  if (!person) {
    console.error("Person not found in handleProfileClick:", personKey);
    return;
  }

  const passwordModal = document.querySelector("#passwordModal");
  const passwordModalTitle = document.querySelector("#passwordModalTitle");
  const passwordModalMessage = document.querySelector("#passwordModalMessage");
  const passwordInputContainer = document.querySelector(
    "#passwordInputContainer",
  );
  const passwordInput = document.querySelector("#passwordInput");
  const hintInput = document.querySelector("#hintInput");
  const showHintBtn = document.querySelector("#showHintBtn");
  const hintTextDisplay = document.querySelector("#hintTextDisplay");
  const passwordError = document.querySelector("#passwordError");
  const passwordSubmitBtn = document.querySelector("#passwordSubmitBtn");

  authenticatingPerson = personKey;

  if (!state.groupId) {
    saveProfile(personKey);
    openDashboard(personKey);
    return;
  }

  passwordModal.classList.remove("is-hidden");
  passwordModalTitle.textContent = person.name;
  passwordModalMessage.textContent = "Verificando segurança...";
  passwordInputContainer.classList.add("is-hidden");
  passwordSubmitBtn.style.display = "none";
  passwordError.textContent = "";
  passwordInput.value = "";
  hintInput.value = "";
  hintTextDisplay.style.display = "none";
  showHintBtn.style.display = "none";
  hintInput.style.display = "none";

  try {
    const timestamp = Date.now();
    const url = `${API_URL}?action=has_password&id_grupo=${state.groupId}&personKey=${personKey}&t=${timestamp}`;
    const res = await fetch(url);
    const data = await res.json();

    passwordInputContainer.classList.remove("is-hidden");
    passwordSubmitBtn.style.display = "block";

    if (data.hasPassword) {
      currentAuthAction = "login";
      currentHintText = data.hint || "Nenhuma dica cadastrada.";
      passwordModalMessage.textContent =
        "Este perfil é protegido. Digite sua senha:";
      passwordSubmitBtn.textContent = "Entrar";
      showHintBtn.style.display = "block";
    } else {
      currentAuthAction = "create";
      passwordModalMessage.textContent =
        "Crie uma senha e uma dica para proteger seu perfil:";
      passwordSubmitBtn.textContent = "Salvar e Entrar";
      hintInput.style.display = "block";
    }
    setTimeout(() => passwordInput.focus(), 100);
  } catch (err) {
    passwordModalMessage.textContent = "Erro de conexão. Tente novamente.";
  }
}

// Botões do Modal
document.addEventListener("click", async (event) => {
  if (event.target.closest("#closePasswordModal")) {
    document.querySelector("#passwordModal").classList.add("is-hidden");
  }

  if (event.target.closest("#showHintBtn")) {
    const hintDisplay = document.querySelector("#hintTextDisplay");
    hintDisplay.textContent = `💡 Dica: ${currentHintText}`;
    hintDisplay.style.display = "block";
    event.target.style.display = "none";
  }

  if (event.target.closest("#passwordSubmitBtn")) {
    const passwordInput = document.querySelector("#passwordInput");
    const hintInput = document.querySelector("#hintInput");
    const passwordError = document.querySelector("#passwordError");
    const passwordSubmitBtn = document.querySelector("#passwordSubmitBtn");
    const pass = passwordInput.value.trim();

    if (!pass) {
      passwordError.textContent = "A senha não pode ser vazia.";
      return;
    }
    if (currentAuthAction === "create" && !hintInput.value.trim()) {
      passwordError.textContent = "Por favor, crie uma dica para sua senha.";
      return;
    }

    passwordSubmitBtn.disabled = true;
    passwordSubmitBtn.textContent = "Aguarde...";
    passwordError.textContent = "";

    try {
      if (currentAuthAction === "login") {
        const timestamp = Date.now();
        const url = `${API_URL}?action=check_password&id_grupo=${state.groupId}&personKey=${authenticatingPerson}&password=${encodeURIComponent(pass)}&t=${timestamp}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.match) {
          document.querySelector("#passwordModal").classList.add("is-hidden");
          saveProfile(authenticatingPerson);
          openDashboard(authenticatingPerson);
        } else {
          passwordError.textContent = "Senha incorreta.";
        }
      } else if (currentAuthAction === "create") {
        await fetch(API_URL, {
          method: "POST",
          body: JSON.stringify({
            action: "set_password",
            id_grupo: state.groupId,
            chave_perfil: authenticatingPerson,
            senha: pass,
            dica: hintInput.value.trim(),
          }),
        });
        document.querySelector("#passwordModal").classList.add("is-hidden");
        saveProfile(authenticatingPerson);
        openDashboard(authenticatingPerson);
      }
    } catch (err) {
      passwordError.textContent = "Erro de comunicação com o servidor.";
    } finally {
      passwordSubmitBtn.disabled = false;
      passwordSubmitBtn.textContent =
        currentAuthAction === "login" ? "Entrar" : "Salvar e Entrar";
    }
  }
});
// ==========================================
// FATURA DO MÊS (RESUMO)
// ==========================================
function openInvoiceModal(personKey) {
  const person = PEOPLE[personKey];
  if (!person) return;

  const today = startOfDay(getToday());
  let activeMonth = today.getMonth();
  let activeYear = today.getFullYear();

  // A mesma regra de data limite que usamos no painel
  if (today.getDate() > SETTINGS.dueDay) {
    activeMonth += 1;
    if (activeMonth > 11) {
      activeMonth = 0;
      activeYear += 1;
    }
  }

  const activeCutoffDate = createPaymentDate(activeYear, activeMonth);
  const pendingItems = [];
  let total = 0;

  // Busca todas as pendências
  person.subscriptions.forEach((serviceKey) => {
    const payments = getUpcomingPaymentsForPerson(serviceKey, personKey, 12);
    payments.forEach((payment) => {
      const isPaid = isPaymentPaid(personKey, payment);
      if (!isPaid && payment.date <= activeCutoffDate) {
        pendingItems.push(payment);
        total += payment.amount;
      }
    });
  });

  // Ordena por data (o mais atrasado primeiro)
  pendingItems.sort((a, b) => a.date - b.date);

  const invoiceList = document.querySelector("#invoiceList");
  const invoiceTotalAmount = document.querySelector("#invoiceTotalAmount");
  let html = "";

  if (pendingItems.length === 0) {
    html = `
      <div class="empty-state" style="text-align: center; padding: 40px 16px; border: none; background: transparent;">
        <span style="font-size: 3rem; display: block; margin-bottom: 12px;">🎉</span>
        <strong style="color: var(--ink); font-size: 1.2rem;">Tudo em dia!</strong>
        <span style="display: block; margin-top: 4px;">Você não tem nenhum pagamento<br>pendente nesta fatura.</span>
      </div>
    `;
  } else {
    html = pendingItems
      .map((payment) => {
        const service = SERVICES[payment.serviceKey];
        const isAtrasada = payment.date < today;
        const isHoje = payment.date.getTime() === today.getTime();

        let statusPill = "";
        if (isAtrasada) {
          statusPill = `<span class="status-pill status-atrasada" style="background: rgba(225, 29, 72, 0.2); color: #ffa4bc;">Atrasado</span>`;
        } else if (isHoje) {
          statusPill = `<span class="status-pill status-atrasada" style="background: rgba(251, 146, 60, 0.2); color: #fdba74;">Vence Hoje</span>`;
        } else {
          statusPill = `<span class="status-pill status-futuro" style="background: rgba(255, 255, 255, 0.15); color: #ffffff;">Pendente</span>`;
        }

        // Dicionário com as cores exatas do seu CSS para as 8 assinaturas originais
        const fallbackColors = {
          disney: "rgb(4, 7, 20)",
          max: "rgb(0, 0, 0)",
          spotify: "rgb(15, 60, 30)",
          crunchyroll: "rgb(180, 60, 0)",
          prime_video: "rgb(0, 55, 75)",
          google_one: "rgb(4, 30, 71)",
          f1_tv_pro: "rgb(95, 0, 0)",
          globoplay: "rgb(95, 8, 24)",
        };

        // Tenta usar a cor customizada do Admin. Se não tiver, usa a cor do dicionário. Se falhar, usa o azul padrão.
        const bgColor =
          service.color || fallbackColors[payment.serviceKey] || "#1a2b4c";

        return `
        <div class="invoice-item" style="background-color: ${bgColor};">
           <div class="invoice-item-left">
              <span class="service-symbol" style="width: 34px; height: 34px; font-size: 0.8rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); display: grid; place-items: center; border-radius: 8px; flex-shrink: 0;">${service.shortName}</span>
              <div class="invoice-item-info">
                 <strong>${service.name}</strong>
                 <span>Venc. ${formatShortDate(payment.date)}</span>
              </div>
           </div>
           <div class="invoice-item-right">
              <strong>${moneyFormatter.format(payment.amount)}</strong>
              ${statusPill}
           </div>
        </div>
      `;
      })
      .join("");
  }

  invoiceList.innerHTML = html;
  invoiceTotalAmount.textContent = moneyFormatter.format(total);
  document.querySelector("#invoiceModal").classList.remove("is-hidden");
}

// ==========================================
// SISTEMA DE GRUPOS (NOVO)
// ==========================================
const groupScreen = document.querySelector("#groupScreen");
const btnCreateGroup = document.querySelector("#btnCreateGroup");
const formJoinGroup = document.querySelector("#formJoinGroup");
const btnChangeGroup = document.querySelector("#btnChangeGroup");
const currentGroupLabel = document.querySelector("#currentGroupLabel");
const inputGroupCode = document.querySelector("#inputGroupCode");
const groupMessage = document.querySelector("#groupMessage");

// Mudar a função que inicia o site para verificar o grupo primeiro
function initApp() {
  if (!state.groupId) {
    // Se não tem grupo, mostra a tela de boas vindas
    groupScreen.classList.remove("is-hidden");
    profileScreen.classList.add("is-hidden");
    dashboard.classList.add("is-hidden");
    if (adminButton) adminButton.classList.add("is-hidden");
  } else {
    // Se já tem grupo, tenta buscar os dados dele
    groupScreen.classList.add("is-hidden");
    profileScreen.classList.remove("is-hidden");

    // Mostra o código do grupo na tela
    if (currentGroupLabel)
      currentGroupLabel.textContent = state.groupName || state.groupId;

    carregarDadosDoGrupo(state.groupId);
  }
}
// Botão: Alternar Grupo
if (btnChangeGroup) {
  btnChangeGroup.addEventListener("click", () => {
    // Apaga o grupo atual da memória
    state.groupId = null;
    state.groupName = null;
    localStorage.removeItem("streaming-payments-group-id");
    localStorage.removeItem("streaming-payments-group-name");

    // Volta para a tela inicial
    initApp();
  });
}

// Lógica de Renomear Grupo
const btnEditGroupName = document.querySelector("#btnEditGroupName");
const renameGroupContainer = document.querySelector("#renameGroupContainer");
const inputRenameGroup = document.querySelector("#inputRenameGroup");
const btnSaveGroupName = document.querySelector("#btnSaveGroupName");
const renameGroupMessage = document.querySelector("#renameGroupMessage");

if (btnEditGroupName && renameGroupContainer) {
  btnEditGroupName.addEventListener("click", () => {
    renameGroupContainer.classList.toggle("is-hidden");
    if (!renameGroupContainer.classList.contains("is-hidden")) {
      inputRenameGroup.value = state.groupName || state.groupId;
      inputRenameGroup.focus();
    }
  });

  if (btnSaveGroupName) {
    btnSaveGroupName.addEventListener("click", async () => {
      const newName = inputRenameGroup.value.trim();
      if (!newName) return;

      btnSaveGroupName.textContent = "Salvando...";
      btnSaveGroupName.disabled = true;
      renameGroupMessage.textContent = "";
      renameGroupMessage.style.color = "var(--ink)";

      try {
        const idGrupoNovo = slugify(newName);

        const response = await fetch(API_URL, {
          method: "POST",
          body: JSON.stringify({
            action: "renomear_grupo",
            id_grupo: state.groupId,
            id_grupo_novo: idGrupoNovo,
            nome: newName,
          }),
        });
        const data = await response.json();

        // Independent of backend result, we update locally because the
        // older backend might ignore this action but we still want the user to see their new name.
        salvarGrupo(idGrupoNovo, newName);
        if (currentGroupLabel) currentGroupLabel.textContent = newName;
        state.groupId = idGrupoNovo;

        renameGroupContainer.classList.add("is-hidden");
      } catch (e) {
        renameGroupMessage.textContent =
          "Erro de conexão com o banco de dados.";
        renameGroupMessage.style.color = "var(--danger)";
      } finally {
        btnSaveGroupName.textContent = "Salvar";
        btnSaveGroupName.disabled = false;
      }
    });
  }
}
// Formulário: Criar Novo Grupo
const formCreateGroup = document.querySelector("#formCreateGroup");
if (formCreateGroup) {
  formCreateGroup.addEventListener("submit", async (e) => {
    e.preventDefault();
    const inputGroupName = document.querySelector("#inputGroupName");
    const groupName = inputGroupName ? inputGroupName.value.trim() : "";

    if (!groupName) {
      groupMessage.textContent = "Por favor, insira um nome para o grupo.";
      return;
    }

    btnCreateGroup.textContent = "Criando...";
    btnCreateGroup.disabled = true;
    groupMessage.textContent = "";
    groupMessage.style.color = "var(--ink)";

    try {
      const idGrupoSlug = slugify(groupName);

      const response = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "criar_grupo",
          nome: groupName,
          id_grupo: idGrupoSlug,
        }),
      });
      const data = await response.json();

      if (data.success) {
        salvarGrupo(data.id_grupo, data.nome_grupo || groupName);
        groupMessage.style.color = "var(--success)";
        groupMessage.textContent =
          "Grupo criado com sucesso! Código: " + data.id_grupo;

        setTimeout(() => {
          initApp(); // Avança para a próxima tela
        }, 2000);
      } else {
        groupMessage.textContent = "Erro ao criar grupo.";
      }
    } catch (e) {
      groupMessage.textContent = "Erro de conexão com o banco de dados.";
    } finally {
      btnCreateGroup.textContent = "Criar Novo Grupo";
      btnCreateGroup.disabled = false;
    }
  });
}

// Formulário: Entrar em um Grupo Existente
if (formJoinGroup) {
  formJoinGroup.addEventListener("submit", async (e) => {
    e.preventDefault();
    const codigo = inputGroupCode.value.trim().toUpperCase();
    if (!codigo) return;

    const btn = formJoinGroup.querySelector("button");
    btn.textContent = "Verificando...";
    btn.disabled = true;
    groupMessage.textContent = "";
    groupMessage.style.color = "var(--ink)";

    try {
      // Faz uma chamada para ver se o grupo existe e já baixa os dados
      const url = `${API_URL}?action=carregar_dados&id_grupo=${codigo}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.success && data.perfis) {
        // Se trouxe os dados, o grupo existe!
        salvarGrupo(codigo, data.nome_grupo);
        initApp();
      } else {
        groupMessage.style.color = "var(--danger)";
        groupMessage.textContent = "Código de grupo não encontrado.";
      }
    } catch (error) {
      groupMessage.style.color = "var(--danger)";
      groupMessage.textContent = "Erro de conexão.";
    } finally {
      btn.textContent = "Entrar no Grupo";
      btn.disabled = false;
    }
  });
}

function salvarGrupo(id, name) {
  state.groupId = id;
  localStorage.setItem("streaming-payments-group-id", id);
  if (name) {
    state.groupName = name;
    localStorage.setItem("streaming-payments-group-name", name);
  } else {
    state.groupName = id;
    localStorage.setItem("streaming-payments-group-name", id);
  }
  const currentGroupLabelElement = document.querySelector("#currentGroupLabel");
  if (currentGroupLabelElement) {
    currentGroupLabelElement.textContent = state.groupName || state.groupId;
  }
}

// Baixa as pessoas, assinaturas e logs da nova planilha
async function carregarDadosDoGrupo(idGrupo) {
  profileMessage.style.color = "var(--ink)";
  profileMessage.textContent = "Sincronizando dados do grupo...";
  try {
    const url = `${API_URL}?action=carregar_dados&id_grupo=${idGrupo}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.success) {
      if (data.nome_grupo) salvarGrupo(idGrupo, data.nome_grupo);
      processarDadosDaPlanilha(data);
      profileMessage.textContent = "";
      renderProfileSelection();
      restoreProfile();
    }
  } catch (e) {
    profileMessage.style.color = "var(--danger)";
    profileMessage.textContent = "Erro ao sincronizar. Verifique a internet.";
  }
}

function processarDadosDaPlanilha(data) {
  // Limpa tudo para colocar as coisas novas
  PEOPLE = {};
  SERVICES = {};

  if (data.perfis && data.perfis.length > 0) {
    data.perfis.forEach((p) => {
      const pKey =
        p.chave_perfil || p.chave || p.id || slugify(p.nome || p.name || "");
      if (!pKey) return;
      const name = p.nome || p.name || pKey;
      PEOPLE[pKey] = {
        name: name,
        aliases: [name.toLowerCase().split(" ")[0], pKey],
        color: p.cor || "#444444",
        avatar: p.iniciais || name.substring(0, 2).toUpperCase(),
        isAdmin: p.is_admin === true || p.is_admin === "TRUE",
        subscriptions: [],
      };
    });
  }

  if (data.assinaturas && data.assinaturas.length > 0) {
    data.assinaturas.forEach((s) => {
      let parts = [];
      const rawParticipantes =
        s.participantes || s.participants || s.participantes_list || "";
      if (rawParticipantes) {
        if (Array.isArray(rawParticipantes)) {
          parts = rawParticipantes.map((x) => String(x).trim()).filter(Boolean);
        } else {
          parts = String(rawParticipantes)
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
        }
      }

      const sKey =
        s.chave_servico || s.chave || s.id || slugify(s.nome || s.name || "");
      if (!sKey) return;
      const name = s.nome || s.name || sKey;
      const modelClass = s.modelo || s.model || "monthly";

      SERVICES[sKey] = {
        name: name,
        shortName: s.sigla || name.substring(0, 2).trim(),
        cssClass: "service-" + sKey,
        model: modelClass === "rotation" ? "rotation" : "monthly",
        modelLabel: modelClass === "rotation" ? "Rodízio" : "Todo mês",
        totalAmount: parseFloat(s.valor_total || s.total || s.valor) || 0,
        participants: parts,
        color: s.cor || "#1a2b4c",
      };
    });
  }

  paidLogsCache = {};
  if (data.logs && data.logs.length > 0) {
    data.logs.forEach((log) => {
      if (log.pago === true || String(log.pago).toUpperCase() === "TRUE") {
        const pKey = log.chave_perfil || log.perfil || log.nome;
        const sKey = log.chave_servico || log.servico || log.assinatura;
        const mes = log.mes || log.month;

        if (pKey && sKey && mes) {
          if (!paidLogsCache[pKey]) paidLogsCache[pKey] = {};
          paidLogsCache[pKey][`${sKey}:${mes}`] = "true";
        }
      }
    });
  }

  savePaidLogs(paidLogsCache);
  syncRelationships();
  applyDynamicAmounts();
}
