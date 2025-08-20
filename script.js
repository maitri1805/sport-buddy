/* ==========================================================
           Sports Buddy — Single File App
           - Firebase-ready (Auth + Firestore)
           - Demo Mode fallback (localStorage) if Firebase not configured
           ========================================================== */

// ---------- Small helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const nowISO = () => new Date().toISOString();
const formatDT = (iso) => new Date(iso).toLocaleString();

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}
function log(msg, level = "info") {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  console[level === "error" ? "error" : "log"](line);
  const box = $("#logbox");
  box.textContent += line + "\n";
  box.scrollTop = box.scrollHeight;
}

// ---------- App State ----------
let STATE = {
  user: null, // {uid,email,role}
  role: "user", // 'user' | 'admin' (chosen on landing for auth context)
  citySelected: null, // for admin area editing
};

// ---------- Storage Layer (Firebase or Demo) ----------
class DemoStore {
  constructor() {
    this.ns = "SB__";
    this.ensureSeeds();
  }
  ensureSeeds() {
    if (!localStorage.getItem(this.ns + "cats"))
      localStorage.setItem(
        this.ns + "cats",
        JSON.stringify([
          "Football",
          "Cricket",
          "Badminton",
          "Baseball",
          "Boxing",
          " Golf",
          "Tennies",
          "Table tennies",
        ])
      );
    if (!localStorage.getItem(this.ns + "cities"))
      localStorage.setItem(
        this.ns + "cities",
        JSON.stringify([
          {
            name: "Ahmedabad",
            areas: [
              "Navrangpura",
              "Maninagar",
              "Isanpur",
              "Narol",
              "Shivrangani",
              "Nehrunagar",
              "Gota",
              "Chandkheda",
            ],
          },
          { name: "Surat", areas: ["Adajan", "Vesu"] },
        ])
      );
    if (!localStorage.getItem(this.ns + "events"))
      localStorage.setItem(this.ns + "events", JSON.stringify([]));
    if (!localStorage.getItem(this.ns + "users"))
      localStorage.setItem(this.ns + "users", JSON.stringify([])); // [{uid,email,pass,role}]
  }
  _g(k) {
    return JSON.parse(localStorage.getItem(this.ns + k) || "null");
  }
  _s(k, v) {
    localStorage.setItem(this.ns + k, JSON.stringify(v));
  }

  // Auth
  async register(email, pass, role) {
    const users = this._g("users");
    if (users.find((u) => u.email === email))
      throw new Error("Email already registered");
    const uid = "u_" + Math.random().toString(36).slice(2, 10);
    const u = { uid, email, pass, role };
    users.push(u);
    this._s("users", users);
    return { uid, email, role };
  }
  async login(email, pass) {
    const u = this._g("users").find(
      (x) => x.email === email && x.pass === pass
    );
    if (!u) throw new Error("Invalid credentials");
    return {
      uid: u.uid,
      email: u.email,
      role: u.role || (email.endsWith("@admin.com") ? "admin" : "user"),
    };
  }
  async me() {
    return this._g("session") || null;
  }
  async setSession(user) {
    this._s("session", user);
  }
  async clearSession() {
    localStorage.removeItem(this.ns + "session");
  }

  // Taxonomy
  async getCats() {
    return this._g("cats");
  }
  async addCat(name) {
    const cats = this._g("cats");
    if (!name.trim()) return;
    if (!cats.includes(name)) cats.push(name);
    this._s("cats", cats);
  }
  async delCat(name) {
    let cats = this._g("cats").filter((c) => c !== name);
    this._s("cats", cats);
  }

  async getCities() {
    return this._g("cities");
  }
  async addCity(name) {
    const cities = this._g("cities");
    if (!name.trim()) return;
    if (!cities.find((c) => c.name === name)) cities.push({ name, areas: [] });
    this._s("cities", cities);
  }
  async delCity(name) {
    let cities = this._g("cities").filter((c) => c.name !== name);
    this._s("cities", cities);
  }
  async addArea(city, area) {
    const cities = this._g("cities");
    const c = cities.find((x) => x.name === city);
    if (c && area.trim() && !c.areas.includes(area)) c.areas.push(area);
    this._s("cities", cities);
  }
  async delArea(city, area) {
    const cities = this._g("cities");
    const c = cities.find((x) => x.name === city);
    if (c) c.areas = c.areas.filter((a) => a !== area);
    this._s("cities", cities);
  }

  // Events
  async addEvent(ev) {
    const all = this._g("events");
    ev.id = "e_" + Math.random().toString(36).slice(2, 9);
    all.push(ev);
    this._s("events", all);
    return ev.id;
  }
  async setEvent(id, data) {
    const all = this._g("events");
    const i = all.findIndex((e) => e.id === id);
    if (i > -1) {
      all[i] = { ...all[i], ...data };
      this._s("events", all);
    }
  }
  async delEvent(id) {
    const all = this._g("events").filter((e) => e.id !== id);
    this._s("events", all);
  }
  async myEvents(uid) {
    return this._g("events").filter((e) => e.uid === uid);
  }
  async allEvents() {
    return this._g("events");
  }
}

// Firebase-backed store (if configured)
class FirebaseStore {
  constructor(firebase) {
    this.fb = firebase;
    this.auth = firebase.getAuth();
    this.db = firebase.getFirestore();
  }
  // Auth
  async register(email, pass, role) {
    const cred = await this.fb.createUserWithEmailAndPassword(
      this.auth,
      email,
      pass
    );
    await this.fb.setDoc(this.fb.doc(this.db, "profiles", cred.user.uid), {
      role,
      email,
    });
    return { uid: cred.user.uid, email: cred.user.email, role };
  }
  async login(email, pass) {
    const cred = await this.fb.signInWithEmailAndPassword(
      this.auth,
      email,
      pass
    );
    // read role
    const snap = await this.fb.getDoc(
      this.fb.doc(this.db, "profiles", cred.user.uid)
    );
    const role = snap.exists()
      ? snap.data().role
      : email.endsWith("@admin.com")
      ? "admin"
      : "user";
    return { uid: cred.user.uid, email: cred.user.email, role };
  }
  async me() {
    return new Promise((resolve) => {
      const unsub = this.fb.onAuthStateChanged(this.auth, async (user) => {
        unsub();
        if (!user) return resolve(null);
        const snap = await this.fb.getDoc(
          this.fb.doc(this.db, "profiles", user.uid)
        );
        const role = snap.exists() ? snap.data().role : "user";
        resolve({ uid: user.uid, email: user.email, role });
      });
    });
  }
  async setSession() {
    /* Firebase keeps session itself */
  }
  async clearSession() {
    await this.fb.signOut(this.auth);
  }

  // Taxonomy
  async getCats() {
    const q = await this.fb.getDocs(this.fb.collection(this.db, "cats"));
    return q.docs.map((d) => d.id);
  }
  async addCat(name) {
    await this.fb.setDoc(this.fb.doc(this.db, "cats", name), {
      createdAt: nowISO(),
    });
  }
  async delCat(name) {
    await this.fb.deleteDoc(this.fb.doc(this.db, "cats", name));
  }

  async getCities() {
    const q = await this.fb.getDocs(this.fb.collection(this.db, "cities"));
    return q.docs.map((d) => ({ name: d.id, areas: d.data().areas || [] }));
  }
  async addCity(name) {
    await this.fb.setDoc(this.fb.doc(this.db, "cities", name), { areas: [] });
  }
  async delCity(name) {
    await this.fb.deleteDoc(this.fb.doc(this.db, "cities", name));
  }
  async addArea(city, area) {
    const ref = this.fb.doc(this.db, "cities", city);
    const snap = await this.fb.getDoc(ref);
    const areas = snap.exists() ? snap.data().areas || [] : [];
    if (!areas.includes(area)) areas.push(area);
    await this.fb.setDoc(ref, { areas }, { merge: true });
  }
  async delArea(city, area) {
    const ref = this.fb.doc(this.db, "cities", city);
    const snap = await this.fb.getDoc(ref);
    const areas = (snap.data().areas || []).filter((a) => a !== area);
    await this.fb.setDoc(ref, { areas }, { merge: true });
  }

  // Events
  async addEvent(ev) {
    const ref = await this.fb.addDoc(this.fb.collection(this.db, "events"), ev);
    return ref.id;
  }
  async setEvent(id, data) {
    await this.fb.setDoc(this.fb.doc(this.db, "events", id), data, {
      merge: true,
    });
  }
  async delEvent(id) {
    await this.fb.deleteDoc(this.fb.doc(this.db, "events", id));
  }
  async myEvents(uid) {
    const q = await this.fb.getDocs(
      this.fb.query(
        this.fb.collection(this.db, "events"),
        this.fb.where("uid", "==", uid)
      )
    );
    return q.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async allEvents() {
    const q = await this.fb.getDocs(this.fb.collection(this.db, "events"));
    return q.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
}

// ---------- Bootstrap: Firebase or Demo ----------
let store,
  env = "demo";

try {
  // 🔧 Firebase CONFIG — paste your own keys below when ready
  const firebaseConfig = {
    apiKey: "", // <= REQUIRED
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
  };
  const configured = Object.values(firebaseConfig).every(
    (v) => String(v || "").trim() !== ""
  );

  // Load Firebase SDKs
  const fb = await import(
    "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js"
  );
  const auth = await import(
    "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js"
  );
  const storeMod = await import(
    "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js"
  );
  const firebase = {
    ...fb,
    ...auth,
    ...storeMod,
    getAuth: auth.getAuth,
    onAuthStateChanged: auth.onAuthStateChanged,
    signOut: auth.signOut,
    createUserWithEmailAndPassword: auth.createUserWithEmailAndPassword,
    signInWithEmailAndPassword: auth.signInWithEmailAndPassword,
    getFirestore: storeMod.getFirestore,
    collection: storeMod.collection,
    doc: storeMod.doc,
    addDoc: storeMod.addDoc,
    setDoc: storeMod.setDoc,
    getDoc: storeMod.getDoc,
    getDocs: storeMod.getDocs,
    deleteDoc: storeMod.deleteDoc,
    query: storeMod.query,
    where: storeMod.where,
  };

  let app;
  if (configured) {
    app = fb.initializeApp(firebaseConfig);
    env = "firebase";
    store = new FirebaseStore(firebase);
    log("Firebase initialized ✓");
    toast("Firebase connected");
  } else {
    env = "demo";
    store = new DemoStore();
    log("Running in Demo Mode (localStorage). Add Firebase config to go live.");
    toast("Demo Mode (no Firebase keys)");
  }
} catch (e) {
  env = "demo";
  store = new DemoStore();
  log(
    "Firebase SDK load failed; falling back to Demo Mode. " + e.message,
    "error"
  );
  toast("Demo Mode active");
}

$("#envBadge").textContent =
  env === "firebase" ? "Firebase Connected" : "Demo Mode";
$("#envBadge").className =
  "badge " + (env === "firebase" ? "ok" : "warn") + " pill";

// ---------- UI Wiring ----------
function show(viewId) {
  $$(".view").forEach((v) => v.classList.remove("active"));
  $(viewId).classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function fillSelect(el, items) {
  el.innerHTML = items
    .map((v) => `<option value="${v}">${v}</option>`)
    .join("");
}

/*async function refreshTaxonomy() {
  const cats = await store.getCats();
  const cities = await store.getCities();
  // user selects
  fillSelect($("#evCategory"), cats);
  fillSelect(
    $("#evCity"),
    cities.map((c) => c.name)
  );
  const citySel = $("#evCity").value || cities[0]?.name || "";
  const areas = cities.find((c) => c.name === citySel)?.areas || [];
  fillSelect($("#evArea"), areas);

  // admin lists
  renderList("#catList", cats, (name) =>
    store.delCat(name).then(() => {
      log(`Category deleted: ${name}`);
      refreshTaxonomy();
    })
  );
  renderList(
    "#cityList",
    cities.map((c) => c.name),
    (name) =>
      store.delCity(name).then(() => {
        log(`City deleted: ${name}`);
        refreshTaxonomy();
      })
  );
  STATE.citySelected = STATE.citySelected || cities[0]?.name || null;
  renderAreas();
}*/
async function refreshTaxonomy() {
  const cats = await store.getCats();
  const cities = await store.getCities();

  // user selects
  fillSelect($("#evCategory"), cats);

  // ✅ remember previously selected city
  const prevCity = $("#evCity").value || STATE.citySelected || "";
  fillSelect(
    $("#evCity"),
    cities.map((c) => c.name)
  );

  // ✅ restore selection if still available
  if (cities.find((c) => c.name === prevCity)) {
    $("#evCity").value = prevCity;
    STATE.citySelected = prevCity;
  } else {
    STATE.citySelected = cities[0]?.name || null;
    $("#evCity").value = STATE.citySelected || "";
  }

  // ✅ now update areas for selected city
  const citySel = $("#evCity").value;
  const areas = cities.find((c) => c.name === citySel)?.areas || [];
  fillSelect($("#evArea"), areas);

  // admin lists
  renderList("#catList", cats, (name) =>
    store.delCat(name).then(() => {
      log(`Category deleted: ${name}`);
      refreshTaxonomy();
    })
  );
  renderList(
    "#cityList",
    cities.map((c) => c.name),
    (name) =>
      store.delCity(name).then(() => {
        log(`City deleted: ${name}`);
        refreshTaxonomy();
      })
  );
  renderAreas();
}

function renderList(selector, items, onDel) {
  const ul = $(selector);
  ul.innerHTML = "";
  items.forEach((name) => {
    const li = document.createElement("li");
    li.className = "pill";
    li.style.margin = "6px 0";
    li.style.display = "flex";
    li.style.justifyContent = "space-between";
    li.style.alignItems = "center";
    li.style.gap = "8px";
    li.innerHTML = `<span>${name}</span><button class="btn bad" style="padding:6px 10px">Delete</button>`;
    li.querySelector("button").onclick = () => onDel(name);
    ul.appendChild(li);
    li.onclick = () => {
      if (selector === "#cityList") {
        STATE.citySelected = name;
        renderAreas();
      }
    };
  });
}
async function renderAreas() {
  const cities = await store.getCities();
  const city = cities.find((c) => c.name === STATE.citySelected) || cities[0];
  $("#areaList").innerHTML = "";
  if (!city) {
    $("#areaList").innerHTML = "<small>No city selected</small>";
    return;
  }
  city.areas.forEach((a) => {
    const li = document.createElement("li");
    li.className = "pill";
    li.style.margin = "6px 0";
    li.style.display = "flex";
    li.style.justifyContent = "space-between";
    li.style.alignItems = "center";
    li.innerHTML = `<span>${city.name} ▸ ${a}</span><button class="btn bad" style="padding:6px 10px">Remove</button>`;
    li.querySelector("button").onclick = async () => {
      await store.delArea(city.name, a);
      log(`Area removed: ${city.name} ▸ ${a}`);
      renderAreas();
      refreshTaxonomy();
    };
    $("#areaList").appendChild(li);
  });
}

// Landing buttons
$$('[data-open="auth"]').forEach((b) => {
  b.onclick = () => {
    STATE.role = b.dataset.role;
    $("#authRole").value = STATE.role;
    $("#authTitle").textContent = `Welcome (${STATE.role})`;
    toast(`${STATE.role.toUpperCase()} selected`);
  };
});

// Tabs
$$(".tab").forEach((t) => {
  t.onclick = () => {
    $$(".tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    const mode = t.dataset.auth;
    $("#authSubmit").textContent =
      mode === "login" ? "Login" : "Create account";
    $("#authNote").textContent =
      mode === "login"
        ? "No account? Switch to Register tab."
        : "Already have an account? Switch to Login tab.";
    $("#authForm").dataset.mode = mode;
  };
});
$("#authForm").dataset.mode = "login";

$("#authReset").onclick = () => {
  $("#email").value = "";
  $("#password").value = "";
};

// Auth submit
$("#authForm").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("#email").value.trim();
  const pass = $("#password").value;
  const role = $("#authRole").value;

  try {
    const mode = e.currentTarget.dataset.mode;
    let user;
    if (mode === "register") {
      const roleFinal =
        role === "admin"
          ? "admin"
          : email.endsWith("@admin.com")
          ? "admin"
          : "user";
      user = await store.register(email, pass, roleFinal);
      await store.setSession(user);
      log(`Registered: ${email} as ${user.role}`);
      toast("Registered ✓");
    } else {
      user = await store.login(email, pass);
      await store.setSession(user);
      log(`Logged in: ${email} (${user.role})`);
      toast("Logged in ✓");
    }
    STATE.user = user;
    // Route
    if (user.role === "admin") {
      await enterAdmin();
    } else {
      await enterUser();
    }
  } catch (err) {
    log(`Auth error: ${err.message}`, "error");
    toast(err.message);
  }
};

// Logout
$("#logoutBtn").onclick = async () => {
  await store.clearSession();
  STATE.user = null;
  show("#landing");
  toast("Logged out");
};

// On load: existing session
(async () => {
  await refreshTaxonomy();
  const me = await store.me();
  if (me) {
    STATE.user = me;
    log(`Session found: ${me.email}`);
    me.role === "admin" ? enterAdmin() : enterUser();
  }
})();

// ---------- User Dashboard ----------
async function enterUser() {
  await refreshTaxonomy();
  renderMyEvents();
  show("#userDash");
}
$("#evCity").addEventListener("change", async () => {
  await refreshTaxonomy();
});

$("#eventForm").onsubmit = async (e) => {
  e.preventDefault();
  const id = $("#eventId").value || null;
  const ev = {
    uid: STATE.user.uid,
    author: STATE.user.email,
    name: $("#evName").value.trim(),
    cat: $("#evCategory").value,
    when: $("#evDate").value
      ? new Date($("#evDate").value).toISOString()
      : nowISO(),
    city: $("#evCity").value,
    area: $("#evArea").value,
    desc: $("#evDesc").value.trim(),
    createdAt: nowISO(),
  };
  if (!ev.name) {
    toast("Event name required");
    return;
  }
  if (id) {
    await store.setEvent(id, ev);
    log(`Event updated: ${ev.name}`);
    toast("Event updated");
  } else {
    const newId = await store.addEvent(ev);
    log(`Event created: ${ev.name} (#${newId})`);
    toast("Event created");
  }
  clearEventForm();
  renderMyEvents();
};

function clearEventForm() {
  $("#eventId").value = "";
  $("#evName").value = "";
  $("#evDesc").value = "";
  $("#evDate").value = "";
}
$("#clearEventBtn").onclick = clearEventForm;

async function renderMyEvents() {
  const list = await store.myEvents(STATE.user.uid);
  const tbody = $("#eventsTable tbody");
  tbody.innerHTML = "";
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><small>No events yet</small></td></tr>`;
    return;
  }
  for (const e of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${e.name}</td>
      <td>${e.cat}</td>
      <td>${formatDT(e.when)}</td>
      <td>${e.city} / ${e.area}</td>
      <td class="row">
        <button class="btn" style="padding:6px 10px" data-act="edit">Edit</button>
        <button class="btn bad" style="padding:6px 10px" data-act="del">Delete</button>
      </td>`;
    tr.querySelector('[data-act="edit"]').onclick = () => {
      $("#eventId").value = e.id;
      $("#evName").value = e.name;
      $("#evCategory").value = e.cat;
      $("#evDate").value = new Date(e.when).toISOString().slice(0, 16);
      $("#evCity").value = e.city;
      refreshTaxonomy().then(() => {
        $("#evArea").value = e.area;
      });
      $("#evDesc").value = e.desc || "";
      toast("Loaded into form");
    };
    tr.querySelector('[data-act="del"]').onclick = async () => {
      if (!confirm("Delete this event?")) return;
      await store.delEvent(e.id);
      log(`Event deleted: ${e.name}`);
      toast("Deleted");
      renderMyEvents();
      if (STATE.user.role === "admin") renderAllEvents();
    };
    tbody.appendChild(tr);
  }
}

// ---------- Admin Dashboard ----------
async function enterAdmin() {
  await refreshTaxonomy();
  renderAllEvents();
  show("#adminDash");
}

// taxonomy actions
$("#addCat").onclick = async () => {
  const v = $("#catInput").value.trim();
  if (!v) return;
  await store.addCat(v);
  log(`Category added: ${v}`);
  $("#catInput").value = "";
  refreshTaxonomy();
};
$("#addCity").onclick = async () => {
  const v = $("#cityInput").value.trim();
  if (!v) return;
  await store.addCity(v);
  STATE.citySelected = v;
  log(`City added: ${v}`);
  $("#cityInput").value = "";
  refreshTaxonomy();
};
$("#addArea").onclick = async () => {
  if (!STATE.citySelected) {
    toast("Select a city first (click one)");
    return;
  }
  const v = $("#areaInput").value.trim();
  if (!v) return;
  await store.addArea(STATE.citySelected, v);
  log(`Area added: ${STATE.citySelected} ▸ ${v}`);
  $("#areaInput").value = "";
  renderAreas();
  refreshTaxonomy();
};

async function renderAllEvents() {
  const list = await store.allEvents();
  const tbody = $("#allEventsTable tbody");
  tbody.innerHTML = "";
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><small>No events</small></td></tr>`;
    return;
  }
  for (const e of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${e.name}</td>
      <td>${e.cat}</td>
      <td>${formatDT(e.when)}</td>
      <td>${e.city} / ${e.area}</td>
      <td>${e.author || e.uid.slice(0, 6)}</td>
      <td class="row">
        <button class="btn bad" style="padding:6px 10px" data-act="del">Delete</button>
      </td>`;
    tr.querySelector('[data-act="del"]').onclick = async () => {
      if (!confirm("Admin: delete this event?")) return;
      await store.delEvent(e.id);
      log(`Admin removed event: ${e.name}`);
      toast("Event removed");
      renderAllEvents();
    };
    tbody.appendChild(tr);
  }
}

// ---------- Logs toolbar ----------
$("#copyLogs").onclick = () => {
  const text = $("#logbox").textContent;
  navigator.clipboard.writeText(text);
  toast("Logs copied");
};
$("#clearLogs").onclick = () => {
  $("#logbox").textContent = "";
  toast("Logs cleared");
};

// ---------- Keyboard UX ----------
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    document.activeElement.tagName !== "INPUT" &&
    document.activeElement.tagName !== "TEXTAREA"
  ) {
    e.preventDefault();
    $("#email").focus();
    toast("Focus email");
  }
});
