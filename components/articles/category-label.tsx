import clsx from "clsx";
import Link from "next/link";

import {
  getCategory,
  type CategoryAccent,
  type CategorySlug,
} from "@/lib/config/categories";

const accentClasses: Record<CategoryAccent, string> = {
  violet: "border-violet-500 text-violet-700 dark:text-violet-300",
  rose: "border-rose-500 text-rose-700 dark:text-rose-300",
  blue: "border-blue-500 text-blue-700 dark:text-blue-300",
  green: "border-green-500 text-green-700 dark:text-green-300",
  amber: "border-amber-500 text-amber-700 dark:text-amber-300",
  cyan: "border-cyan-500 text-cyan-700 dark:text-cyan-300",
};

export function CategoryLabel({ category }: { category: CategorySlug }) {
  const definition = getCategory(category);

  return (
    <Link
      href={`/category/${category}`}
      className={clsx(
        "inline-flex border-l-[3px] pl-2 text-xs font-bold uppercase tracking-[0.16em] transition-opacity hover:opacity-70",
        accentClasses[definition.accent],
      )}
    >
      {definition.label}
    </Link>
  );
}
