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
        className="inline-flex min-h-11 min-w-11 items-center justify-center border border-brandInk/30 transition-colors hover:border-signal hover:text-signal"
      >
        {open ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      </button>
      {open ? (
        <nav
          id="mobile-news-menu"
          aria-label="Mobile navigation"
          className="absolute inset-x-0 top-full z-40 border-y border-brandInk/20 bg-brand px-5 py-6 text-brandInk shadow-2xl"
        >
          <ul className="grid gap-1">
            {CATEGORIES.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/category/${category.slug}`}
                  onClick={() => setOpen(false)}
                  className="block min-h-11 border-b border-brandInk/15 py-3 font-serif text-2xl font-semibold hover:text-signal"
                >
                  {category.label}
                </Link>
              </li>
            ))}
            <li className="mt-3 border-t border-brandInk/20 pt-3">
              <Link
                href="/search"
                onClick={() => setOpen(false)}
                className="block min-h-11 py-2 font-semibold hover:text-signal"
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
