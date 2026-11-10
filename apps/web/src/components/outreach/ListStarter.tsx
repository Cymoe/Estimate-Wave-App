import { ChevronRight } from 'lucide-react';
import { GROUPS, type Preset } from './presets';

/**
 * Outreach with no lists yet: the ready-made lists as cards to tap. A card
 * opens the + sheet (the one place lists are made) straight to that list's
 * count and a first look; nothing is saved until Save.
 */
export function ListStarter({ onPick }: { onPick: (preset: Preset) => void }) {
  return (
    <section className="space-y-8 max-w-5xl" data-testid="outreach-empty">
      <h2 className="text-xl md:text-2xl font-semibold text-white">Who do you want to reach?</h2>
      {GROUPS.map((g) => {
        return (
          <div key={g.heading} className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400">{g.heading}</h3>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.presets.map((p) => (
                <li key={p.label}>
                  <button
                    type="button"
                    onClick={() => onPick(p)}
                    className="group w-full h-full min-h-[84px] flex items-center gap-3 p-4 text-left bg-[#121212] border border-[#333333] hover:border-[#336699] hover:bg-[#336699]/10"
                    data-testid="starter-list"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-medium text-white">{p.label}</span>
                      <span className="mt-0.5 block text-sm text-gray-400">{p.blurb}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 shrink-0 text-gray-600 group-hover:text-[#7fb0e0]" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
