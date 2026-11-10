import { useState } from 'react';
import { Building2, ChevronRight, Home, Sparkles, Users } from 'lucide-react';
import { GROUPS, type Preset } from './presets';

const ICONS: Record<string, typeof Home> = { 'Commercial and investors': Building2, Homeowners: Home, 'People who bring work': Users };

/**
 * Outreach with no lists yet: the ready-made lists as cards to tap, and a box
 * to say it in your own words. Either opens the list's count and a first
 * look; nothing is saved until Save.
 */
export function ListStarter({ onPick, onAsk }: { onPick: (preset: Preset) => void; onAsk: (words: string) => void }) {
  const [words, setWords] = useState('');
  const ask = () => words.trim() && onAsk(words.trim());
  return (
    <section className="space-y-8 max-w-5xl" data-testid="outreach-empty">
      <div className="space-y-4">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold text-white">Who do you want to reach?</h2>
          <p className="mt-1 text-sm md:text-base text-gray-400">Pick a list to see how many owners it finds and a first look. Nothing is saved until you say so.</p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
        >
          <label className="relative flex-1 min-w-0">
            <span className="sr-only">Describe the list you want</span>
            <Sparkles className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" aria-hidden />
            <input
              value={words}
              onChange={(e) => setWords(e.target.value)}
              placeholder="Or describe it: roofing contractors with 3+ permits"
              className="w-full h-12 pl-9 pr-3 bg-[#121212] border border-[#333333] text-base text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]"
            />
          </label>
          <button type="submit" disabled={!words.trim()} className="shrink-0 h-12 px-5 text-sm font-medium text-white bg-[#336699] hover:bg-[#2a5580] disabled:opacity-40">
            Find
          </button>
        </form>
      </div>
      {GROUPS.map((g) => {
        const Icon = ICONS[g.heading] ?? Users;
        return (
          <div key={g.heading} className="space-y-3">
            <h3 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-gray-400">
              <Icon className="w-4 h-4" aria-hidden /> {g.heading}
            </h3>
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
