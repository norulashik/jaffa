"use client";

import Link from "next/link";
import MaterialIcon from "./MaterialIcon";

interface HeaderProps {
  rightContent?: React.ReactNode;
}

export default function Header({ rightContent }: HeaderProps) {
  return (
    <header className="fixed top-0 w-full flex justify-between items-center px-6 py-4 max-w-none bg-slate-900/40 backdrop-blur-xl z-50 shadow-[0_8px_32px_0_rgba(0,255,171,0.1)]">
      <Link href="/lobby" className="flex items-center gap-3">
        <MaterialIcon icon="sports_cricket" className="text-[#00FFAB]" />
        <span className="font-[family-name:var(--font-headline)] font-black italic text-[#00FFAB] tracking-widest text-2xl uppercase">
          JAFFA
        </span>
      </Link>
      {rightContent && <div className="flex items-center gap-4">{rightContent}</div>}
    </header>
  );
}
