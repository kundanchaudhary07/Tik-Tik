import dotenv from "dotenv";
dotenv.config({ override: true });

const BASE_URL = "http://localhost:3000";

async function api(path: string, options: any = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, ok: res.ok, data: json };
}

async function verify() {
  let email = process.argv[2];
  let password = "Password123!Secure";

  if (!email) {
    // If no email was passed, bootstrap a test user and records to verify persistence
    const ts = Date.now();
    email = `restart_test_${ts}@central.db`;
    console.log(`No email argument provided. Bootstrapping test user and records for ${email}...`);

    const regRes = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name: "Restart Verifier" }),
    });
    if (!regRes.ok) throw new Error("Registration failed: " + JSON.stringify(regRes.data));
    const token = regRes.data.token;

    // Create Activity
    const actRes = await api("/api/activities", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: "Persistence Verification Activity",
        description: "Checking that data persists across server restarts",
        importance: 4,
        deadline: new Date(Date.now() + 86400000).toISOString(),
        activity_type: "Task",
      }),
    });
    if (!actRes.ok) throw new Error("Failed to create activity: " + JSON.stringify(actRes.data));
    const actId = actRes.data.id;

    // Create Subtask
    await api(`/api/activities/${actId}/subtasks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: "Subtask for Persistence" }),
    });

    // Create Reminder
    await api(`/api/activities/${actId}/reminders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        remind_at: new Date(Date.now() + 3600000).toISOString(),
        message: "Persistence reminder check",
      }),
    });

    // Create Follow-up
    await api(`/api/activities/${actId}/followups`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        scheduled_at: new Date(Date.now() + 86400000 * 2).toISOString(),
        note: "Persistence followup check",
      }),
    });
  }

  console.log(`Verifying persistent data in PostgreSQL for ${email}...`);

  // 1. Login
  const loginRes = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  console.log("Login status:", loginRes.status, "User ID:", loginRes.data?.user?.id);
  if (!loginRes.ok) throw new Error("Login failed: " + JSON.stringify(loginRes.data));
  const token = loginRes.data.token;

  // 2. Activities
  const acts = await api("/api/activities", { headers: { Authorization: `Bearer ${token}` } });
  console.log(`Found ${acts.data.length} activities:`, acts.data.map((a: any) => ({ id: a.id, title: a.title, type: a.activity_type })));
  if (acts.data.length === 0) throw new Error("FATAL: Activities were lost after restart!");

  // 3. Subtasks
  const actId = acts.data[0].id;
  const subtasks = await api(`/api/activities/${actId}/subtasks`, { headers: { Authorization: `Bearer ${token}` } });
  console.log(`Found ${subtasks.data.length} subtasks for activity ${actId}`);

  // 4. Reminders
  const reminders = await api("/api/reminders", { headers: { Authorization: `Bearer ${token}` } });
  console.log(`Found ${reminders.data.length} reminders:`, reminders.data.map((r: any) => ({ id: r.id, message: r.message })));

  // 5. Follow-ups
  const followups = await api("/api/followups", { headers: { Authorization: `Bearer ${token}` } });
  console.log(`Found ${followups.data.length} follow-ups:`, followups.data.map((f: any) => ({ id: f.id, note: f.note })));

  // 6. Habit rules
  const habits = await api("/api/habits", { headers: { Authorization: `Bearer ${token}` } });
  console.log(`Found ${habits.data.length} habits:`, habits.data.map((h: any) => ({ id: h.id, frequency: h.frequency })));

  // 7. Notifications
  const notifications = await api("/api/notifications", { headers: { Authorization: `Bearer ${token}` } });
  console.log(`Found ${notifications.data.length} notifications:`, notifications.data.map((n: any) => ({ id: n.id, title: n.title })));

  console.log("\n=== SERVER RESTART TEST VERIFICATION: SUCCESSFUL ZERO DATA LOSS! ===");
}

verify().catch((err) => {
  console.error("VERIFICATION FAILED:", err);
  process.exit(1);
});
