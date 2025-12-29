// scripts/seed_role_users.js
// Create demo users for coordinator, member, sponsor, participant roles

const { createUser } = require("../utils/user");

(async () => {
  try {
    // Coordinator users (linked to member table)
    await createUser({
      username: "coord_ganashree",
      password: "Coord@123",
      role: "coordinator",
      linkedId: 1, // MemberID 1 - Ganashree P M
      fullName: "Ganashree P M"
    });

    await createUser({
      username: "coord_dhruthi",
      password: "Coord@123",
      role: "coordinator",
      linkedId: 2, // MemberID 2 - Dhruthi D
      fullName: "Dhruthi D"
    });

    // Member user
    await createUser({
      username: "member_meera",
      password: "Member@123",
      role: "member",
      linkedId: 3, // MemberID 3 - Meera R
      fullName: "Meera R"
    });

    // Sponsor user (linkedId = SponsorID 1)
    await createUser({
      username: "sponsor_technova",
      password: "Sponsor@123",
      role: "sponsor",
      linkedId: 1,
      fullName: "TechNova Solutions"
    });

    // Participant user (linkedId = ParticipantID 1)
    await createUser({
      username: "participant_rohan",
      password: "Participant@123",
      role: "participant",
      linkedId: 1,
      fullName: "Rohan Kumar"
    });

    console.log("✅ Seeded demo users for all roles.");
    console.log("Logins:");
    console.log("  Admin       : admin / Admin@1234 (existing)");
    console.log("  Coordinator : coord_ganashree / Coord@123");
    console.log("  Coordinator : coord_dhruthi   / Coord@123");
    console.log("  Member      : member_meera    / Member@123");
    console.log("  Sponsor     : sponsor_technova / Sponsor@123");
    console.log("  Participant : participant_rohan / Participant@123");

    process.exit(0);
  } catch (e) {
    console.error("Seed users failed:", e);
    process.exit(1);
  }
})();


