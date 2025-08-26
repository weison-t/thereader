"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FC } from "react";

type NavItem = {
  href: string;
  label: string;
  ariaLabel?: string;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    title: "Main",
    items: [
      { href: "/main/upload-data", label: "Upload Data", ariaLabel: "Go to Upload Data" },
      { href: "/main/sampling", label: "Data Snapshot", ariaLabel: "Go to Data Snapshot" },
      { href: "/main/sampling-selection", label: "Sampling Selection", ariaLabel: "Go to Sampling Selection" },
    ],
  },
  {
    title: "Reports",
    items: [
      { href: "/reports/dashboard", label: "Dashboard", ariaLabel: "Go to Dashboard" },
      { href: "/reports/response-result", label: "Response Result", ariaLabel: "Go to Response Result" },
      { href: "/reports/processed-results", label: "Processed Results", ariaLabel: "Go to Processed Results" },
    ],
  },
  {
    title: "Configuration",
    items: [
      { href: "/configuration/criteria-setting", label: "Criteria Setting", ariaLabel: "Go to Criteria Setting" },
      { href: "/configuration/api-configuration", label: "API Configuration", ariaLabel: "Go to API Configuration" },
      { href: "/configuration/ai-agent-config", label: "AI Agent Config", ariaLabel: "Go to AI Agent Config" },
    ],
  },
];

type SidebarProps = {
  className?: string;
};

export const Sidebar: FC<SidebarProps> = ({ className }) => {
  const pathname = usePathname();
  const handleRefreshClick = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <nav
      aria-label="Primary"
      className={`sticky top-0 h-screen w-64 shrink-0 border-r border-gray-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:border-gray-800 dark:bg-gray-950/80 ${className ?? ""}`}
    >
      <div className="flex h-14 items-center px-4">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gray-900 text-xs font-semibold text-white dark:bg-white dark:text-gray-900">TR</span>
        <span className="ml-2 text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">The Reader</span>
        <button
          type="button"
          onClick={handleRefreshClick}
          aria-label="Refresh data"
          title="Refresh"
          className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
      </div>
      <div className="px-2 py-2">
        {navSections.map((section) => (
          <div key={section.title} className="mb-3">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              {section.title}
            </div>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      aria-label={item.ariaLabel ?? item.label}
                      className={
                        `group flex items-center gap-3 rounded-md px-3 py-2 text-sm outline-none transition-colors ` +
                        (isActive
                          ? "border-l-2 border-indigo-500 bg-gray-100 pl-2 text-gray-900 dark:border-indigo-400 dark:bg-gray-800 dark:text-white"
                          : "text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-900/50 dark:hover:text-white")
                      }
                    >
                      <span aria-hidden className="text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008.6 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004 15.4a1.65 1.65 0 00-1.51-1H2a2 2 0 110-4h.09A1.65 1.65 0 004 8.6 1.65 1.65 0 003.67 6.78l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 008.6 4a1.65 1.65 0 001-1.51V2a2 2 0 114 0v.09A1.65 1.65 0 0015.4 4a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0020 8.6c.36.53.57 1.17.57 1.86s-.21 1.33-.57 1.86z"/></svg>
                      </span>
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-auto px-2 py-3">
        <div className="rounded-md border border-dashed border-gray-200 p-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
          Powered by AIVA, created by DSA
        </div>
      </div>
    </nav>
  );
};

export default Sidebar;

