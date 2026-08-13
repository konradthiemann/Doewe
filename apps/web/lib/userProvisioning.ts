import { prisma } from "./prisma";

const DEFAULT_ACCOUNT_NAME = "Main Account";
const DEFAULT_CATEGORIES = {
  income: ["Salary", "Bonus", "Other income"],
  outcome: ["Groceries", "Rent", "Utilities", "Transport", "Entertainment", "Health", "Misc"]
};

/**
 * Creates a new user together with the default financial account and category
 * set every account needs to be usable. Shared by the email/password register
 * route and the Google OAuth sign-in flow.
 *
 * @param password Pre-hashed password, or null for OAuth-only accounts.
 */
export async function createUserWithDefaults(input: {
  email: string;
  name: string | null;
  password: string | null;
}) {
  // Teil D: every new user gets their own single-member household (OWNER). All
  // financial data is scoped to that household, so the default account and
  // categories are created inside it.
  const household = await prisma.household.create({
    data: { name: input.name?.trim() || "Haushalt" }
  });

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      password: input.password,
      householdMember: {
        create: { householdId: household.id, role: "OWNER" }
      },
      accounts: {
        create: { name: DEFAULT_ACCOUNT_NAME, householdId: household.id }
      }
    },
    include: {
      accounts: { select: { id: true, name: true } }
    }
  });

  await prisma.category.createMany({
    data: [
      ...DEFAULT_CATEGORIES.income.map((c) => ({ name: c, isIncome: true, userId: user.id, householdId: household.id })),
      ...DEFAULT_CATEGORIES.outcome.map((c) => ({ name: c, isIncome: false, userId: user.id, householdId: household.id })),
      { name: "Savings", isIncome: false, userId: user.id, householdId: household.id }
    ],
    skipDuplicates: true
  });

  return user;
}

/**
 * Creates a fresh, single-member household (OWNER) for an EXISTING user, with the
 * default account and category set. Used when a member leaves a shared household
 * (Teil D) — they must always own a household, otherwise getSessionUser() would
 * lock them out. Re-points the user's unique HouseholdMember row to the new
 * household and returns its id.
 */
export async function provisionFreshHousehold(input: {
  userId: string;
  name: string | null;
}): Promise<string> {
  const household = await prisma.household.create({
    data: { name: input.name?.trim() || "Haushalt" }
  });

  await prisma.householdMember.update({
    where: { userId: input.userId },
    data: { householdId: household.id, role: "OWNER" }
  });

  await prisma.account.create({
    data: { name: DEFAULT_ACCOUNT_NAME, userId: input.userId, householdId: household.id }
  });

  await prisma.category.createMany({
    data: [
      ...DEFAULT_CATEGORIES.income.map((c) => ({ name: c, isIncome: true, userId: input.userId, householdId: household.id })),
      ...DEFAULT_CATEGORIES.outcome.map((c) => ({ name: c, isIncome: false, userId: input.userId, householdId: household.id })),
      { name: "Savings", isIncome: false, userId: input.userId, householdId: household.id }
    ],
    skipDuplicates: true
  });

  return household.id;
}
