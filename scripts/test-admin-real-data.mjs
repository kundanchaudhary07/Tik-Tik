// scripts/test-admin-real-data.mjs
const BASE_URL = process.env.API_URL || "http://localhost:3000";

async function post(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function get(path, token) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  return { status: res.status, data: await res.json() };
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✓ ${message}`);
}

async function main() {
  console.log("==================================================");
  console.log("Testing Real Admin Data, User Isolation & Add Activity");
  console.log("==================================================");

  // 1. Admin login
  const adminLogin = await post("/auth/login", {
    email: "admin@productivity.io",
    password: "AdminSecurePassword2026!",
  });
  assert(adminLogin.status === 200 && adminLogin.data.token, "Admin logs in successfully");
  const adminToken = adminLogin.data.token;

  // 2. Fetch baseline admin stats
  const baselineStatsRes = await get("/api/admin/stats", adminToken);
  assert(baselineStatsRes.status === 200, "Admin stats endpoint responds with HTTP 200");
  const baseUsers = baselineStatsRes.data.total_users;
  const baseActivities = baselineStatsRes.data.total_activities;
  const baseReminders = baselineStatsRes.data.scheduled_reminders;
  const baseFollowups = baselineStatsRes.data.pending_followups;
  console.log(`Baseline PostgreSQL stats: Users=${baseUsers}, Activities=${baseActivities}, Reminders=${baseReminders}, Followups=${baseFollowups}`);

  // 3. Register User A
  const time = Date.now();
  const userAEmail = `user_a_${time}@example.com`;
  const regA = await post("/auth/register", {
    email: userAEmail,
    password: "UserAPassword2026!",
    name: "User Alpha",
  });
  assert(regA.status === 201 && regA.data.token, "User A registered successfully");
  const userAToken = regA.data.token;
  const userAId = regA.data.user.id;

  // 4. User A creates activity with subtask, reminder, and follow-up
  const deadline = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const actARes = await post("/api/activities", {
    title: "Submit assignment",
    description: "Final semester submission",
    importance: 4,
    deadline,
    activity_type: "Task",
    estimated_time: "45 minutes",
  }, userAToken);
  assert(actARes.status === 201 && actARes.data.id, "User A creates activity 'Submit assignment'");
  const actAId = actARes.data.id;
  assert(actARes.data.estimated_time === "45 minutes", "Estimated time persisted in database");

  // Add subtask
  const subtaskRes = await post(`/api/activities/${actAId}/subtasks`, {
    title: "Draft project report",
    order: 1,
  }, userAToken);
  assert(subtaskRes.status === 201, "User A adds subtask 'Draft project report'");

  // Add reminder
  const reminderTime = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
  const reminderRes = await post(`/api/activities/${actAId}/reminders`, {
    remind_at: reminderTime,
    message: "Assignment due reminder",
  }, userAToken);
  assert(reminderRes.status === 201, "User A adds reminder 'Assignment due reminder'");

  // Add follow-up
  const followupTime = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
  const followupRes = await post(`/api/activities/${actAId}/followups`, {
    scheduled_at: followupTime,
    note: "Review grade feedback",
  }, userAToken);
  assert(followupRes.status === 201, "User A adds follow-up 'Review grade feedback'");

  // 5. Register User B
  const userBEmail = `user_b_${time}@example.com`;
  const regB = await post("/auth/register", {
    email: userBEmail,
    password: "UserBPassword2026!",
    name: "User Beta",
  });
  assert(regB.status === 201 && regB.data.token, "User B registered successfully");
  const userBToken = regB.data.token;
  const userBId = regB.data.user.id;

  // 6. User B creates activity
  const actBRes = await post("/api/activities", {
    title: "Study Java",
    description: "Multithreading chapter",
    importance: 3,
    activity_type: "Task",
  }, userBToken);
  assert(actBRes.status === 201 && actBRes.data.id, "User B creates activity 'Study Java'");

  // 7. Verify strict user isolation
  const userAList = await get("/api/activities", userAToken);
  assert(userAList.status === 200, "User A can list own activities");
  const userATitles = userAList.data.map(a => a.title);
  assert(userATitles.includes("Submit assignment"), "User A sees own activity 'Submit assignment'");
  assert(!userATitles.includes("Study Java"), "User A CANNOT see User B's activity 'Study Java' (Strict Isolation)");

  const userBList = await get("/api/activities", userBToken);
  assert(userBList.status === 200, "User B can list own activities");
  const userBTitles = userBList.data.map(a => a.title);
  assert(userBTitles.includes("Study Java"), "User B sees own activity 'Study Java'");
  assert(!userBTitles.includes("Submit assignment"), "User B CANNOT see User A's activity 'Submit assignment' (Strict Isolation)");

  // 8. Normal users cannot access Admin routes (RBAC check)
  const forbiddenUsers = await get("/api/admin/users", userAToken);
  assert(forbiddenUsers.status === 403, "Normal User A is strictly forbidden (403) from /api/admin/users");
  const forbiddenActivities = await get("/api/admin/activities", userAToken);
  assert(forbiddenActivities.status === 403, "Normal User A is strictly forbidden (403) from /api/admin/activities");

  // 9. Admin sees updated real database counts
  const newStatsRes = await get("/api/admin/stats", adminToken);
  assert(newStatsRes.data.total_users === baseUsers + 2, `Admin total_users updated from ${baseUsers} to ${baseUsers + 2}`);
  assert(newStatsRes.data.total_activities === baseActivities + 2, `Admin total_activities updated from ${baseActivities} to ${baseActivities + 2}`);
  assert(newStatsRes.data.scheduled_reminders === baseReminders + 1, `Admin scheduled_reminders updated from ${baseReminders} to ${baseReminders + 1}`);
  assert(newStatsRes.data.pending_followups === baseFollowups + 1, `Admin pending_followups updated from ${baseFollowups} to ${baseFollowups + 1}`);

  // 10. Admin sees all users in users list
  const adminUsersRes = await get("/api/admin/users", adminToken);
  assert(adminUsersRes.status === 200, "Admin fetches user list");
  const adminUserEmails = adminUsersRes.data.map(u => u.email);
  assert(adminUserEmails.includes(userAEmail), "Admin sees User A in user list");
  assert(adminUserEmails.includes(userBEmail), "Admin sees User B in user list");
  // Check no sensitive password fields leaked
  assert(!adminUsersRes.data.some(u => u.password || u.password_hash || u.secret || u.reset_token), "No sensitive passwords, hashes or tokens leaked in users list");

  // 11. Admin opens User A details
  const userADetailsRes = await get(`/api/admin/users/${userAId}/details`, adminToken);
  assert(userADetailsRes.status === 200, "Admin fetches User A real details");
  assert(userADetailsRes.data.activities.some(a => a.title === "Submit assignment"), "Admin sees User A's real activity 'Submit assignment'");
  assert(userADetailsRes.data.subtasks.some(s => s.title === "Draft project report"), "Admin sees User A's real subtask 'Draft project report'");
  assert(userADetailsRes.data.reminders.some(r => r.message === "Assignment due reminder"), "Admin sees User A's real reminder 'Assignment due reminder'");
  assert(userADetailsRes.data.followups.some(f => f.note === "Review grade feedback"), "Admin sees User A's real follow-up 'Review grade feedback'");

  // 12. Admin opens User B details (empty state verification)
  const userBDetailsRes = await get(`/api/admin/users/${userBId}/details`, adminToken);
  assert(userBDetailsRes.status === 200, "Admin fetches User B real details");
  assert(userBDetailsRes.data.activities.some(a => a.title === "Study Java"), "Admin sees User B's real activity 'Study Java'");
  assert(userBDetailsRes.data.reminders.length === 0, "User B has 0 reminders (clean empty state)");
  assert(userBDetailsRes.data.followups.length === 0, "User B has 0 follow-ups (clean empty state)");

  // 13. Admin Global Activities View
  const adminActsRes = await get("/api/admin/activities", adminToken);
  assert(adminActsRes.status === 200, "Admin fetches global activities");
  const adminActTitles = adminActsRes.data.map(a => a.title);
  assert(adminActTitles.includes("Submit assignment"), "Admin sees User A's activity in global list");
  assert(adminActTitles.includes("Study Java"), "Admin sees User B's activity in global list");
  const actA = adminActsRes.data.find(a => a.title === "Submit assignment");
  assert(actA.owner_email === userAEmail, "Admin global activity correctly identifies User A as owner");
  const actB = adminActsRes.data.find(a => a.title === "Study Java");
  assert(actB.owner_email === userBEmail, "Admin global activity correctly identifies User B as owner");

  // 14. Admin Global Reminders and Follow-ups View
  const adminRemsRes = await get("/api/admin/reminders", adminToken);
  assert(adminRemsRes.data.some(r => r.message === "Assignment due reminder" && r.user_email === userAEmail), "Admin sees User A's reminder with owner email");

  const adminFollowsRes = await get("/api/admin/follow-ups", adminToken);
  assert(adminFollowsRes.data.some(f => f.note === "Review grade feedback" && f.user_email === userAEmail), "Admin sees User A's follow-up with owner email");

  console.log("\n==================================================");
  console.log("ALL REAL ADMIN DATA, ISOLATION & ACTIVITY TESTS PASSED!");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
