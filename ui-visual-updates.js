(function () {
  const ACTION_SELECTOR = 'button[data-mark-paid], button[data-toggle-paid]';

  function normalizeButton(button) {
    const label = (button.textContent || '').trim().toLowerCase();
    const isUndo = label.includes('desfazer');

    button.classList.add('payment-action-button');
    button.classList.toggle('is-unmark', isUndo);
    button.classList.toggle('is-mark', !isUndo);
    button.setAttribute('data-symbol', isUndo ? '↺' : 'R$');
  }

  function updateActionButtons(root) {
    root.querySelectorAll(ACTION_SELECTOR).forEach(normalizeButton);
  }

  function init() {
    updateActionButtons(document);

    const dashboard = document.querySelector('#dashboard');
    if (!dashboard) return;

    const observer = new MutationObserver(() => updateActionButtons(dashboard));
    observer.observe(dashboard, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
