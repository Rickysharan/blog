import Link from "next/link";

import { CATEGORIES } from "@/lib/config/categories";

export function CategoryNav({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="News desks" className={className}>
      <ul className="grid grid-cols-6 items-stretch gap-0">
        {CATEGORIES.map((category, index) => (
          <li className="retro-nav-item" data-accent={category.accent} key={category.slug}>
            <Link
              aria-label={category.label}
              href={`/category/${category.slug}`}
              className="retro-nav-link text-xs font-black uppercase tracking-[0.12em]"
            >
              <span aria-hidden="true" className="retro-nav-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{category.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
