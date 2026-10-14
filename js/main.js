(() => {
  const firebaseConfig = {
    apiKey: "AIzaSyBFh6tNI6roZQecdYGtzs7tX75lY4NHbqo",
    authDomain: "trendora-1cd23.firebaseapp.com",
    projectId: "trendora-1cd23",
    storageBucket: "trendora-1cd23.appspot.com",
    messagingSenderId: "1080352553475",
    appId: "1:1080352553475:web:850319561617a21fdfec36"
  };

  const page = window.location.pathname.split("/").pop() || "index.html";
  const pagePath = page + window.location.search;
  const adminPages = new Set(["admin-login.html", "admin-panel.html", "admin-users.html", "customers-orders.html"]);
  const authPages = new Set(["login.html", "signup.html", "forgot-password.html"]);
  let authInstance = null;
  let dbInstance = null;
  let currentUser = null;
  let firebaseReady = null;
  let authStateReady = false;
  let authReadyResolve = null;
  const authReady = new Promise(resolve => { authReadyResolve = resolve; });
  let pendingReturnUrl = pagePath;

  const icons = {
    cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h8.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21a7 7 0 0 0-14 0"/><circle cx="12" cy="8" r="4"/></svg>'
  };

  function cartCount() {
    try {
      const cart = JSON.parse(localStorage.getItem("cart") || "[]");
      return cart.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
    } catch {
      return 0;
    }
  }

  function isActiveHref(href) {
    if (!href || href === "#") return false;
    const target = href.split("?")[0];
    if (target === "index.html") return page === "index.html" || page === "";
    if (target === "cart.html") return page === "cart.html" || page === "checkout.html";
    return page === target;
  }

  function navLink(href, label, extraClass = "") {
    const activeClass = isActiveHref(href) ? " active" : "";
    return `<a class="${extraClass}${activeClass}" href="${href}"${activeClass ? ' aria-current="page"' : ""}>${label}</a>`;
  }

  function ensureFirebase() {
    if (firebaseReady) return firebaseReady;
    firebaseReady = Promise.all([
      import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js")
    ]).then(async ([appMod, authMod, dbMod]) => {
      const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
      authInstance = authMod.getAuth(app);
      dbInstance = dbMod.getFirestore(app);
      const persistence = adminPages.has(page)
        ? authMod.browserSessionPersistence
        : authMod.browserLocalPersistence;
      await authMod.setPersistence(authInstance, persistence);
      return { appMod, authMod, dbMod };
    });
    return firebaseReady;
  }

  function escapeText(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function buildCustomerNav() {
    return `
      <nav class="trendora-navbar" aria-label="Main navigation">
        <a class="trendora-brand" href="index.html" aria-label="Trendora home"><i class="brand-mark" aria-hidden="true">t</i><span>trendora</span></a>
        <div class="nav-center"><a href="index.html#collection" class="${page === 'index.html' ? 'active' : ''}">Shop all</a><a href="wishlist.html">Saved</a><a href="index.html#edit">The everyday edit</a><a href="track-order.html" class="${page === 'track-order.html' ? 'active' : ''}">Track an order</a><a href="about.html" class="${page === 'about.html' ? 'active' : ''}">About us</a><a href="contact.html" class="${page === 'contact.html' ? 'active' : ''}">Contact</a></div>
        <div class="trendora-navlinks">
          <button class="nav-search" id="navSearchToggle" type="button" aria-label="Search products" aria-expanded="false" aria-controls="globalSearchPanel"><svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="7"/><path d="m16 16 5 5"/></svg><span>Search</span></button>
          ${navLink("orders.html", "Orders", "js-orders-link")}
          <a class="trendora-icon-btn${isActiveHref("cart.html") ? " active" : ""}" href="cart.html" aria-label="Cart" title="Cart"${isActiveHref("cart.html") ? ' aria-current="page"' : ""}>
            ${icons.cart}
            <span class="trendora-cart-badge">${cartCount()}</span>
          </a>
          <div class="trendora-profile-menu">
            <button class="trendora-icon-btn${page === "profile.html" ? " active" : ""}" id="profileMenuBtn" type="button" aria-label="Account" title="Account"${page === "profile.html" ? ' aria-current="page"' : ""}>${icons.user}</button>
            <div class="trendora-profile-dropdown" id="profileDropdown">
              ${currentUser ? `
                <strong>${escapeText(currentUser.displayName || currentUser.email || "My Account")}</strong>
                <a href="profile.html">Profile</a>
                <a href="orders.html">Orders</a>
                <button type="button" id="sharedLogoutBtn">Logout</button>
              ` : `
                <strong>Account</strong>
                <button type="button" data-auth-mode="login">Login</button>
                <button type="button" data-auth-mode="signup">Sign Up</button>
              `}
            </div>
          </div>
          <button class="nav-menu-toggle" id="mobileNavToggle" type="button" aria-expanded="false" aria-controls="mobileNavPanel">Menu</button>
        </div>
        <div class="mobile-nav-panel" id="mobileNavPanel" hidden>
          <a href="index.html#collection">Shop all</a>
          <a href="wishlist.html">Saved products</a>
          <a href="index.html#edit">The everyday edit</a>
          <a href="about.html">About us</a>
          <a href="contact.html">Contact</a>
          <a href="track-order.html">Track an order</a>
          <a href="orders.html" class="js-orders-link">My orders</a>
          <a href="profile.html">My account</a>
        </div>
      </nav>
    `;
  }

  function buildAdminNav() {
    if (page === "admin-login.html") return "";
    return `
      <nav class="trendora-navbar admin" aria-label="Admin navigation">
        <a class="trendora-brand" href="admin-panel.html">
          <span>Trendora Admin</span>
          <small>Store controls</small>
        </a>
        <div class="trendora-navlinks">
          ${navLink("admin-panel.html", "Products")}
          ${navLink("admin-users.html", "Users")}
          ${navLink("customers-orders.html", "Orders")}
          ${navLink("index.html", "Store", "outline")}
          <button type="button" id="sharedLogoutBtn">Logout</button>
        </div>
      </nav>
    `;
  }

  function renderNav() {
    if (page === "admin-login.html") return;
    const oldNav = document.querySelector("body > nav, body > .topbar, body > .trendora-navbar");
    const wrapper = document.createElement("div");
    wrapper.innerHTML = adminPages.has(page) ? buildAdminNav() : buildCustomerNav();
    const nav = wrapper.firstElementChild;
    if (!nav) return;
    if (oldNav) oldNav.replaceWith(nav);
    else { const announcement = document.querySelector(".store-announcement"); if(announcement) announcement.after(nav); else document.body.insertBefore(nav, document.body.firstChild); }
    bindNav();
  }

  function ensureSearchPanel() {
    let panel = document.getElementById("globalSearchPanel");
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "globalSearchPanel";
    panel.className = "trendora-search-panel";
    panel.hidden = true;
    const currentQuery = page === "search.html" ? new URLSearchParams(location.search).get("q") || "" : "";
    panel.innerHTML = `
      <form class="trendora-search-form" action="search.html" method="get" role="search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m16 16 5 5"/></svg>
        <input type="search" name="q" value="${escapeText(currentQuery)}" placeholder="Search products, categories and more" aria-label="Search the Trendora catalog" autocomplete="off">
        <button class="trendora-search-submit" type="submit">Search</button>
        <button class="trendora-search-close" type="button" aria-label="Close search">&times;</button>
      </form>
      <p>Try a product name or category. Press Enter to view all matching products.</p>`;
    document.querySelector(".trendora-navbar")?.after(panel);
    const positionBelowNavbar = () => {
      const navbar = document.querySelector(".trendora-navbar");
      if (!navbar) return;
      const navbarBottom = Math.max(0, Math.round(navbar.getBoundingClientRect().bottom));
      panel.style.top = `${navbarBottom}px`;
      document.documentElement.style.setProperty("--trendora-search-top", `${navbarBottom}px`);
    };
    panel.positionBelowNavbar = positionBelowNavbar;
    window.addEventListener("resize", positionBelowNavbar, { passive: true });
    window.addEventListener("scroll", () => {
      if (!panel.hidden) positionBelowNavbar();
    }, { passive: true });
    const close = () => {
      panel.hidden = true;
      document.body.classList.remove("search-panel-open");
      document.getElementById("navSearchToggle")?.setAttribute("aria-expanded", "false");
    };
    panel.querySelector(".trendora-search-close").addEventListener("click", close);
    panel.querySelector("form").addEventListener("submit", event => {
      event.preventDefault();
      const query = panel.querySelector("input").value.trim();
      window.location.href = `search.html${query ? `?q=${encodeURIComponent(query)}` : ""}`;
    });
    panel.addEventListener("click", event => event.stopPropagation());
    return panel;
  }

  function bindNav() {
    const searchToggle = document.getElementById("navSearchToggle");
    if (searchToggle) {
      searchToggle.addEventListener("click", event => {
        event.stopPropagation();
        const panel = ensureSearchPanel();
        const opening = panel.hidden;
        if (opening) panel.positionBelowNavbar?.();
        panel.hidden = !opening;
        searchToggle.setAttribute("aria-expanded", String(opening));
        document.body.classList.toggle("search-panel-open", opening);
        if (opening) setTimeout(() => panel.querySelector("input")?.focus(), 0);
      });
    }

    const mobileMenuToggle = document.getElementById("mobileNavToggle");
    const mobileNavPanel = document.getElementById("mobileNavPanel");
    if (mobileMenuToggle && mobileNavPanel) {
      mobileMenuToggle.addEventListener("click", () => {
        const opening = mobileNavPanel.hidden;
        mobileNavPanel.hidden = !opening;
        mobileMenuToggle.setAttribute("aria-expanded", String(opening));
      });
      mobileNavPanel.addEventListener("click", event => {
        if (event.target.closest("a")) {
          mobileNavPanel.hidden = true;
          mobileMenuToggle.setAttribute("aria-expanded", "false");
        }
      });
    }

    const profileBtn = document.getElementById("profileMenuBtn");
    const dropdown = document.getElementById("profileDropdown");
    if (profileBtn && dropdown) {
      profileBtn.addEventListener("click", event => {
        event.stopPropagation();
        dropdown.classList.toggle("open");
        profileBtn.setAttribute("aria-expanded", String(dropdown.classList.contains("open")));
      });
      profileBtn.setAttribute("aria-expanded", "false");
      profileBtn.setAttribute("aria-controls", "profileDropdown");
    }

    document.querySelectorAll("[data-auth-mode]").forEach(btn => {
      btn.addEventListener("click", () => safeOpenAuthModal({ mode: btn.dataset.authMode, returnUrl: pagePath }));
    });

    document.querySelectorAll(".js-orders-link").forEach(ordersLink => {
      if (currentUser) return;
      ordersLink.addEventListener("click", event => {
        event.preventDefault();
        safeOpenAuthModal({ mode: "login", returnUrl: "orders.html" });
      });
    });

    const logoutBtn = document.getElementById("sharedLogoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        try {
          const { authMod } = await ensureFirebase();
          await authMod.signOut(authInstance);
        } finally {
          window.location.href = adminPages.has(page) ? "admin-login.html" : "index.html";
        }
      });
    }
  }

  function buildFooter() {
    const footer = document.createElement("footer");
    footer.className = "trendora-footer";
    footer.innerHTML = `
      <div class="trendora-footer__inner">
        <section class="trendora-footer__brand"><a class="trendora-footer__logo" href="index.html">trendora<span style="color:#879b61">.</span></a><p>Online catalog, checkout and order tracking.</p></section>
        <div class="footer-column"><h2>${adminPages.has(page) ? "Manage store" : "Shop"}</h2>${adminPages.has(page) ? '<a href="admin-panel.html">Products</a><a href="admin-users.html">Customers</a><a href="customers-orders.html">Orders</a>' : '<a href="index.html#collection">Products</a><a href="search.html">Search</a><a href="cart.html">Shopping bag</a>'}</div>
        <div class="footer-column"><h2>Your Trendora</h2><a href="about.html">About us</a><a href="contact.html">Contact</a><a href="track-order.html">Track an order</a><a href="profile.html">My account</a></div>
        <div class="footer-note"><b>Store policies</b><p><a href="terms.html">Terms &amp; Conditions</a><br><a href="privacy.html">Privacy Policy</a><br><a href="returns.html">Returns &amp; Refunds</a></p><span>INR ₹ · India</span></div>
      </div><div class="trendora-footer__bar"><span>© ${new Date().getFullYear()} Trendora. All rights reserved.</span><span><a href="terms.html">Terms</a> · <a href="privacy.html">Privacy</a></span></div>`;
    return footer;
  }

  function renderFooter() {
    if (page === "admin-login.html") return;
    document.body.classList.add("has-trendora-footer");
    if (authPages.has(page)) document.body.classList.add("trendora-auth-page");
    const currentFooter = document.querySelector("body > footer");
    const footer = buildFooter();
    if (currentFooter) currentFooter.replaceWith(footer);
    else document.body.appendChild(footer);

  }

  function ensureAuthModal() {
    let modal = document.getElementById("trendoraAuthModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "trendoraAuthModal";
    modal.className = "trendora-auth-modal";
    modal.innerHTML = `
      <div class="trendora-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="sharedAuthTitle">
        <button class="trendora-auth-close" type="button" aria-label="Close">&times;</button>
        <div class="trendora-auth-tabs">
          <button type="button" data-tab="login" class="active">Login</button>
          <button type="button" data-tab="signup">Sign Up</button>
        </div>
        <form id="trendoraLoginForm" class="trendora-auth-form">
          <h2 id="sharedAuthTitle">Welcome back</h2>
          <p>Login to continue shopping, add items, or checkout.</p>
          <input aria-label="Email or phone" id="modalLoginInput" type="text" placeholder="Email or phone" autocomplete="username">
          <input aria-label="Password" id="modalLoginPassword" type="password" placeholder="Password" autocomplete="current-password">
          <button type="submit">Login</button>
        </form>
        <form id="trendoraSignupForm" class="trendora-auth-form" hidden>
          <h2>Create account</h2>
          <p>Save your cart, profile and orders in one place.</p>
          <input aria-label="Full name" id="modalSignupName" type="text" placeholder="Full name" autocomplete="name">
          <input aria-label="Email" id="modalSignupEmail" type="email" placeholder="Email" autocomplete="email">
          <input aria-label="Phone number" id="modalSignupPhone" type="text" placeholder="Phone number" autocomplete="tel">
          <input aria-label="Password" id="modalSignupPassword" type="password" placeholder="Password" autocomplete="new-password">
          <button type="submit">Create Account</button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector(".trendora-auth-close").onclick = closeAuthModal;
    modal.addEventListener("click", event => { if (event.target === modal) closeAuthModal(); });
    modal.querySelectorAll("[data-tab]").forEach(tab => {
      tab.addEventListener("click", () => setAuthMode(tab.dataset.tab));
    });
    modal.querySelector("#trendoraLoginForm").addEventListener("submit", submitLogin);
    modal.querySelector("#trendoraSignupForm").addEventListener("submit", submitSignup);
    return modal;
  }

  function setAuthMode(mode) {
    const modal = ensureAuthModal();
    const login = modal.querySelector("#trendoraLoginForm");
    const signup = modal.querySelector("#trendoraSignupForm");
    const tabs = modal.querySelectorAll("[data-tab]");
    login.hidden = mode !== "login";
    signup.hidden = mode !== "signup";
    tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.tab === mode));
  }

  function openAuthModal({ mode = "login", returnUrl = pagePath } = {}) {
    pendingReturnUrl = returnUrl;
    const modal = ensureAuthModal();
    setAuthMode(mode);
    modal.classList.add("open");
    setTimeout(() => modal.querySelector(mode === "login" ? "#modalLoginInput" : "#modalSignupName")?.focus(), 0);
  }

  async function safeOpenAuthModal({ mode = "login", returnUrl = pagePath } = {}) {
    pendingReturnUrl = returnUrl;
    try {
      await ensureFirebase();
      if (!authStateReady) await authReady;
      currentUser = authInstance?.currentUser || currentUser;
      if (currentUser) {
        if (returnUrl && returnUrl !== pagePath) window.location.href = returnUrl;
        return false;
      }
    } catch (error) {
      console.warn("Auth check before modal failed:", error);
    }
    openAuthModal({ mode, returnUrl });
    return true;
  }

  function closeAuthModal() {
    document.getElementById("trendoraAuthModal")?.classList.remove("open");
    document.getElementById("profileMenuBtn")?.focus();
  }

  async function submitLogin(event) {
    event.preventDefault();
    const input = document.getElementById("modalLoginInput").value.trim();
    const password = document.getElementById("modalLoginPassword").value;
    if (!input || !password) { alert("Please enter email/phone and password."); return; }
    try {
      const { authMod, dbMod } = await ensureFirebase();
      let email = input;
      if (!input.includes("@")) {
        const q = dbMod.query(dbMod.collection(dbInstance, "users"), dbMod.where("phone", "==", input));
        const snap = await dbMod.getDocs(q);
        if (snap.empty) throw new Error("No account found with this phone number.");
        email = snap.docs[0].data().email;
      }
      await authMod.signInWithEmailAndPassword(authInstance, email, password);
      closeAuthModal();
      if (pendingReturnUrl && pendingReturnUrl !== pagePath) window.location.href = pendingReturnUrl;
    } catch (error) {
      alert("Login failed: " + (error.message || "Please try again."));
    }
  }

  async function submitSignup(event) {
    event.preventDefault();
    const name = document.getElementById("modalSignupName").value.trim();
    const email = document.getElementById("modalSignupEmail").value.trim();
    const phone = document.getElementById("modalSignupPhone").value.trim();
    const password = document.getElementById("modalSignupPassword").value;
    if (!name || !email || !phone || !password) { alert("Please fill all fields."); return; }
    if (!/^[0-9]{10}$/.test(phone)) { alert("Please enter a valid 10-digit phone number."); return; }
    try {
      const { authMod, dbMod } = await ensureFirebase();
      const credential = await authMod.createUserWithEmailAndPassword(authInstance, email, password);
      await authMod.updateProfile(credential.user, { displayName: name });
      const profile = { name, email, phone, addresses: [] };
      await dbMod.setDoc(dbMod.doc(dbInstance, "users", credential.user.uid), profile, { merge: true });
      await dbMod.setDoc(dbMod.doc(dbInstance, "users", credential.user.uid, "profile", "info"), profile, { merge: true });
      closeAuthModal();
      if (pendingReturnUrl && pendingReturnUrl !== pagePath) window.location.href = pendingReturnUrl;
    } catch (error) {
      alert("Signup failed: " + (error.message || "Please try again."));
    }
  }

  async function requireAuth({ mode = "login", returnUrl = pagePath } = {}) {
    await ensureFirebase();
    if (!authStateReady) await authReady;
    currentUser = authInstance?.currentUser || currentUser;
    if (currentUser) return true;
    await safeOpenAuthModal({ mode, returnUrl });
    return false;
  }

  window.TrendoraAuth = {
    get currentUser() { return authInstance?.currentUser || currentUser; },
    get ready() { return authReady; },
    openAuthModal: safeOpenAuthModal,
    requireAuth,
    refreshLayout() {
      renderNav();
      renderFooter();
    }
  };

  async function initAuthAwareLayout() {
    try {
      const { authMod } = await ensureFirebase();
      authMod.onAuthStateChanged(authInstance, user => {
        currentUser = user;
        authStateReady = true;
        authReadyResolve?.(user);
        renderNav();
        renderFooter();
      });
    } catch (error) {
      console.error("Shared layout auth failed:", error);
      authStateReady = true;
      authReadyResolve?.(null);
      renderNav();
      renderFooter();
    }
  }

  document.addEventListener("click", event => {
    if (!event.target.closest(".trendora-profile-menu")) {
      document.getElementById("profileDropdown")?.classList.remove("open");
      document.getElementById("profileMenuBtn")?.setAttribute("aria-expanded", "false");
    }
    if (!event.target.closest("#globalSearchPanel") && !event.target.closest("#navSearchToggle")) {
      const panel = document.getElementById("globalSearchPanel");
      if (panel) panel.hidden = true;
      document.body.classList.remove("search-panel-open");
      document.getElementById("navSearchToggle")?.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", event => {
    if(event.key === "Escape") {
      if(document.getElementById("trendoraAuthModal")?.classList.contains("open")) closeAuthModal();
      document.getElementById("profileDropdown")?.classList.remove("open");
      document.getElementById("profileMenuBtn")?.setAttribute("aria-expanded", "false");
      const searchPanel = document.getElementById("globalSearchPanel");
      if (searchPanel && !searchPanel.hidden) {
        searchPanel.hidden = true;
        document.body.classList.remove("search-panel-open");
        document.getElementById("navSearchToggle")?.setAttribute("aria-expanded", "false");
        document.getElementById("navSearchToggle")?.focus();
      }
    }
  });
  function refreshCartBadge() { document.querySelectorAll(".trendora-cart-badge").forEach(el => el.textContent = cartCount()); }
  window.addEventListener("storage", refreshCartBadge);
  window.addEventListener("cart-updated", refreshCartBadge);
  function boot() {
    if(adminPages.has(page) && page !== 'admin-login.html') {
      document.body.classList.add('admin-workspace');
      const sidebar=document.createElement('aside'); sidebar.className='admin-sidebar'; sidebar.setAttribute('aria-label','Store administration');
      sidebar.innerHTML=`<div class="admin-store"><span class="store-initial">t.</span><div><strong>Trendora store</strong><small>Store management</small></div></div><span class="sidebar-label">WORKSPACE</span>${navLink('admin-panel.html','<span>▦</span> Products & overview')}${navLink('admin-users.html','<span>◎</span> Customers & offers')}${navLink('customers-orders.html','<span>▤</span> Order management')}<div class="sidebar-bottom"><span class="sidebar-label">YOUR STOREFRONT</span><a href="index.html">Visit store <span>↗</span></a><p>Everything your store needs.<br>All in one place.</p></div>`;
      document.body.prepend(sidebar);
      const titles={'admin-panel.html':['Catalog overview','Manage your products, inventory and featured collection.'],'admin-users.html':['Customers & offers','Know your customers. Make every offer count.']};
      const main=document.querySelector('main');
      if(main&&titles[page]){ const head=document.createElement('header');head.className='admin-page-heading';head.innerHTML=`<div><span class="eyebrow">TRENDORA / WORKSPACE</span><h1>${titles[page][0]}</h1><p>${titles[page][1]}</p></div><a class="admin-store-link" href="index.html">View storefront ↗</a>`;main.prepend(head); }
    }
    renderNav();
    renderFooter();
    initAuthAwareLayout();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
