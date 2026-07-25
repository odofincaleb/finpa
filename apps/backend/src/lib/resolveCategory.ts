import { mergeExpenseCategories } from "./categories";

const SOFT_RULES: Array<{ message: RegExp; category: RegExp }> = [
  { message: /school|tuition|pta|uniform|textbook|school\s*fees/, category: /school|education|tuition|fee/i },
  { message: /fuel|gas|uber|bolt|transport|fare|taxi/, category: /transport/i },
  { message: /lunch|dinner|restaurant|coffee|\beat\b/, category: /dining/i },
  { message: /grocery|market|shoprite|foodstuff/, category: /grocer/i },
  { message: /light|power|electric|water|internet|\bdata\b|utility/, category: /utilit/i },
  { message: /movie|netflix|game|entertainment/, category: /entertain/i },
  { message: /shirt|shoe|cloth|shopping|amazon/, category: /shop/i },
  { message: /rent|landlord|housing/, category: /rent|hous|accommod/i },
  { message: /hospital|pharmacy|doctor|medical|drug/, category: /health|medical|pharma/i },
];

export function resolveCategory(
  message: string,
  suggested: string,
  categories: string[],
  type: "expense" | "income",
): string {
  if (type === "income") return "Income";

  const allowed = mergeExpenseCategories(categories);
  const lower = message.toLowerCase();

  const mentioned = [...allowed]
    .filter((c) => {
      const n = c.toLowerCase();
      return n !== "other" && n !== "income";
    })
    .sort((a, b) => b.length - a.length)
    .find((c) => {
      const name = c.toLowerCase();
      if (lower.includes(name)) return true;
      return name
        .split(/\s+/)
        .some((w) => w.length >= 4 && lower.includes(w));
    });
  if (mentioned) return mentioned;

  for (const rule of SOFT_RULES) {
    if (!rule.message.test(lower)) continue;
    const hit = allowed.find((c) => rule.category.test(c));
    if (hit) return hit;
  }

  const exact = allowed.find(
    (c) => c.toLowerCase() === String(suggested || "").toLowerCase(),
  );
  if (exact) return exact;

  return allowed.find((c) => c === "Other") || "Other";
}
