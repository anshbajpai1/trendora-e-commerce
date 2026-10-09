(() => {
  const page = location.pathname.split('/').pop() || 'index.html';
  const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nativeAlert = window.alert.bind(window);

  // A single dialog surface keeps status messages and confirmations consistent across the store.
  const dialog = (() => {
    let active = null;
    let previousFocus = null;
    const style = document.createElement('style');
    style.textContent = `
      .trendora-dialog-backdrop{position:fixed;inset:0;z-index:10050;display:grid;place-items:center;padding:20px;background:rgba(25,30,20,.46);backdrop-filter:blur(5px);opacity:0;visibility:hidden;transition:opacity .22s ease,visibility .22s ease}
      .trendora-dialog-backdrop.is-open{opacity:1;visibility:visible}
      .trendora-dialog{width:min(100%,430px);background:#fff;border:1px solid rgba(68,81,51,.16);border-radius:10px;box-shadow:0 24px 70px rgba(23,30,18,.28);padding:28px;transform:translateY(14px) scale(.97);transition:transform .28s cubic-bezier(.2,.85,.25,1);font-family:'DM Sans',Arial,sans-serif;color:#303829}
      .trendora-dialog-backdrop.is-open .trendora-dialog{transform:translateY(0) scale(1)}
      .trendora-dialog__mark{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;margin-bottom:17px;background:#edf3e7;color:#456034;font:700 21px/1 Arial}
      .trendora-dialog[data-tone="error"] .trendora-dialog__mark{background:#fbeceb;color:#a7463e}.trendora-dialog[data-tone="warning"] .trendora-dialog__mark{background:#fff4dc;color:#9a6a11}.trendora-dialog[data-tone="confirm"] .trendora-dialog__mark{background:#eef0e8;color:#526044}
      .trendora-dialog h2{margin:0 35px 8px 0;font:700 21px/1.25 'Manrope','DM Sans',sans-serif;letter-spacing:0}.trendora-dialog p{margin:0;color:#6d7664;font-size:14px;line-height:1.55;white-space:pre-line}
      .trendora-dialog__close{position:absolute;top:17px;right:17px;width:32px;height:32px;border:0;border-radius:5px;background:transparent;color:#6d7664;font-size:22px;line-height:1;cursor:pointer}.trendora-dialog__close:hover{background:#f0f2eb;color:#303829}
      .trendora-dialog__actions{display:flex;justify-content:flex-end;gap:10px;margin-top:24px}.trendora-dialog__button{min-width:96px;border:1px solid #39442e;border-radius:5px;padding:10px 15px;background:#39442e;color:#fff;font:700 12px 'DM Sans',Arial,sans-serif;cursor:pointer;transition:transform .16s ease,background .16s ease}.trendora-dialog__button:hover{background:#2d3823;transform:translateY(-1px)}.trendora-dialog__button--secondary{background:#fff;border-color:#d7ddd0;color:#56614c}.trendora-dialog__button--secondary:hover{background:#f3f5ef}.trendora-dialog[data-tone="error"] .trendora-dialog__button--primary{background:#9f413b;border-color:#9f413b}.trendora-dialog[data-tone="error"] .trendora-dialog__button--primary:hover{background:#86352f}
      @media(max-width:480px){.trendora-dialog-backdrop{padding:16px}.trendora-dialog{padding:24px 20px}.trendora-dialog__actions{flex-direction:column-reverse}.trendora-dialog__button{width:100%}}
      @media(prefers-reduced-motion:reduce){.trendora-dialog-backdrop,.trendora-dialog,.trendora-dialog__button{transition:none}}
    `;
    document.head.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.className = 'trendora-dialog-backdrop';
    backdrop.innerHTML = '<section class="trendora-dialog" role="dialog" aria-modal="true" aria-labelledby="trendora-dialog-title" aria-describedby="trendora-dialog-message"><button class="trendora-dialog__close" type="button" aria-label="Close dialog">&times;</button><div class="trendora-dialog__mark" aria-hidden="true"></div><h2 id="trendora-dialog-title"></h2><p id="trendora-dialog-message"></p><div class="trendora-dialog__actions"></div></section>';
    document.body.appendChild(backdrop);
    const panel = backdrop.querySelector('.trendora-dialog');
    const closeButton = backdrop.querySelector('.trendora-dialog__close');
    const mark = backdrop.querySelector('.trendora-dialog__mark');
    const title = backdrop.querySelector('h2');
    const message = backdrop.querySelector('p');
    const actions = backdrop.querySelector('.trendora-dialog__actions');
    const inferTone = text => /failed|unable|could not|error|invalid|please allow|not found|attention/i.test(text) ? 'error' : /empty|enter|required|valid|try again/i.test(text) ? 'warning' : 'success';

    function close(result) {
      if (!active) return;
      const resolve = active.resolve;
      active = null;
      backdrop.classList.remove('is-open');
      document.body.classList.remove('trendora-dialog-open');
      setTimeout(() => previousFocus?.focus?.(), 0);
      resolve(result);
    }
    function show(text, options = {}) {
      if (active) close(false);
      previousFocus = document.activeElement;
      const tone = options.tone || inferTone(String(text));
      panel.dataset.tone = tone;
      mark.textContent = tone === 'success' ? '✓' : tone === 'error' ? '!' : tone === 'warning' ? '!' : '?';
      title.textContent = options.title || (tone === 'success' ? 'All set' : tone === 'error' ? 'Something went wrong' : tone === 'warning' ? 'Please check this' : 'Please confirm');
      message.textContent = String(text);
      actions.replaceChildren();
      const addButton = (label, className, value) => { const button = document.createElement('button'); button.type = 'button'; button.className = `trendora-dialog__button ${className}`; button.textContent = label; button.addEventListener('click', () => close(value)); actions.appendChild(button); return button; };
      let initialFocus;
      if (options.confirm) { addButton(options.cancelLabel || 'Cancel', 'trendora-dialog__button--secondary', false); initialFocus = addButton(options.confirmLabel || 'Confirm', 'trendora-dialog__button--primary', true); }
      else { initialFocus = addButton(options.buttonLabel || 'Okay', 'trendora-dialog__button--primary', true); }
      closeButton.hidden = Boolean(options.confirm);
      backdrop.classList.add('is-open');
      document.body.classList.add('trendora-dialog-open');
      setTimeout(() => initialFocus.focus(), 20);
      return new Promise(resolve => { active = { resolve, confirm: Boolean(options.confirm) }; });
    }
    backdrop.addEventListener('click', event => { if (event.target === backdrop && active && !active.confirm) close(true); });
    closeButton.addEventListener('click', () => close(false));
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && active && !active.confirm) { event.preventDefault(); close(true); } });
    return { alert: text => show(text), confirm: text => show(text, { confirm: true, tone: 'confirm', title: 'Are you sure?' }) };
  })();
  window.trendoraDialog = dialog;
  window.alert = message => dialog.alert(message);
  if (page === 'profile.html') {
    const main = document.querySelector('main');
    if(main){ const heading=document.createElement('header'); heading.className='account-heading'; heading.innerHTML='<span class="eyebrow">YOUR TRENDORA</span><h1>My account</h1><p>Your details, delivery addresses and offers, all in one place.</p>'; main.prepend(heading); }
  }
  const shell = document.querySelector('.cart-shell, .checkout-shell');
  if (shell) {
    const steps = document.createElement('div');
    steps.className = 'journey';
    steps.setAttribute('aria-label', 'Shopping progress');
    steps.innerHTML = `<a href="index.html#collection">Shop</a><span class="journey-line"></span><a href="cart.html" ${page==='cart.html'?'class="current" aria-current="step"':''}>Shopping bag</a><span class="journey-line"></span><span ${page==='checkout.html'?'class="current" aria-current="step"':''}>Checkout</span>`;
    shell.prepend(steps);
  }
  // Make legacy placeholder-only forms understandable to assistive technology.
  document.querySelectorAll('input, select, textarea').forEach(field => {
    if (!field.labels?.length && !field.hasAttribute('aria-label') && !['hidden','submit','button'].includes(field.type)) {
      field.setAttribute('aria-label', field.placeholder || field.name || field.id.replace(/([A-Z])/g, ' $1'));
    }
  });
  function unavailableImage(image) {
    if(image.id === 'heroProductImage' || image.id === 'storyProductImage' || image.id === 'modalMainImage' || image.closest('.modal, #imgModal')) return;
    image.hidden = true;
    const parent = image.parentElement;
    if(parent && !parent.querySelector('.image-unavailable')) {
      const state=document.createElement('span'); state.className='image-unavailable'; state.textContent='Image unavailable'; parent.appendChild(state);
    }
  }
  document.addEventListener('error', event => { if(event.target.tagName === 'IMG') unavailableImage(event.target); }, true);
  document.querySelectorAll('img[src=""]').forEach(image => {
    if(image.id !== 'productImage') unavailableImage(image);
  });
  const modalObserver = new MutationObserver(() => {
    document.querySelectorAll('[role="dialog"], .trendora-auth-modal').forEach(modal => {
      if (getComputedStyle(modal).display === 'none' || modal.dataset.focusBound) return;
      modal.dataset.focusBound = 'true';
      modal.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const elements = [...modal.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex="0"]')].filter(el => el.getClientRects().length);
        const first = elements[0], last = elements[elements.length-1];
        if (event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
        if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
      });
    });
  });
  modalObserver.observe(document.body,{childList:true,subtree:true});
  // A failed SDK/network request must never leave an indefinite skeleton.
  setTimeout(() => {
    const products = document.querySelector('#products[aria-busy="true"]');
    const detail = document.querySelector('.detail-loading');
    const pendingOrders = document.querySelector('#ordersList .order-skeleton')?.parentElement;
    const error = '<div class="loading-error" role="alert"><h3>This is taking longer than expected</h3><p>Check your connection, then reload to try again.</p><a href="'+escapeHTML(location.pathname+location.search)+'">Reload page ↻</a></div>';
    if(products){ products.innerHTML = error; products.setAttribute('aria-busy','false'); }
    if(detail){ const message=document.createElement('div'); message.className='detail-load-notice'; message.innerHTML=error; detail.before(message); const observer=new MutationObserver(()=>{if(!detail.classList.contains('detail-loading')){message.remove();observer.disconnect();}}); observer.observe(detail,{attributes:true,attributeFilter:['class']}); }
    if(pendingOrders) pendingOrders.innerHTML=error;
  }, 20000);
})();
