import { normalizeCart } from "./commerce.mjs";

  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
  import {
    getAuth, onAuthStateChanged, signOut,
    setPersistence, browserLocalPersistence,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile
  } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
  import {
    getFirestore, collection, onSnapshot, doc, updateDoc, setDoc, serverTimestamp
  } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

  const firebaseConfig = {
     apiKey: "AIzaSyBFh6tNI6roZQecdYGtzs7tX75lY4NHbqo",
    authDomain: "trendora-1cd23.firebaseapp.com",
    projectId: "trendora-1cd23",
    storageBucket: "trendora-1cd23.appspot.com",
    messagingSenderId: "1080352553475",
    appId: "1:1080352553475:web:850319561617a21fdfec36"
  };

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);
  setPersistence(auth, browserLocalPersistence).catch(console.error);

  const cartCountElement = document.getElementById("cartCount");
  const notification = document.getElementById("notification");
  const ordersModal = document.getElementById("ordersModal");
  const ordersList = document.getElementById("ordersList");
  const productSearch = document.getElementById("productSearch");
  const productFilter = document.getElementById("productFilter");
  const productSort = document.getElementById("productSort");
  const shopCount = document.getElementById("shopCount");
  const sectionCount = document.getElementById("sectionCount");
  const pageLoader = document.getElementById("pageLoader");

  // Auth modal elements
  const authModal = document.getElementById("authModal");
  const authClose = document.getElementById("authClose");
  const authError = document.getElementById("authError");
  const authTitle = document.getElementById("authTitle");
  const authSubtitle = document.getElementById("authSubtitle");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const loginSubmit = document.getElementById("loginSubmit");
  const signupSubmit = document.getElementById("signupSubmit");
  const authTabs = document.querySelectorAll(".auth-tab");

  let currentUser = null;
  let ordersData = [];
  let productsData = [];
  let productsUnsubscribe = null;
  let productsLoaded = false;
  let productsError = false;
  let activeCategory = "all";
  let pendingReturnUrl = null;
  const WISHLIST_KEY = "trendora-wishlist";
  const RECENT_KEY = "trendora-recent-products";

  function readProductIds(key){
    try { const values = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(values) ? values.map(String) : []; }
    catch { return []; }
  }
  function writeProductIds(key, ids){ localStorage.setItem(key, JSON.stringify([...new Set(ids.map(String))])); }
  function wishlistIds(){ return readProductIds(WISHLIST_KEY); }
  function isSaved(id){ return wishlistIds().includes(String(id)); }
  function toggleSaved(product){
    const ids = wishlistIds(); const id = String(product.id);
    const next = ids.includes(id) ? ids.filter(value => value !== id) : [id, ...ids];
    writeProductIds(WISHLIST_KEY, next);
    showNotification(ids.includes(id) ? `Removed “${product.name}” from saved` : `Saved “${product.name}” for later`);
    renderProducts(); renderPersonalRails();
  }
  function cardImageMarkup(product){
    const image = getProductImages(product)[0];
    return image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(product.name || "Product")}" loading="lazy">` : '<span class="image-unavailable">Image unavailable</span>';
  }
  function renderPersonalRails(){
    const savedRail = document.getElementById("savedRail");
    const recentRail = document.getElementById("recentRail");
    if(!savedRail || !recentRail) return;
    const productsById = new Map(productsData.map(product => [String(product.id), product]));
    const buildRail = (host, ids, emptyText) => {
      const products = ids.map(id => productsById.get(id)).filter(Boolean).slice(0, 8);
      host.innerHTML = products.length ? products.map(product => `<article class="rail-card"><button class="rail-image" type="button" data-open="${escapeHTML(product.id)}">${cardImageMarkup(product)}</button><div><p>${escapeHTML(product.category || "Trendora edit")}</p><h3>${escapeHTML(product.name || "Untitled")}</h3><strong>${new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(product.price || 0))}</strong><div class="rail-actions"><button type="button" data-open="${escapeHTML(product.id)}">View</button><button type="button" data-save="${escapeHTML(product.id)}">${isSaved(product.id) ? "Saved" : "Save"}</button></div></div></article>`).join("") : `<p class="rail-empty">${emptyText}</p>`;
      host.querySelectorAll("[data-open]").forEach(button => button.onclick = () => window.location.href = `product-details.html?id=${encodeURIComponent(button.dataset.open)}`);
      host.querySelectorAll("[data-save]").forEach(button => { const product = productsById.get(String(button.dataset.save)); if(product) button.onclick = () => toggleSaved(product); });
      return products.length;
    };
    const savedCount = buildRail(document.getElementById("savedProducts"), wishlistIds(), "Save products to build your shortlist.");
    const recentCount = buildRail(document.getElementById("recentProducts"), readProductIds(RECENT_KEY), "Products you view will appear here.");
    savedRail.hidden = !savedCount;
    recentRail.hidden = !recentCount;
  }

  function showNotification(msg){
    notification.innerText = msg;
    notification.classList.add("show");
    setTimeout(()=>notification.classList.remove("show"),2500);
  }
  function updateCartCount(){
    const cart = normalizeCart(localStorage.getItem("cart") || "[]");
    window.dispatchEvent(new Event("cart-updated"));
    if (cartCountElement) cartCountElement.innerText = cart.reduce((sum,i)=>sum+(i.quantity||1),0);
  }
  function getProductImages(data){
    if(Array.isArray(data.imageUrls) && data.imageUrls.length) return data.imageUrls.filter(Boolean);
    return data.imageUrl ? [data.imageUrl] : [];
  }
  function getCreatedMillis(item){
    if(item.createdAt?.toMillis) return item.createdAt.toMillis();
    if(item.createdAt?.seconds) return item.createdAt.seconds * 1000;
    return 0;
  }
  function getFilteredProducts(){
    const search = productSearch.value.trim().toLowerCase();
    const filter = productFilter.value;
    const sort = productSort.value;
    let list = productsData.filter(product => {
      const name = (product.name || "").toLowerCase();
      const desc = (product.description || "").toLowerCase();
      const price = Number(product.price || 0);
      const qty = Number(product.quantity || 0);
      const matchesSearch = !search || name.includes(search) || desc.includes(search);
      const matchesFilter =
        filter === "all" ||
        (filter === "inStock" && qty > 0) ||
        (filter === "under1000" && price < 1000) ||
        (filter === "1000to5000" && price >= 1000 && price <= 5000) ||
        (filter === "above5000" && price > 5000);
      return matchesSearch && matchesFilter && (activeCategory === "all" || (product.category || "Other") === activeCategory);
    });
    list.sort((a,b) => {
      if(sort === "nameAsc") return (a.name || "").localeCompare(b.name || "");
      if(sort === "priceLow") return Number(a.price || 0) - Number(b.price || 0);
      if(sort === "priceHigh") return Number(b.price || 0) - Number(a.price || 0);
      return getCreatedMillis(b) - getCreatedMillis(a);
    });
    return list;
  }

  // ============ AUTH MODAL ============
  function openAuthModal({mode="login", returnUrl=null} = {}){
    pendingReturnUrl = returnUrl;
    setAuthMode(mode);
    authError.classList.remove("show");
    authModal.classList.add("open");
  }
  function closeAuthModal(){
    authModal.classList.remove("open");
    authError.classList.remove("show");
    loginForm.reset(); signupForm.reset();
  }
  function setAuthMode(mode){
    authTabs.forEach(t=>t.classList.toggle("active", t.dataset.tab === mode));
    if(mode === "signup"){
      loginForm.style.display = "none";
      signupForm.style.display = "";
      authTitle.textContent = "Create your account";
      authSubtitle.textContent = "Join Trendora to save your cart, track orders and unlock offers.";
    } else {
      loginForm.style.display = "";
      signupForm.style.display = "none";
      authTitle.textContent = "Welcome back";
      authSubtitle.textContent = "Log in to access your profile, orders and cart.";
    }
    authError.classList.remove("show");
  }
  function showAuthError(msg){
    authError.textContent = msg;
    authError.classList.add("show");
  }
  function friendlyAuthError(err){
    const code = err?.code || "";
    if(code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found"))
      return "Invalid email or password.";
    if(code.includes("email-already-in-use")) return "This email is already registered. Try logging in.";
    if(code.includes("weak-password")) return "Password should be at least 6 characters.";
    if(code.includes("invalid-email")) return "Please enter a valid email address.";
    if(code.includes("network")) return "Network error. Check your connection.";
    return err?.message || "Something went wrong. Please try again.";
  }
  authTabs.forEach(t => t.addEventListener("click", () => setAuthMode(t.dataset.tab)));
  document.querySelectorAll("[data-switch]").forEach(b=>b.addEventListener("click",()=>setAuthMode(b.dataset.switch)));
  authClose.addEventListener("click", closeAuthModal);
  authModal.addEventListener("click", e => { if(e.target === authModal) closeAuthModal(); });
  document.addEventListener("keydown", e => { if(e.key === "Escape" && authModal.classList.contains("open")) closeAuthModal(); });

  loginForm.addEventListener("submit", async e => {
    e.preventDefault();
    authError.classList.remove("show");
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    loginSubmit.disabled = true;
    loginSubmit.innerHTML = '<span class="mini-spin"></span> Logging in…';
    try {
      await signInWithEmailAndPassword(auth, email, password);
      closeAuthModal();
      showNotification("Welcome back!");
      if(pendingReturnUrl){ const url = pendingReturnUrl; pendingReturnUrl = null; window.location.href = url; }
    } catch(err){ showAuthError(friendlyAuthError(err)); }
    finally { loginSubmit.disabled = false; loginSubmit.textContent = "Log in"; }
  });

  signupForm.addEventListener("submit", async e => {
    e.preventDefault();
    authError.classList.remove("show");
    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    signupSubmit.disabled = true;
    signupSubmit.innerHTML = '<span class="mini-spin"></span> Creating account…';
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if(name) await updateProfile(cred.user, { displayName: name });
      try {
        await setDoc(doc(db, "users", cred.user.uid), {
          name, email, createdAt: serverTimestamp()
        }, { merge: true });
      } catch(_){}
      closeAuthModal();
      showNotification("Account created! Welcome to Trendora.");
      if(pendingReturnUrl){ const url = pendingReturnUrl; pendingReturnUrl = null; window.location.href = url; }
    } catch(err){ showAuthError(friendlyAuthError(err)); }
    finally { signupSubmit.disabled = false; signupSubmit.textContent = "Create account"; }
  });

  // CART
  function addItemToCart(id,name,price,imageUrl,imageUrls=[],stock=Infinity){
    if(!currentUser){
      openAuthModal({mode:"login"});
      return;
    }
    const available = Number(stock);
    if (Number.isFinite(available) && available <= 0) {
      showNotification(`"${name}" is out of stock`);
      return;
    }
    let cart = normalizeCart(localStorage.getItem("cart") || "[]");
    const exist = cart.find(i=>i.id===id);
    if(exist) {
      if (Number.isFinite(available) && Number(exist.quantity || 1) >= available) {
        showNotification(`Only ${available} item${available === 1 ? "" : "s"} available`);
        return;
      }
      exist.quantity = (exist.quantity||1)+1;
    }
    else cart.push({id,name,price,quantity:1,imageUrl,imageUrls});
    localStorage.setItem("cart",JSON.stringify(cart));
    updateCartCount();
    showNotification(`"${name}" added to cart`);
  }

  // AUTH
  onAuthStateChanged(auth, user => {
    currentUser = user || null;
    if (user) initOrdersListener();
    loadProducts();
    updateCartCount();
  });

  // PRODUCTS
  function loadProducts(){
    if(productsUnsubscribe) return;
    productsUnsubscribe = onSnapshot(collection(db,"products"), snapshot=>{
      productsData = snapshot.docs.map(docSnap => ({id: docSnap.id, ...docSnap.data()}));
      productsLoaded = true;
      productsError = false;
      renderCategories();
      renderEditorialImages();
      renderProducts();
      hidePageLoader();
    }, err => {
      console.error(err);
      productsError = true;
      productsLoaded = true;
      renderProducts();
      hidePageLoader();
    });
  }
  function hidePageLoader(){ setTimeout(()=>pageLoader.classList.add("hide"), 300); }
  function skeletonMarkup(n=8){
    let html = "";
    for(let i=0;i<n;i++){
      html += `<div class="skeleton">
        <div class="sk-media sk-shimmer"></div>
        <div class="sk-body">
          <div class="sk-line mid sk-shimmer"></div>
          <div class="sk-line short sk-shimmer"></div>
          <div class="sk-line sk-shimmer" style="width:40%"></div>
        </div>
        <div class="sk-actions"><div class="sk-btn sk-shimmer"></div><div class="sk-btn sk-shimmer"></div></div>
      </div>`;
    }
    return html;
  }
  function renderProducts(){
    const productsDiv = document.getElementById("products");
    if(!productsLoaded){
      productsDiv.setAttribute("aria-busy", "true");
      productsDiv.innerHTML = skeletonMarkup(8);
      shopCount.textContent = "Loading collection…";
      sectionCount.textContent = "Loading collection…";
      return;
    }
    productsDiv.setAttribute("aria-busy", "false");
    if(productsError){
      productsDiv.innerHTML = '<div class="empty-state"><h4>We couldn’t load the collection</h4><p>Check your connection and try again.</p><button type="button" id="retryProducts">Try again</button></div>';
      shopCount.textContent = "Collection unavailable";
      sectionCount.textContent = "";
      document.getElementById("retryProducts").onclick = () => { productsUnsubscribe?.(); productsUnsubscribe = null; productsLoaded = false; renderProducts(); loadProducts(); };
      return;
    }
    const products = getFilteredProducts();
    productsDiv.innerHTML="";
    const countText = `${products.length} item${products.length === 1 ? "" : "s"} available`;
    shopCount.textContent = countText;
    sectionCount.textContent = countText;
    if(!products.length){
      productsDiv.innerHTML = `<div class="empty-state"><h4>No products found</h4><p>Try another search or reset your filters to explore the collection.</p></div>`;
      return;
    }
    products.forEach((data)=>{
      const images = getProductImages(data);
      const primaryImage = images[0] || "";
      const thumbs = images.slice(0, 4);
      const stock = Number(data.quantity || 0);
      const inStock = stock > 0;
      const div=document.createElement("div");
      div.className="product";
      div.innerHTML=`
        <a class="product-open" href="product-details.html?id=${encodeURIComponent(data.id)}" aria-label="View details for ${escapeHTML(data.name || 'product')}">
          <div class="product-media">
            ${primaryImage ? `<img src="${escapeHTML(primaryImage)}" alt="${escapeHTML(data.name || 'Product')}" loading="lazy" />` : `<span class="image-unavailable">Image unavailable</span>`}
            <span class="stock-tag ${inStock?'':'out'}">${inStock?'In stock':'Sold out'}</span>
            ${thumbs.length > 1 ? `<div class="thumb-row">${thumbs.map(url=>`<img src="${escapeHTML(url)}" alt="" />`).join("")}</div>` : ""}
          </div>
          <div class="product-info">
            <h3>${escapeHTML(data.name||'Untitled')}</h3>
            <div class="price-row"><div class="price"><em>₹</em>${Number(data.price || 0).toFixed(2)}</div><span class="product-category">${escapeHTML(data.category || "The everyday edit")}</span></div>
          </div>
        </a>
        <button class="save-product ${isSaved(data.id) ? "is-saved" : ""}" type="button" aria-label="${isSaved(data.id) ? "Remove" : "Save"} ${escapeHTML(data.name || "product")}" title="${isSaved(data.id) ? "Saved" : "Save for later"}">♥</button>
        <div class="btn-group">
          <button class="addCartBtn" ${inStock?'':'disabled'}>${inStock?'Add to Cart':'Out of Stock'}</button>
          <a class="detailsBtn" href="product-details.html?id=${encodeURIComponent(data.id)}">Details ↗</a>
        </div>
      `;
      div.querySelectorAll("img").forEach(img => {
        img.addEventListener("error", () => { img.hidden = true; if(!img.parentElement.querySelector(".image-unavailable")){ const label = document.createElement("span"); label.className = "image-unavailable"; label.textContent = "Image unavailable"; img.parentElement.appendChild(label); } }, {once:true});
        img.addEventListener("load", () => img.classList.add("loaded"), {once:true});
      });
      productsDiv.appendChild(div);
      div.querySelector(".addCartBtn").onclick=()=>addItemToCart(data.id,data.name,data.price,primaryImage,images,stock);
      div.querySelector(".save-product").onclick=()=>toggleSaved(data);
    });
    renderPersonalRails();
  }

  // ORDERS
  function initOrdersListener(){
    const ref=collection(db,"users",currentUser.uid,"orders");
    onSnapshot(ref,snap=>{
      ordersData=[];
      snap.forEach(d=>ordersData.push({id:d.id,...d.data()}));
      if(ordersModal.style.display==="flex") renderOrders();
    });
  }
  function renderOrders(){
    ordersList.innerHTML="";
    if(!currentUser){ ordersList.innerHTML="<p>Please log in to view your orders.</p>"; return; }
    if(!ordersData.length){ ordersList.innerHTML="<p>No orders found yet.</p>"; return; }
    ordersData.forEach(order=>{
      const status = order.orderStatus || "Pending";
      const badgeClass = status==="Cancelled by User"?"CancelledUser":status.replace(/\s/g,'');
      const paymentStatus = order.paymentStatus || "Pending";
      const paymentClass = paymentStatus==="Successful"?"PaymentSuccessful":
                           paymentStatus==="Failed"?"PaymentFailed":"PaymentPending";
      const div=document.createElement("div");
      div.className="order-card";
      div.innerHTML=`
        <h3>Order ID: ${order.id}</h3>
        <p>Total: ₹${Number(order.totalAmount||0).toFixed(2)}</p>
        <p>Status: <span class="status-badge ${badgeClass}">${status}</span></p>
        <p>Payment: <span class="status-badge ${paymentClass}">${paymentStatus}</span></p>
        <p>Items:</p>
        <ul>${(order.items||[]).map(i=>`<li>${i.name} (x${i.quantity}) — ₹${Number(i.price*i.quantity).toFixed(2)}</li>`).join("")}</ul>
        ${status!=="Cancelled by User" && status!=="Completed" ? `<button class="cancelUserOrderBtn" data-id="${order.id}" data-adminuid="${order.adminUID||''}">Cancel Order</button>` : ""}
      `;
      ordersList.appendChild(div);
    });
    document.querySelectorAll(".cancelUserOrderBtn").forEach(btn=>{
      btn.onclick=async ()=>{
        const id=btn.dataset.id;
        const adminUID=btn.dataset.adminuid || ordersData.find(o=>o.id===id)?.adminUID;
        if(await window.trendoraDialog.confirm("Are you sure you want to cancel this order?")){
          try{
            btn.innerHTML = '<span class="mini-spin"></span> Cancelling…';
            btn.disabled = true;
            await updateDoc(doc(db,"users",currentUser.uid,"orders",id),{orderStatus:"Cancelled by User"});
            if(adminUID) await updateDoc(doc(db,"admins",adminUID,"orders",id),{orderStatus:"Cancelled by User"});
            showNotification("Order cancelled successfully!");
          }catch(err){console.error(err);alert("Failed to cancel order.");}
        }
      };
    });
  }

  document.querySelector(".close-orders").onclick=()=>ordersModal.style.display="none";

  productSearch.addEventListener("input", renderProducts);
  productFilter.addEventListener("change", renderProducts);
  productSort.addEventListener("change", renderProducts);
  document.getElementById("resetFiltersBtn").onclick = () => {
    productSearch.value = ""; productFilter.value = "all"; productSort.value = "latest"; activeCategory = "all"; renderCategories();
    renderProducts();
  };
  document.getElementById("clearSavedBtn")?.addEventListener("click", () => { writeProductIds(WISHLIST_KEY, []); renderProducts(); renderPersonalRails(); showNotification("Saved products cleared"); });

  function escapeHTML(value){ return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function renderEditorialImages(){
    const withPhotos = productsData.filter(p => p.featured === true && getProductImages(p).length);
    ["heroProductImage", "storyProductImage"].forEach((id,index) => {
      const image = document.getElementById(id);
      const product = withPhotos[index] || withPhotos[0];
      if(!product) { image.hidden = true; return; }
      image.onload = () => { image.hidden = false; image.parentElement.classList.remove("hero-awaiting"); };
      image.onerror = () => { image.hidden = true; };
      image.alt = product.name || "Trendora collection";
      image.src = getProductImages(product)[0];
      if(index === 0){
        document.querySelector(".photo-label strong").textContent = product.name || "Everyday, elevated.";
        const link = document.querySelector(".photo-arrow");
        link.href = "product-details.html?id=" + encodeURIComponent(product.id);
        link.setAttribute("aria-label", "View " + (product.name || "featured product"));
      }
    });
  }
  function renderCategories(){
    const categories = ["all", ...new Set(productsData.map(p => p.category || "Other"))];
    const host = document.getElementById("categoryTabs");
    host.replaceChildren();
    categories.forEach(category => {
      const button = document.createElement("button");
      button.textContent = category === "all" ? "All products" : category;
      button.className = "category-tab";
      button.setAttribute("aria-pressed", String(category === activeCategory));
      button.onclick = () => { activeCategory = category; renderCategories(); renderProducts(); };
      host.appendChild(button);
    });
  }
  const query = new URLSearchParams(location.search).get("q");
  if(query) productSearch.value = query;
  renderProducts();
  loadProducts();
  updateCartCount();
  setTimeout(hidePageLoader, 6000);
