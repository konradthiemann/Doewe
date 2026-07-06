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
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      password: input.password,
      accounts: {
        create: { name: DEFAULT_ACCOUNT_NAME }
      }
    },
    include: {
      accounts: { select: { id: true, name: true } }
    }
  });

  await prisma.category.createMany({
    data: [
      ...DEFAULT_CATEGORIES.income.map((c) => ({ name: c, isIncome: true, userId: user.id })),
      ...DEFAULT_CATEGORIES.outcome.map((c) => ({ name: c, isIncome: false, userId: user.id })),
      { name: "Savings", isIncome: false, userId: user.id }
    ],
    skipDuplicates: true
  });

  return user;
}
