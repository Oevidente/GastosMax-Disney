(function () {
  const ACTION_SELECTOR = 'button[data-mark-paid], button[data-toggle-paid]';

  function normalizeButton(button) {
    const label = (button.textContent || '').trim().toLowerCase();
    const isUndo = label.includes('desfazer');

    button.classList.add('payment-action-button');
    button.classList.toggle('is-unmark', isUndo);
    button.classList.toggle('is-mark', !isUndo);

    const iconSrc = isUndo ? 'icones/icons8-undo-pay-100.png' : 'icones/icons8-pay-100.png';
    const currentImg = button.querySelector('img');

    if (currentImg) {
      if (currentImg.getAttribute('src') !== iconSrc) {
        currentImg.src = iconSrc;
      }
    } else {
      const img = document.createElement('img');
      img.src = iconSrc;
      img.alt = '';
      button.appendChild(img);
    }
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
