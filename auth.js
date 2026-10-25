/* PSIS accounts: email + phone + own password, per-user data, cloud sync (Firebase).
   Loaded after the main script. Does nothing until firebase-config.js has real settings. */
(function () {
  "use strict";
  if (typeof AUTH_ON === "undefined" || !AUTH_ON) return;

  const CFG = window.PSIS_FIREBASE_CONFIG;
  const LAST = "psis_last_user_v1";          // who was signed in last on this device (for offline start)
  const TS = "psis_sync_ts_v1";              // per-account: time of last local change
  const LEGACY_DONE = "psis_legacy_offered_v1";
  const SNAP_KEYS = () => [KEY_LEADS, KEY_TARGET, KEY_ATTENDANCE, KEY_PORTFOLIO_AMT, KEY_PORTFOLIO_EARNED, KEY_ACTIVITY, KEY_EARNINGS_TARGET].concat(typeof KEY_PARTNERS !== "undefined" ? [KEY_PARTNERS] : []);

  let cloud = null, user = null, pushTimer = null, applying = false, pending = false, busy = false, offlineMode = false;

  const $a = id => document.getElementById(id);
  const esc2 = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- styles + screen ---------- */
  const css = document.createElement("style");
  css.textContent = `
  .auth-screen{position:fixed;inset:0;z-index:50;background:var(--bg);overflow-y:auto;display:none;padding:18px 14px 40px}
  .auth-screen.show{display:block}
  .auth-card{max-width:420px;margin:0 auto;background:#fff;border:1px solid var(--gold-line);border-top:4px solid var(--gold);border-radius:16px;padding:18px;box-shadow:0 6px 22px #10274418}
  .auth-brand{display:flex;align-items:center;gap:10px;margin-bottom:12px}
  .auth-brand > svg{width:42px;height:42px;flex:0 0 42px}
  .auth-logo{width:54px;height:54px;flex:0 0 54px;border-radius:14px;background:linear-gradient(115deg,#073778,#06448f);display:grid;place-items:center;padding:6px;box-shadow:0 3px 10px #0737782e}
  .auth-logo svg{width:100%;height:100%;overflow:visible}
  .auth-brand strong{font-size:18px;color:var(--navy);letter-spacing:-.02em}
  .auth-brand small{display:block;color:var(--muted);font-size:11px}
  .auth-tabs{display:flex;gap:6px;margin:6px 0 10px}
  .auth-tabs button{flex:1;border:0;background:#edf2f7;color:#40536c;border-radius:9px;padding:10px;font-weight:750;font-size:13px}
  .auth-tabs button.active{background:var(--navy);color:#fff}
  .auth-card form{display:none}.auth-card form.show{display:block}
  .auth-card .primary{width:100%;margin-top:14px;padding:12px}
  .auth-link{background:none;border:0;color:var(--blue);font-size:12px;font-weight:700;padding:8px 0;text-decoration:underline}
  .auth-msg{margin:12px 0 0;font-size:13px;min-height:18px}
  .auth-msg.err{color:var(--red)}.auth-msg.ok{color:var(--green)}
  .auth-note{color:var(--muted);font-size:11px;margin-top:12px;line-height:1.4}
  .pwrow{position:relative}.pwrow input{padding-right:64px}
  .pwrow button{position:absolute;right:6px;top:50%;transform:translateY(-50%);border:0;background:none;color:var(--blue);font-weight:700;font-size:12px;padding:8px}
  .sync-chip{margin-left:auto;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border-radius:99px;padding:4px 8px;background:#2a4260;color:#f1dca9;white-space:nowrap}
  .sync-chip.ok{color:#9be3bd}.sync-chip.bad{color:#ffb4ab}
  .acct-row{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid #edf1f6;font-size:13px}
  .acct-row span:first-child{color:var(--muted)}
  `;
  document.head.appendChild(css);

  const screen = document.createElement("div");
  screen.id = "authScreen";
  screen.className = "auth-screen";
  screen.innerHTML = `
  <div class="auth-card">
    <div class="auth-brand">
      <svg viewBox="0 0 100 100" aria-hidden="true"><rect x="4" y="4" width="92" height="92" rx="22" fill="#102744"/><path d="M18 25h18c12 0 18 6 18 16S48 57 36 57h-6v18H18V25zm12 10v12h6c4 0 6-2 6-6s-2-6-6-6h-6z" fill="#d7b875"/><path d="M57 33c0-6 6-9 13-9 6 0 11 2 15 5l-5 9c-3-2-7-4-10-4-2 0-3 1-3 2 0 5 20 3 20 17 0 8-7 13-17 13-7 0-14-3-18-7l6-9c4 3 8 5 12 5 2 0 4-1 4-2 0-5-17-3-17-16z" fill="#fff"/><path d="M60 70h25" stroke="#d7b875" stroke-width="5" stroke-linecap="round"/></svg>
      <div><strong>PSI Sales</strong><small>Your own private account</small></div>
    </div>
    <div class="auth-tabs"><button type="button" data-m="login" class="active">Log in</button><button type="button" data-m="signup">Create account</button></div>

    <form id="fLogin" class="show" novalidate>
      <label for="lEmail">Email</label><input id="lEmail" type="email" autocomplete="email" inputmode="email" required>
      <label for="lPass">Password</label>
      <div class="pwrow"><input id="lPass" type="password" autocomplete="current-password" required><button type="button" data-show="lPass">Show</button></div>
      <button class="primary" type="submit">Log in</button>
      <button class="auth-link" type="button" data-m="reset">Forgot password?</button>
    </form>

    <form id="fSignup" novalidate>
      <label for="sTitle">Title (used in your greeting)</label>
      <select id="sTitle"><option value="Mr.">Mr.</option><option value="Ms.">Ms.</option><option value="Mrs.">Mrs.</option><option value="Miss">Miss</option><option value="Dr.">Dr.</option><option value="Prof.">Prof.</option><option value="">No title</option></select>
      <label for="sName">Full name</label><input id="sName" autocomplete="name" maxlength="80" required>
      <label for="sEmail">Email</label><input id="sEmail" type="email" autocomplete="email" inputmode="email" required>
      <label for="sPhone">Phone number</label><input id="sPhone" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="e.g. 0700 000000 or +256700000000" required>
      <label for="sPass">Password (at least 8 characters)</label>
      <div class="pwrow"><input id="sPass" type="password" autocomplete="new-password" minlength="8" required><button type="button" data-show="sPass">Show</button></div>
      <label for="sPass2">Confirm password</label>
      <div class="pwrow"><input id="sPass2" type="password" autocomplete="new-password" required><button type="button" data-show="sPass2">Show</button></div>
      <label class="checkline"><input id="sAgree" type="checkbox"><span>I will only record customer details I have a lawful basis to keep, and I understand my data is stored in my account.</span></label>
      <button class="primary" type="submit">Create account</button>
    </form>

    <form id="fReset" novalidate>
      <p class="hint">Enter your email and we will send a link to set a new password.</p>
      <label for="rEmail">Email</label><input id="rEmail" type="email" autocomplete="email" inputmode="email" required>
      <button class="primary" type="submit">Send reset link</button>
      <button class="auth-link" type="button" data-m="login">Back to log in</button>
    </form>

    <p id="authMsg" class="auth-msg" role="alert" aria-live="polite"></p>
    <p class="auth-note">Your phone number and email are kept in your account and are never shown to other users. Each person only sees their own leads and earnings.</p>
  </div>`;
  document.body.appendChild(screen);

  /* Use the same logo as the main screen (copy of the header logo, on a navy tile so the white parts show) */
  (function useMainLogo() {
    const src = document.querySelector(".appmark svg"), slot = screen.querySelector(".auth-brand > svg");
    if (!src || !slot) return;                                   // keep the built-in logo if the header logo is missing
    const html = src.outerHTML.replace(/id="([\w-]+)"/g, 'id="$1-login"').replace(/url\(#([\w-]+)\)/g, 'url(#$1-login)');
    const tile = document.createElement("span");
    tile.className = "auth-logo";
    tile.innerHTML = html;
    slot.replaceWith(tile);
  })();

  function setMode(m) {
    screen.querySelectorAll(".auth-tabs button").forEach(b => b.classList.toggle("active", b.dataset.m === m || (m === "reset" && b.dataset.m === "login")));
    $a("fLogin").classList.toggle("show", m === "login");
    $a("fSignup").classList.toggle("show", m === "signup");
    $a("fReset").classList.toggle("show", m === "reset");
    msg("");
  }
  function msg(text, kind) { const el = $a("authMsg"); el.textContent = text || ""; el.className = "auth-msg" + (kind ? " " + kind : ""); }
  screen.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.m) setMode(b.dataset.m);
    if (b.dataset.show) { const i = $a(b.dataset.show); const show = i.type === "password"; i.type = show ? "text" : "password"; b.textContent = show ? "Hide" : "Show"; }
  });
  function showAuth() { screen.classList.add("show"); document.body.style.overflow = "hidden"; }
  function hideAuth() { screen.classList.remove("show"); document.body.style.overflow = ""; }

  /* ---------- helpers ---------- */
  function normPhone(v) { const t = String(v || "").replace(/[\s().-]/g, ""); return /^\+?\d{9,15}$/.test(t) ? t : ""; }
  function normEmail(v) { return String(v || "").trim().toLowerCase(); }
  function friendly(e) {
    const c = (e && e.code) || "";
    const m = {
      "auth/email-already-in-use": "That email already has an account. Try logging in.",
      "auth/invalid-email": "Enter a valid email address.",
      "auth/weak-password": "Password is too weak. Use at least 8 characters.",
      "auth/invalid-credential": "Wrong email or password.",
      "auth/wrong-password": "Wrong email or password.",
      "auth/user-not-found": "Wrong email or password.",
      "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
      "auth/network-request-failed": "No internet connection. Try again when you are online.",
      "auth/requires-recent-login": "Please log out, log in again, then retry.",
      "auth/operation-not-allowed": "Email sign-in is not switched on in Firebase yet (owner setup step)."
    };
    return m[c] || "Something went wrong. Please try again.";
  }

  /* ---------- Firebase (loaded from Google's CDN, cached by the service worker) ---------- */
  async function loadFirebase() {
    const base = "https://www.gstatic.com/firebasejs/10.14.1/";
    const [A, U, F] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
    const app = A.initializeApp(CFG), auth = U.getAuth(app), db = F.getFirestore(app);
    const toUser = u => u ? { uid: u.uid, email: u.email, name: u.displayName || "", verified: u.emailVerified } : null;
    const storeRef = uid => F.doc(db, "users", uid, "store", "main");
    return {
      onAuth: cb => U.onAuthStateChanged(auth, u => cb(toUser(u))),
      async signUp({ name, email, phone, title, password }) {
        const c = await U.createUserWithEmailAndPassword(auth, email, password);
        try { await U.updateProfile(c.user, { displayName: name }); } catch (e) {}
        await F.setDoc(F.doc(db, "users", c.user.uid), { name, email, phone, title: title || "", createdAt: Date.now() });
        try { await U.sendEmailVerification(c.user); } catch (e) {}
        return toUser(auth.currentUser);
      },
      async signIn(email, password) { const c = await U.signInWithEmailAndPassword(auth, email, password); return toUser(c.user); },
      signOut: () => U.signOut(auth),
      resetPassword: email => U.sendPasswordResetEmail(auth, email),
      async reloadUser() { if (!auth.currentUser) return null; await auth.currentUser.reload(); return auth.currentUser.emailVerified; },
      async sendVerify() { if (auth.currentUser) await U.sendEmailVerification(auth.currentUser); },
      saveProfile: (uid, fields) => F.setDoc(F.doc(db, "users", uid), fields, { merge: true }),
      async getProfile(uid) { const d = await F.getDoc(F.doc(db, "users", uid)); return d.exists() ? d.data() : null; },
      async loadStore(uid) { const d = await F.getDoc(storeRef(uid)); return d.exists() ? d.data() : null; },
      saveStore: (uid, obj) => F.setDoc(storeRef(uid), obj),
      async deleteAccount(password) {
        const u = auth.currentUser;
        await U.reauthenticateWithCredential(u, U.EmailAuthProvider.credential(u.email, password));
        await F.deleteDoc(storeRef(u.uid));
        await F.deleteDoc(F.doc(db, "users", u.uid));
        await U.deleteUser(u);
      }
    };
  }

  /* ---------- sync ---------- */
  const snapshot = () => { const s = {}; SNAP_KEYS().forEach(k => { s[k] = localStorage.getItem(NS + k); }); return s; };
  const localTs = () => Number(localStorage.getItem(NS + TS) || 0);
  const setLocalTs = t => localStorage.setItem(NS + TS, String(t));
  function applySnapshot(snap, ts) {
    applying = true;
    try {
      SNAP_KEYS().forEach(k => { if (snap[k] == null) localStorage.removeItem(NS + k); else localStorage.setItem(NS + k, snap[k]); });
      setLocalTs(ts);
    } finally { applying = false; }
  }
  function setStatus(kind) {
    const chip = $a("syncChip"), row = $a("acctSync");
    const map = { synced: ["Saved to account", "ok"], pending: ["Saving…", ""], offline: ["Offline - will sync", "bad"], error: ["Sync problem", "bad"], toolarge: ["Data too large to sync", "bad"], local: ["Offline mode", "bad"] };
    let [t, c] = map[kind] || ["", ""];
    if (kind === "synced") {
      const now = new Date();
      try { localStorage.setItem(NS + "lastSyncAt", String(now.getTime())); } catch (e) {}
      t += " \u00b7 " + now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    if (chip) { chip.textContent = t; chip.className = "sync-chip " + c; }
    if (row) row.textContent = t;
  }
  window.PSIS_onChange = function () {
    if (applying || !user) return;
    setLocalTs(Date.now());
    if (offlineMode) { pending = true; setStatus("local"); return; }
    setStatus("pending");
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 1500);
  };
  async function push() {
    if (!user || !cloud) return false;
    if (!navigator.onLine) { pending = true; setStatus("offline"); return false; }
    const payload = { snapshot: snapshot(), updatedAt: localTs() };
    if (JSON.stringify(payload).length > 900000) { pending = true; setStatus("toolarge"); return false; }
    try { await cloud.saveStore(user.uid, payload); pending = false; setStatus("synced"); return true; }
    catch (e) { pending = true; setStatus("error"); return false; }
  }
  window.addEventListener("online", () => { if (offlineMode) { location.reload(); return; } if (user && pending) push(); });

  function offerLegacyImport() {
    try {
      if (localStorage.getItem(LEGACY_DONE)) return false;
      localStorage.setItem(LEGACY_DONE, "1");
      const raw = localStorage.getItem(KEY_LEADS);                 // legacy = un-prefixed keys
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr) || !arr.length) return false;
      if (!confirm("This phone already has " + arr.length + " saved lead(s) from before accounts existed.\n\nAdd them to the account you just created?")) return false;
      applying = true;
      try {
        SNAP_KEYS().forEach(k => { const v = localStorage.getItem(k); if (v != null) localStorage.setItem(NS + k, v); });
      } finally { applying = false; }
      setLocalTs(Date.now());
      return true;
    } catch (e) { return false; }
  }
  function clearLegacy() { try { SNAP_KEYS().forEach(k => localStorage.removeItem(k)); } catch (e) {} }

  async function initialSync() {
    let remote = null;
    try { remote = await cloud.loadStore(user.uid); }
    catch (e) { setStatus(navigator.onLine ? "error" : "offline"); pending = true; return; }
    const lt = localTs();
    if (remote && remote.snapshot && Number(remote.updatedAt) > lt) {
      applySnapshot(remote.snapshot, Number(remote.updatedAt));
      loadAll(); renderAll();
      setStatus("synced");
      return;
    }
    let imported = false;
    if (!remote) { imported = offerLegacyImport(); if (imported) { loadAll(); renderAll(); } }
    if (!remote || lt > Number(remote.updatedAt)) {
      if (!localTs()) setLocalTs(Date.now());
      const ok = await push();
      if (ok && imported) clearLegacy();     // data is safely in the account; remove the old unprotected copy
    } else setStatus("synced");
  }

  /* ---------- profile (name + title for the greeting) ---------- */
  function saveLastProfile() {
    try {
      const l = JSON.parse(localStorage.getItem(LAST) || "null");
      if (l && user && l.uid === user.uid) { l.name = window.PSIS_PROFILE.name; l.title = window.PSIS_PROFILE.title; localStorage.setItem(LAST, JSON.stringify(l)); }
    } catch (e) {}
  }
  async function refreshProfile() {
    if (!cloud || offlineMode || !user) return;
    try {
      const p = await cloud.getProfile(user.uid);
      if (!p) return;
      window.PSIS_PROFILE = { name: p.name || window.PSIS_PROFILE.name, title: p.title != null ? p.title : window.PSIS_PROFILE.title };
      saveLastProfile();
      const ph = $a("acctPhone"); if (ph && p.phone) ph.textContent = p.phone;
      const sel = $a("acctTitle"); if (sel) sel.value = window.PSIS_PROFILE.title || "";
      renderAll();
    } catch (e) {}
  }
  async function changeTitle(value) {
    window.PSIS_PROFILE = { name: window.PSIS_PROFILE.name, title: value };
    saveLastProfile();
    renderAll();
    if (cloud && !offlineMode && user) { try { await cloud.saveProfile(user.uid, { title: value }); } catch (e) { alert("Your title was changed on this phone but could not be saved to your account. Try again when you are online."); } }
  }

  /* ---------- entering / leaving the app ---------- */
  function enter(u, opts) {
    user = u;
    NS = u.uid + ":";
    let prev = null;
    try { prev = JSON.parse(localStorage.getItem(LAST) || "null"); } catch (e) {}
    if (!prev || prev.uid !== u.uid) prev = {};
    const title = opts && opts.title != null ? opts.title : (prev.title || "");
    const phone = (opts && opts.phone) || prev.phone || "";
    window.PSIS_PROFILE = { name: u.name || prev.name || "", title };
    try { localStorage.setItem(LAST, JSON.stringify({ uid: u.uid, name: u.name || prev.name || "", email: u.email || "", phone, title })); } catch (e) {}
    hideAuth();
    loadAll();
    renderAll();
    buildAccountUI(phone);
    showTab("home");
    if (offlineMode) setStatus("local");
    refreshProfile();
    checkVerified(false);
  }

  function buildAccountUI(phoneHint) {
    if (!$a("syncChip")) { const row = document.querySelector(".brandrow"); if (row) { const c = document.createElement("span"); c.id = "syncChip"; c.className = "sync-chip"; row.appendChild(c); } }
    let panel = $a("acctPanel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "acctPanel"; panel.className = "panel"; panel.style.marginBottom = "14px";
      const head = document.querySelector("#reports .section-head");
      if (head) head.after(panel);
    }
    panel.innerHTML = `<h3>Account</h3>
      <div class="acct-row"><span>Name</span><span>${esc2(user.name || "-")}</span></div>
      <div class="acct-row"><span>Email</span><span>${esc2(user.email || "-")}</span></div>
      <div class="acct-row"><span>Phone</span><span id="acctPhone">${esc2(phoneHint || "-")}</span></div>
      <div class="acct-row"><span>Greeting title</span><span><select id="acctTitle" style="width:auto;padding:4px 8px"><option value="Mr.">Mr.</option><option value="Ms.">Ms.</option><option value="Mrs.">Mrs.</option><option value="Miss">Miss</option><option value="Dr.">Dr.</option><option value="Prof.">Prof.</option><option value="">No title</option></select></span></div>
      <div class="acct-row"><span>Status</span><span id="acctSync"></span></div>
      <div id="acctVerifyBox"></div>
      <div class="actions"><button class="secondary" id="acctLogout" type="button">Log out</button><button class="danger" id="acctDelete" type="button">Delete my account</button></div>
      <div id="acctDelWrap" style="display:none;margin-top:10px"><label for="acctDelPass">Enter your password to confirm. This permanently deletes your account and all your data.</label><input id="acctDelPass" type="password" autocomplete="current-password"><div class="actions"><button class="danger" id="acctDelGo" type="button">Delete permanently</button></div></div>`;
    if (cloud && user.uid && !phoneHint) cloud.getProfile(user.uid).then(p => { if (p && p.phone && $a("acctPhone")) $a("acctPhone").textContent = p.phone; }).catch(() => {});
    { const sel = $a("acctTitle"); sel.value = (window.PSIS_PROFILE && window.PSIS_PROFILE.title) || ""; sel.onchange = () => changeTitle(sel.value); }
    $a("acctLogout").onclick = logout;
    $a("acctDelete").onclick = () => { $a("acctDelWrap").style.display = "block"; };
    $a("acctDelGo").onclick = deleteAccount;
    renderVerifyBox();
  }

  function renderVerifyBox() {
    const box = $a("acctVerifyBox"); if (!box) return;
    if (offlineMode || user.verified !== false) { box.innerHTML = user.verified ? '<p class="hint" style="margin:8px 0 0;color:var(--green)">&#10003; Email verified</p>' : ""; return; }
    box.innerHTML = '<p class="hint" style="margin:8px 0 0">Your email is not verified yet. Open the <b>newest</b> email from us and tap its link <b>once</b>, then tap <b>Check again</b>. If the link says it expired or was already used, tap <b>Check again</b> first (you may already be verified), or tap <b>Send new link</b>.</p>' +
      '<div class="actions"><button class="secondary smallbtn" id="acctCheck" type="button">Check again</button><button class="secondary smallbtn" id="acctResend" type="button">Send new link</button></div><p id="acctVerifyMsg" class="hint" aria-live="polite"></p>';
    $a("acctCheck").onclick = () => checkVerified(true);
    $a("acctResend").onclick = async () => {
      const m = $a("acctVerifyMsg");
      try { await cloud.sendVerify(); m.textContent = "New link sent. Use only the newest email, and tap its link once."; } catch (e) { m.textContent = friendly(e); }
    };
  }
  async function checkVerified(manual) {
    if (!cloud || offlineMode || !user || user.verified !== false || !cloud.reloadUser) return;
    try {
      const v = await cloud.reloadUser();
      if (v) { user.verified = true; renderVerifyBox(); }
      else if (manual && $a("acctVerifyMsg")) $a("acctVerifyMsg").textContent = "Not verified yet. Tap the link in the newest email, then try again.";
    } catch (e) { if (manual && $a("acctVerifyMsg")) $a("acctVerifyMsg").textContent = friendly(e); }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkVerified(false); });   // coming back from the email app
  window.addEventListener("focus", () => checkVerified(false));

  function wipeLocalForUser() {
    try { SNAP_KEYS().concat([TS]).forEach(k => localStorage.removeItem(NS + k)); localStorage.removeItem(LAST); } catch (e) {}
  }
  async function logout() {
    if (!confirm("Log out of this account on this phone?")) return;
    clearTimeout(pushTimer);
    if (!offlineMode) {
      const ok = await Promise.race([push(), new Promise(r => setTimeout(() => r(false), 8000))]);   // never hang on a bad connection
      if (!ok && !confirm("Your latest changes could not be saved to your account (no connection?). If you log out now they will be lost.\n\nLog out anyway?")) return;
    } else if (!confirm("You are offline, so recent changes are not saved to your account yet and will be lost if you log out. Log out anyway?")) return;
    try { if (cloud) await cloud.signOut(); } catch (e) {}
    wipeLocalForUser();
    location.reload();
  }
  async function deleteAccount() {
    const pw = $a("acctDelPass").value;
    if (!pw) { alert("Enter your password."); return; }
    if (!confirm("Delete your account and ALL your data permanently? This cannot be undone.")) return;
    try { await cloud.deleteAccount(pw); } catch (e) { alert(friendly(e)); return; }
    wipeLocalForUser();
    alert("Your account was deleted.");
    location.reload();
  }

  /* ---------- forms ---------- */
  $a("fLogin").addEventListener("submit", async e => {
    e.preventDefault();
    const email = normEmail($a("lEmail").value), pw = $a("lPass").value;
    if (!email || !pw) { msg("Enter your email and password.", "err"); return; }
    if (!cloud) { msg("Connect to the internet to log in.", "err"); return; }
    busy = true; msg("Logging in…");
    try { const u = await cloud.signIn(email, pw); busy = false; enter(u); await initialSync(); }
    catch (err) { busy = false; msg(friendly(err), "err"); }
  });
  $a("fSignup").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $a("sName").value.trim(), email = normEmail($a("sEmail").value), phone = normPhone($a("sPhone").value), pw = $a("sPass").value;
    if (!name) { msg("Enter your full name.", "err"); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { msg("Enter a valid email address.", "err"); return; }
    if (!phone) { msg("Enter a valid phone number (9 to 15 digits, optional + at the start).", "err"); return; }
    if (pw.length < 8) { msg("Password must be at least 8 characters.", "err"); return; }
    if (pw !== $a("sPass2").value) { msg("The two passwords do not match.", "err"); return; }
    if (!$a("sAgree").checked) { msg("Please tick the box to continue.", "err"); return; }
    if (!cloud) { msg("Connect to the internet to create your account.", "err"); return; }
    busy = true; msg("Creating your account…");
    try { const title = $a("sTitle").value; const u = await cloud.signUp({ name, email, phone, title, password: pw }); busy = false; u.name = u.name || name; enter(u, { phone, title }); await initialSync(); }
    catch (err) { busy = false; msg(friendly(err), "err"); }
  });
  $a("fReset").addEventListener("submit", async e => {
    e.preventDefault();
    const email = normEmail($a("rEmail").value);
    if (!email) { msg("Enter your email.", "err"); return; }
    if (!cloud) { msg("Connect to the internet first.", "err"); return; }
    try { await cloud.resetPassword(email); } catch (err) { if (!/user-not-found/.test((err && err.code) || "")) { msg(friendly(err), "err"); return; } }
    msg("If that email has an account, a reset link is on its way. Check your inbox and spam.", "ok");
  });

  /* ---------- start ---------- */
  (async function start() {
    showAuth();
    let last = null;
    try { last = JSON.parse(localStorage.getItem(LAST) || "null"); } catch (e) {}
    try {
      cloud = window.__PSIS_FAKE_CLOUD || await loadFirebase();
    } catch (e) {
      cloud = null;
      if (last && last.uid) { offlineMode = true; enter({ uid: last.uid, name: last.name, email: last.email, verified: true }, { phone: last.phone }); return; }
      msg("Connect to the internet to log in or create your account.", "err");
      return;
    }
    cloud.onAuth(async u => {
      if (busy) return;
      if (u && !user) { enter(u); await initialSync(); }
      else if (!u && !user) { showAuth(); }
    });
  })();
})();
