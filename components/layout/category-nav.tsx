import Link from "next/link";

import { CATEGORIES } from "@/lib/config/categories";

export function CategoryNav({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="News desks" className={className}>
      <ul className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {CATEGORIES.map((category) => (
          <li key={category.slug}>
            <Link
              href={`/category/${category.slug}`}
              className="text-xs font-black uppercase tracking-[0.12em] underline-offset-4 hover:underline"
            >
              {category.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
