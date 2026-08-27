import Link from "next/link";

import { getCategory, type CategorySlug } from "@/lib/config/categories";

export function CategoryLabel({ category }: { category: CategorySlug }) {
  const definition = getCategory(category);

  return (
    <Link
      href={`/category/${category}`}
      className="inline-flex border-l-[3px] border-signal pl-2 text-[0.65rem] font-black uppercase tracking-[0.18em] text-ink transition-opacity hover:opacity-65"
    >
      {definition.label}
    </Link>
  );
}
