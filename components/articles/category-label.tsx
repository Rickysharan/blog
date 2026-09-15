import Link from "next/link";

import { getCategory, type CategorySlug } from "@/lib/config/categories";

export function CategoryLabel({ category }: { category: CategorySlug }) {
  const definition = getCategory(category);

  return (
    <Link
      data-accent={definition.accent}
      href={`/category/${category}`}
      className="retro-category-label inline-flex text-[0.65rem] font-black uppercase tracking-[0.16em] text-ink transition-transform hover:-translate-y-0.5"
    >
      {definition.label}
    </Link>
  );
}
