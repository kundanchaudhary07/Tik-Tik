import dotenv from "dotenv";
dotenv.config({ override: true });

async function run() {
  const BASE_URL = "http://localhost:3000";
  console.log("=== CENTRAL POSTGRESQL ARCHITECTURE COMPREHENSIVE TEST SUITE ===");

  const timestamp = Date.now();
  const userAEmail = `user_a_${timestamp}@central.db`;
  const userBEmail = `user_b_${timestamp}@central.db`;
  const testPassword = "Password123!Secure";

  // Helper fetch
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

  // 1. Health check
  console.log("\n--- STEP 1: Verify PostgreSQL & Redis Readiness ---");
  const readyRes = await api("/health/ready");
  console.log("Health ready:", readyRes.status, readyRes.data);
  if (readyRes.data?.database !== "connected") {
    throw new Error("Database not connected!");
  }

  // 2. Register User A
  console.log("\n--- STEP 2: Register User A ---");
  const regARes = await api("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: userAEmail, password: testPassword, name: "User A" }),
  });
  console.log("User A registered:", regARes.status, regARes.data?.user?.id, regARes.data?.user?.email);
  if (!regARes.ok) throw new Error("Failed to register User A: " + JSON.stringify(regARes.data));
  const userAToken = regARes.data.token;
  const userAId = regARes.data.user.id;

  // 3. Register User B
  console.log("\n--- STEP 3: Register User B ---");
  const regBRes = await api("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email: userBEmail, password: testPassword, name: "User B" }),
  });
  console.log("User B registered:", regBRes.status, regBRes.data?.user?.id);
  if (!regBRes.ok) throw new Error("Failed to register User B: " + JSON.stringify(regBRes.data));
  const userBToken = regBRes.data.token;
  const userBId = regBRes.data.user.id;

  // 4. Create User A: Activity, Subtask, Reminder, Followup, Habit, Notification
  console.log("\n--- STEP 4: Create User A Records in PostgreSQL ---");
  // 4a. Activity
  const actRes = await api("/api/activities", {
    method: "POST",
    headers: { Authorization: `Bearer ${userAToken}` },
    body: JSON.stringify({
      title: "User A PostgreSQL Core Activity",
      description: "Must permanently exist in central PostgreSQL",
      importance: 5,
      deadline: new Date(Date.now() + 86400000).toISOString(),
      activity_type: "Task",
    }),
  });
  console.log("Activity created:", actRes.status, actRes.data?.id, actRes.data?.title);
  if (!actRes.ok) throw new Error("Failed to create activity: " + JSON.stringify(actRes.data));
  const actId = actRes.data.id;

  // 4b. Subtask
  const subRes = await api(`/api/activities/${actId}/subtasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userAToken}` },
    body: JSON.stringify({ title: "Subtask 1 for PostgreSQL Core Activity" }),
  });
  console.log("Subtask created:", subRes.status, subRes.data?.id, subRes.data?.title);
  if (!subRes.ok) throw new Error("Failed to create subtask: " + JSON.stringify(subRes.data));
  const subtaskId = subRes.data.id;

  // 4c. Reminder
  const remRes = await api(`/api/activities/${actId}/reminders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userAToken}` },
    body: JSON.stringify({
      remind_at: new Date(Date.now() + 3600000).toISOString(),
      message: "Reminder for Core Activity in PostgreSQL",
    }),
  });
  console.log("Reminder created:", remRes.status, remRes.data?.id, remRes.data?.message);
  if (!remRes.ok) throw new Error("Failed to create reminder: " + JSON.stringify(remRes.data));
  const reminderId = remRes.data.id;

  // 4d. Follow-up
  const folRes = await api(`/api/activities/${actId}/followups`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userAToken}` },
    body: JSON.stringify({
      note: "Followup for Core Activity in PostgreSQL",
      scheduled_at: new Date(Date.now() + 7200000).toISOString(),
    }),
  });
  console.log("Followup created:", folRes.status, folRes.data?.id, folRes.data?.note);
  if (!folRes.ok) throw new Error("Failed to create followup: " + JSON.stringify(folRes.data));
  const followupId = folRes.data.id;

  // 4e. Recurring Habit
  const habitActRes = await api("/api/activities", {
    method: "POST",
    headers: { Authorization: `Bearer ${userAToken}` },
    body: JSON.stringify({
      title: "Daily PostgreSQL Habit",
      description: "Habit rule stored in central habit_rules table",
      importance: 4,
      activity_type: "Habit",
      recurrence: {
        frequency: "DAILY",
        days_of_week: [0, 1, 2, 3, 4, 5, 6],
      },
    }),
  });
  console.log("Habit created:", habitActRes.status, habitActRes.data?.id, "Recurrence ID:", habitActRes.data?.recurrence_id);
  if (!habitActRes.ok) throw new Error("Failed to create habit: " + JSON.stringify(habitActRes.data));
  const habitActId = habitActRes.data.id;
  const habitRuleId = habitActRes.data.recurrence_id;

  // 4f. In-app Notification (Automatically generated on registration in PostgreSQL)
  const notifRes = await api("/api/notifications", {
    headers: { Authorization: `Bearer ${userAToken}` },
  });
  console.log("Notifications count for User A:", notifRes.data?.length, "First:", notifRes.data?.[0]?.title);
  if (!notifRes.ok || !notifRes.data?.length) throw new Error("No notification found for User A!");
  const notifId = notifRes.data[0].id;

  // 5. User B Creates Own Record
  console.log("\n--- STEP 5: Create User B Own Records ---");
  const actBRes = await api("/api/activities", {
    method: "POST",
    headers: { Authorization: `Bearer ${userBToken}` },
    body: JSON.stringify({
      title: "User B Private Activity",
      importance: 3,
      activity_type: "Task",
    }),
  });
  console.log("User B Activity created:", actBRes.status, actBRes.data?.id);
  if (!actBRes.ok) throw new Error("Failed to create User B activity");
  const actBId = actBRes.data.id;

  // 6. Test Multi-Tenant Isolation
  console.log("\n--- STEP 6: Verify Strict User Isolation ---");
  const userAActs = await api("/api/activities", {
    headers: { Authorization: `Bearer ${userAToken}` },
  });
  const userBActs = await api("/api/activities", {
    headers: { Authorization: `Bearer ${userBToken}` },
  });
  console.log(`User A sees ${userAActs.data.length} activities (IDs: ${userAActs.data.map((a: any) => a.id).join(", ")})`);
  console.log(`User B sees ${userBActs.data.length} activities (IDs: ${userBActs.data.map((a: any) => a.id).join(", ")})`);
  if (userAActs.data.some((a: any) => a.id === actBId)) {
    throw new Error("SECURITY VIOLATION: User A sees User B's activity!");
  }
  if (userBActs.data.some((a: any) => a.id === actId)) {
    throw new Error("SECURITY VIOLATION: User B sees User A's activity!");
  }
  console.log("Multi-tenant user isolation: PASSED!");

  // 7. Test IDOR Protection
  console.log("\n--- STEP 7: Test IDOR Protection on All Resources ---");
  // User B tries to view User A's activity
  const idorAct = await api(`/api/activities/${actId}`, {
    headers: { Authorization: `Bearer ${userBToken}` },
  });
  console.log(`User B accessing User A activity HTTP Status: ${idorAct.status} (expected 404)`);
  if (idorAct.ok) throw new Error("IDOR VIOLATION: User B accessed User A activity!");

  // User B tries to modify User A's activity
  const idorModAct = await api(`/api/activities/${actId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${userBToken}` },
    body: JSON.stringify({ title: "HACKED ACTIVITY" }),
  });
  console.log(`User B modifying User A activity HTTP Status: ${idorModAct.status} (expected 404)`);
  if (idorModAct.ok) throw new Error("IDOR VIOLATION: User B modified User A activity!");

  // User B tries to delete User A's activity
  const idorDelAct = await api(`/api/activities/${actId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${userBToken}` },
  });
  console.log(`User B deleting User A activity HTTP Status: ${idorDelAct.status} (expected 404)`);
  if (idorDelAct.ok) throw new Error("IDOR VIOLATION: User B deleted User A activity!");

  // User B tries to modify User A's subtask
  const idorSub = await api(`/api/subtasks/${subtaskId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${userBToken}` },
    body: JSON.stringify({ title: "HACKED SUBTASK" }),
  });
  console.log(`User B modifying User A subtask HTTP Status: ${idorSub.status} (expected 404)`);
  if (idorSub.ok) throw new Error("IDOR VIOLATION: User B modified User A subtask!");

  // User B tries to delete User A's reminder
  const idorRem = await api(`/api/reminders/${reminderId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${userBToken}` },
  });
  console.log(`User B deleting User A reminder HTTP Status: ${idorRem.status} (expected 404)`);
  if (idorRem.ok) throw new Error("IDOR VIOLATION: User B deleted User A reminder!");

  // User B tries to delete User A's follow-up
  const idorFol = await api(`/api/followups/${followupId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${userBToken}` },
  });
  console.log(`User B deleting User A followup HTTP Status: ${idorFol.status} (expected 404)`);
  if (idorFol.ok) throw new Error("IDOR VIOLATION: User B deleted User A followup!");

  // User B tries to read User A's notification
  const idorNotif = await api(`/api/notifications/${notifId}/read`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${userBToken}` },
  });
  console.log(`User B reading User A notification HTTP Status: ${idorNotif.status} (expected 404)`);
  if (idorNotif.ok) throw new Error("IDOR VIOLATION: User B read User A notification!");

  console.log("All IDOR tests PASSED with proper denial!");

  // 8. Admin Supervision & Secrets Check
  console.log("\n--- STEP 8: Admin Global Supervision & Secret Redaction ---");
  const adminLogin = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "adminkd05@gmail.com", password: process.env.INITIAL_ADMIN_PASSWORD || "89697998" }),
  });
  console.log("Admin login status:", adminLogin.status, "role:", adminLogin.data?.user?.role);
  if (!adminLogin.ok || adminLogin.data?.user?.role !== "ADMIN") {
    throw new Error("Admin login failed!");
  }
  const adminToken = adminLogin.data.token;

  // Non-admin trying to access admin endpoint
  const nonAdminForbidden = await api("/api/admin/users", {
    headers: { Authorization: `Bearer ${userAToken}` },
  });
  console.log(`Non-admin calling /api/admin/users HTTP Status: ${nonAdminForbidden.status} (expected 403)`);
  if (nonAdminForbidden.status !== 403) {
    throw new Error("RBAC FAILURE: Non-admin accessed /api/admin/users!");
  }

  // Admin supervision tests
  const adminUsers = await api("/api/admin/users", { headers: { Authorization: `Bearer ${adminToken}` } });
  console.log(`Admin sees ${adminUsers.data.length} total users in PostgreSQL`);
  // Verify secrets are NOT exposed
  for (const u of adminUsers.data) {
    if (u.password || u.password_hash || u.passwordHash || u.reset_token || u.verification_token) {
      throw new Error(`CRITICAL SECURITY LEAK: Secrets exposed for user ${u.email}!`);
    }
  }
  console.log("Admin user secrets check: PASSED (Zero passwords/hashes/tokens exposed)!");

  const adminActivities = await api("/api/admin/activities", { headers: { Authorization: `Bearer ${adminToken}` } });
  console.log(`Admin sees ${adminActivities.data.length} total activities with ownership emails`);
  const foundActA = adminActivities.data.find((a: any) => a.id === actId);
  console.log(`Admin Act A owner: ${foundActA?.owner_email} (expected: ${userAEmail})`);
  if (foundActA?.owner_email !== userAEmail) throw new Error("Admin activity ownership mismatch!");

  const adminSubtasks = await api("/api/admin/subtasks", { headers: { Authorization: `Bearer ${adminToken}` } });
  console.log(`Admin sees ${adminSubtasks.data.length} total subtasks with owner emails`);

  const adminReminders = await api("/api/admin/reminders", { headers: { Authorization: `Bearer ${adminToken}` } });
  console.log(`Admin sees ${adminReminders.data.length} total reminders`);

  const adminFollowups = await api("/api/admin/follow-ups", { headers: { Authorization: `Bearer ${adminToken}` } });
  console.log(`Admin sees ${adminFollowups.data.length} total followups`);

  const adminHabits = await api("/api/admin/habits", { headers: { Authorization: `Bearer ${adminToken}` } });
  console.log(`Admin sees ${adminHabits.data.length} total habit rules`);

  const adminNotifs = await api("/api/admin/notifications", { headers: { Authorization: `Bearer ${adminToken}` } });
  console.log(`Admin sees ${adminNotifs.data.length} total notifications`);

  const adminHealth = await api("/api/admin/system/health", { headers: { Authorization: `Bearer ${adminToken}` } });
  console.log(`Admin system health: DB engine: ${adminHealth.data?.database?.engine}, users: ${adminHealth.data?.database?.total_users}`);

  const adminLogs = await api("/api/admin/audit-logs", { headers: { Authorization: `Bearer ${adminToken}` } });
  console.log(`Admin audit logs count: ${adminLogs.data?.length}`);

  // 9. Logout & Login Test
  console.log("\n--- STEP 9: Logout and Login Test ---");
  const logoutRes = await api("/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${userAToken}` },
  });
  console.log("User A logout status:", logoutRes.status);

  // Old token should now be rejected (revoked in PostgreSQL)
  const revokedAccess = await api("/api/activities", {
    headers: { Authorization: `Bearer ${userAToken}` },
  });
  console.log("Accessing with revoked token HTTP Status:", revokedAccess.status, "(expected 401)");
  if (revokedAccess.status !== 401) throw new Error("Revoked token was not rejected!");

  // Login again
  const reLogin = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: userAEmail, password: testPassword }),
  });
  console.log("User A re-login status:", reLogin.status);
  if (!reLogin.ok) throw new Error("Re-login failed!");
  const newAToken = reLogin.data.token;

  // Verify all records exist after re-login
  const reActs = await api("/api/activities", { headers: { Authorization: `Bearer ${newAToken}` } });
  console.log("Activities after re-login:", reActs.data.length, "IDs:", reActs.data.map((a: any) => a.id));
  if (!reActs.data.some((a: any) => a.id === actId)) {
    throw new Error("DATA LOSS: Activity disappeared after logout/login!");
  }

  const reSubs = await api(`/api/activities/${actId}/subtasks`, { headers: { Authorization: `Bearer ${newAToken}` } });
  console.log("Subtasks after re-login:", reSubs.data.length);
  if (!reSubs.data.some((s: any) => s.id === subtaskId)) {
    throw new Error("DATA LOSS: Subtask disappeared after logout/login!");
  }

  const reRem = await api("/api/reminders", { headers: { Authorization: `Bearer ${newAToken}` } });
  console.log("Reminders after re-login:", reRem.data.length);
  if (!reRem.data.some((r: any) => r.id === reminderId)) {
    throw new Error("DATA LOSS: Reminder disappeared after logout/login!");
  }

  const reFol = await api("/api/followups", { headers: { Authorization: `Bearer ${newAToken}` } });
  console.log("Followups after re-login:", reFol.data.length);
  if (!reFol.data.some((f: any) => f.id === followupId)) {
    throw new Error("DATA LOSS: Followup disappeared after logout/login!");
  }

  const reHabits = await api("/api/habits", { headers: { Authorization: `Bearer ${newAToken}` } });
  console.log("Habits after re-login:", reHabits.data.length);

  const reNotifs = await api("/api/notifications", { headers: { Authorization: `Bearer ${newAToken}` } });
  console.log("Notifications after re-login:", reNotifs.data.length);
  if (!reNotifs.data.some((n: any) => n.id === notifId)) {
    throw new Error("DATA LOSS: Notification disappeared after logout/login!");
  }

  console.log("\n=== ALL PHASES PASSED WITH ZERO DATA LOSS! ===");
  console.log("PERSISTENCE STATE:", {
    userAEmail,
    userBEmail,
    actId,
    actBId,
    subtaskId,
    reminderId,
    followupId,
    habitRuleId,
    notifId,
  });
}

run().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
