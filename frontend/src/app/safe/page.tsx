"use client";

export default function SafeRoutePage() {
  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-black uppercase tracking-wider mb-4">
          Safe Route
        </h1>
        <p className="text-white/70 mb-6 leading-6">
          This route intentionally avoids app-level fetches, motion-heavy UI,
          and provider-dependent behavior. Use it as the first browser-stability
          smoke test.
        </p>
        <div className="border border-[#2a2a2a] rounded-[4px] bg-[#1a1a1a] p-6">
          <p className="text-sm text-white/80 mb-4">
            If this page stays stable for several minutes, the freeze is likely
            caused by a higher-level startup layer rather than core Next.js
            rendering.
          </p>
          <button
            type="button"
            className="px-4 py-2 bg-[#ff6341] text-black font-black uppercase rounded-[3px]"
            onClick={() => window.alert("Safe route interaction is working.")}
          >
            Test Interaction
          </button>
        </div>
      </div>
    </main>
  );
}
