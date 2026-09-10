"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const accountLinks = [
  ["Dashboard", "/dashboard"],
  ["Submit a story", "/submit"],
  ["My articles", "/articles"],
  ["Topics", "/topics"],
  ["Wallet", "/wallet"],
  ["Settings", "/settings"]
] as const;

export function AccountNav({ activeHref }: { activeHref?: string }) {
  const pathname = usePathname();
  const active = activeHref ?? pathname;

  return (
    <nav className="account-nav" aria-label="Contributor account navigation">
      <div className="account-nav__label">Your desk</div>
      <ul>
        {accountLinks.map(([label, href]) => (
          <li key={href}>
            <Link href={href} aria-current={active === href ? "page" : undefined}>
              <span aria-hidden="true" className="account-nav__arrow">
                ↗
              </span>
              {label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="launch-card">
        <p className="launch-card__eyebrow">Points beta</p>
        <p>Earn points for approved work while we test the contributor program.</p>
        <small>$0 launch mode · no cash redemption</small>
      </div>
    </nav>
  );
}
