// Client-side interactions for the User & Membership UI.
const $ = (id) => document.getElementById(id);
const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));

async function postJSON(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: await res.json() };
}
const getJSON = async (url) => (await fetch(url)).json();

// ---------- auth tab switching ----------
const authViews = { signup: $("view-signup"), signin: $("view-signin") };
function showAuth(name) {
  Object.entries(authViews).forEach(([k, el]) => el.classList.toggle("hidden", k !== name));
  document.querySelectorAll("#tabs .tab").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.view === name)));
}
document.querySelectorAll("#tabs .tab").forEach((t) => t.addEventListener("click", () => showAuth(t.dataset.view)));

// ---------- role segments ----------
let signupRole = "member";
let signinRole = "member";
function wireSeg(segId, onChange) {
  document.querySelectorAll(`#${segId} button`).forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(`#${segId} button`).forEach((x) => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true");
      onChange(b.dataset.role);
    });
  });
}
wireSeg("signup-role", (role) => {
  signupRole = role;
  $("su-member").classList.toggle("hidden", role !== "member");
  $("su-buyer").classList.toggle("hidden", role !== "buyer");
});
wireSeg("signin-role", (role) => { signinRole = role; });

// ---------- social (UI only) ----------
document.querySelectorAll("[data-social]").forEach((b) => {
  b.addEventListener("click", () => {
    b.closest("section").querySelector(".hint").textContent =
      `${b.dataset.social} sign-in is a UI prototype — not connected to a real provider yet.`;
  });
});

// ---------- sign up ----------
$("su-submit").addEventListener("click", async () => {
  const out = $("su-result");
  out.innerHTML = "";
  const common = { email: $("su-email").value.trim(), phone: $("su-phone").value.trim(), password: $("su-password").value };
  let url, body;
  if (signupRole === "member") {
    url = "/members/register";
    body = { memberName: $("su-m-name").value.trim(), boatName: $("su-m-boat").value.trim(), ...common };
  } else {
    url = "/buyers/register";
    const line = $("su-b-line").value.trim();
    const district = $("su-b-district").value.trim();
    const city = $("su-b-city").value.trim();
    const postal = $("su-b-postal").value.trim();
    if (!line || !district || !city) {
      $("su-result").innerHTML = '<div class="alert err">Please fill in the full delivery address (street, district and city) so couriers can reach you.</div>';
      return;
    }
    const address = [line, district, city, postal].filter(Boolean).join(", ");
    body = { name: $("su-b-name").value.trim(), address, ...common };
  }
  try {
    const { ok, data } = await postJSON(url, body);
    if (!ok) { out.innerHTML = `<div class="alert err">${esc(data.error || "Could not create account")}</div>`; return; }
    const id = data.memberId || data.buyerId;
    out.innerHTML =
      `<div class="alert ok">Account created — ID <strong>${esc(id)}</strong></div>` +
      `<div class="receipt"><div class="rh"><span class="dot"></span> Event recorded in the outbox (publishes to Kafka when connected)</div>` +
      `<pre>${esc(JSON.stringify(data.published, null, 2))}</pre></div>`;
  } catch {
    out.innerHTML = '<div class="alert err">Service unreachable. Is the server running?</div>';
  }
});

// ---------- sign in ----------
$("si-submit").addEventListener("click", async () => {
  const out = $("si-result");
  out.innerHTML = "";
  try {
    const { ok, data } = await postJSON("/login", { email: $("si-email").value.trim(), password: $("si-password").value });
    if (!ok) { out.innerHTML = `<div class="alert err">${esc(data.error || "Sign in failed")}</div>`; return; }
    if (data.role !== signinRole) {
      out.innerHTML = `<div class="alert err">This account is registered as a ${esc(data.role)}, not a ${esc(signinRole)}.</div>`;
      return;
    }
    localStorage.setItem("session", JSON.stringify(data));
    enterDashboard(data);
  } catch {
    out.innerHTML = '<div class="alert err">Service unreachable. Is the server running?</div>';
  }
});

// ---------- dashboard ----------
function membersTable(rows) {
  if (!rows.length) return '<div class="empty">No members registered yet.</div>';
  return '<table class="table"><thead><tr><th>ID</th><th>Name</th><th>Boat</th><th>Email</th><th>Phone</th></tr></thead><tbody>' +
    rows.map((r) => `<tr><td class="mono">${esc(r.member_id)}</td><td>${esc(r.member_name)}</td><td>${esc(r.boat_name)}</td><td>${esc(r.email)}</td><td>${esc(r.phone) || "—"}</td></tr>`).join("") +
    "</tbody></table>";
}
function buyersTable(rows) {
  if (!rows.length) return '<div class="empty">No buyers registered yet.</div>';
  return '<table class="table"><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Phone</th><th>Delivery address</th></tr></thead><tbody>' +
    rows.map((r) => `<tr><td class="mono">${esc(r.buyer_id)}</td><td>${esc(r.name)}</td><td>${esc(r.email)}</td><td>${esc(r.phone) || "—"}</td><td>${esc(r.address) || "—"}</td></tr>`).join("") +
    "</tbody></table>";
}

async function enterDashboard(session) {
  $("auth-view").classList.add("hidden");
  $("dashboard-view").classList.remove("hidden");
  $("dash-name").textContent = `Hello, ${session.name}`;
  $("dash-role").textContent = session.role === "member" ? "Cooperative member" : "Buyer";
  $("st-id").textContent = session.id;
  $("st-type").textContent = session.role === "member" ? "Member" : "Buyer";

  // live stats
  try {
    const s = await getJSON("/api/stats");
    $("st-boats").textContent = s.members;
    $("st-buyers").textContent = s.buyers;
  } catch { /* leave dashes */ }

  const content = $("dash-content");

  if (session.role === "member") {
    content.innerHTML =
      '<div class="ph">' +
      '<button class="dtab" data-dtab="members" aria-selected="true">Members</button>' +
      '<button class="dtab" data-dtab="buyers" aria-selected="false">Buyers</button>' +
      '</div>' +
      '<div class="pbody"><div id="dt-members"><div class="empty">Loading…</div></div><div id="dt-buyers" class="hidden"><div class="empty">Loading…</div></div></div>';

    // tab switching
    content.querySelectorAll(".dtab").forEach((t) => {
      t.addEventListener("click", () => {
        content.querySelectorAll(".dtab").forEach((x) => x.setAttribute("aria-selected", String(x === t)));
        $("dt-members").classList.toggle("hidden", t.dataset.dtab !== "members");
        $("dt-buyers").classList.toggle("hidden", t.dataset.dtab !== "buyers");
      });
    });

    try { $("dt-members").innerHTML = membersTable(await getJSON("/api/members")); }
    catch { $("dt-members").innerHTML = '<div class="empty">Could not load members.</div>'; }
    try { $("dt-buyers").innerHTML = buyersTable(await getJSON("/api/buyers")); }
    catch { $("dt-buyers").innerHTML = '<div class="empty">Could not load buyers.</div>'; }
  } else {
    content.innerHTML =
      '<div class="pbody welcome">' +
      `<h3>You're all set, ${esc(session.name)}</h3>` +
      '<p class="sub">Your buyer account is active. You can now join the live auction from the Auction service and bid on the day\'s baskets.</p>' +
      `<div class="alert ok">Signed in as a buyer · ID ${esc(session.id)}</div>` +
      "</div>";
  }
}

$("signout").addEventListener("click", () => {
  localStorage.removeItem("session");
  $("dashboard-view").classList.add("hidden");
  $("auth-view").classList.remove("hidden");
  showAuth("signin");
});

// restore session
const saved = JSON.parse(localStorage.getItem("session") || "null");
if (saved) enterDashboard(saved);
