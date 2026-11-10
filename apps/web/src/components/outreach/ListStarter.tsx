import { ChevronRight } from 'lucide-react';
import { GROUPS, type Preset } from './presets';
import { countyOf, useCounty } from './county';
import { CountySwitch } from './CountySwitch';

/**
 * Outreach with no lists yet: the ready-made lists as cards to tap, for the company's working county (named in
 * the title, a tap to change, the same county the + sheet uses). A card opens the + sheet (the one place lists
 * are made) straight to that list's count and a first look; nothing is saved until Save.
 */
export function ListStarter({ organizationId, onPick }: { organizationId: string; onPick: (preset: Preset) => void }) {
  const [county, setCounty] = useCounty(organizationId);
  const here = countyOf(county);
  return (
    <section className="space-y-8 max-w-5xl" data-testid="outreach-empty">
      <h2 className="text-xl md:text-2xl font-semibold text-white">
        Who do you want to reach in <CountySwitch county={county} onChange={setCounty} size="title" />?
      </h2>
      {GROUPS.map((g) => {
        return (
          <div key={g.heading} className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400">{g.heading}</h3>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.presets.map((p) => {
                // Built from a city's own records, in a county where they aren't connected yet.
                const notHere = Boolean(p.needsRecords) && !here.records;
                return (
                  <li key={p.label}>
                    <button
                      type="button"
                      onClick={() => onPick(p)}
                      disabled={notHere}
                      className="group w-full h-full min-h-[84px] flex items-center gap-3 p-4 text-left bg-[#121212] border border-[#333333] hover:border-[#336699] hover:bg-[#336699]/10 disabled:opacity-50 disabled:hover:border-[#333333] disabled:hover:bg-[#121212]"
                      data-testid="starter-list"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-medium text-white">{p.label}</span>
                        <span className="mt-0.5 block text-sm text-gray-400">{notHere ? `Not in ${here.label.replace(/, TX.*$/, '')} yet: it needs the city's own records` : p.blurb}</span>
                      </span>
                      {!notHere && <ChevronRight className="w-4 h-4 shrink-0 text-gray-600 group-hover:text-[#7fb0e0]" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
