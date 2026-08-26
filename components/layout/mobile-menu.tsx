"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CATEGORIES } from "@/lib/config/categories";

export function MobileMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-news-menu"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center border border-line"
      >
        {open ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      </button>
      {open ? (
        <nav
          id="mobile-news-menu"
          aria-label="Mobile navigation"
          className="absolute inset-x-0 top-full z-40 border-y border-line bg-paper px-5 py-6 shadow-xl"
        >
          <ul className="grid gap-1">
            {CATEGORIES.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/category/${category.slug}`}
                  onClick={() => setOpen(false)}
                  className="block min-h-11 py-2 font-serif text-2xl font-semibold"
                >
                  {category.label}
                </Link>
              </li>
            ))}
            <li className="mt-3 border-t border-line pt-3">
              <Link
                href="/search"
                onClick={() => setOpen(false)}
                className="block min-h-11 py-2 font-semibold"
              >
                Search
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
