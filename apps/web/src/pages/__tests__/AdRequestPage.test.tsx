import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AdRequestView, type RequestView } from '../AdRequestPage';

const ad = (over: Partial<RequestView['ads'][number]>): RequestView['ads'][number] => ({
  name: 'WL_abc123_916_20261122',
  angle: 'Story',
  ratio: '9x16',
  image: false,
  status: 'voiced',
  file: null,
  headline: 'Cabinets, painted not replaced',
  lines: ['These brown cabinets looked dated.', 'Get a free quote from GoodFit Pros.'],
  primaryText: 'We take every door off.',
  builtOn: { company: 'Rodgers Painting', daysRunning: 162 },
  ...over,
});
const view = (over: Partial<RequestView> = {}): RequestView => ({
  ask: 'cabinet painting in Odessa',
  idea: 'We paint kitchen cabinets instead of replacing them',
  town: 'Odessa',
  trade: 'Painting',
  stage: 'drawing',
  skipped: [],
  createdAt: new Date().toISOString(),
  ads: [
    ad({}),
    ad({ name: 'WL_abc123_45_20261122', ratio: '4x5' }),
    ad({ name: 'WL_qqq111_916_20261122', angle: 'Quick offer', status: 'rendered', file: 'https://cdn.example/q.mp4', builtOn: { company: 'Rodgers Painting' } }),
    ad({ name: 'WL_lll222_916_20261122', angle: 'Lesson', builtOn: { company: 'Squeegee Squad', daysRunning: 90 } }),
  ],
  ...over,
});

async function render(v: RequestView) {
  document.body.innerHTML = '';
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<AdRequestView view={v} />));
  return container;
}

describe('a "make an ad for…" page', () => {
  it('shows the ask, the steps so far, and one card per ad in story, lesson, quick-offer order, with videos as they come', async () => {
    const page = await render(view());
    expect(page.querySelector('h1')!.textContent).toBe('"cabinet painting in Odessa"');
    expect(page.textContent).toContain('Painting · Odessa · We paint kitchen cabinets instead of replacing them');
    const steps = Array.from(page.querySelectorAll('ol[aria-label="Progress"] li')).map((li) => li.textContent);
    expect(steps[3]).toContain('Drawing the videos(now)');
    expect(Array.from(page.querySelectorAll('article h2')).map((h) => h.textContent)).toEqual(['Story', 'Lesson', 'Quick offer']);
    // The story's two sizes are one card with a size switch; it isn't drawn yet, the quick offer is.
    const story = page.querySelectorAll('article')[0];
    expect(story.querySelectorAll('[role="group"][aria-label="Size"] button').length).toBe(2);
    expect(story.textContent).toContain('Being drawn…');
    expect(story.textContent).toContain("Built on Rodgers Painting's ad, running 162 days.");
    expect(page.querySelectorAll('article')[2].querySelector('video')!.getAttribute('src')).toBe('https://cdn.example/q.mp4');
    expect(page.textContent).toContain('Nothing runs until you approve it in Ops → Ads.');
  });

  it('says plainly when it could not be made', async () => {
    const page = await render(view({ stage: 'failed', error: 'No bathrooms competitor ads on file to build it on yet.', ads: [] }));
    expect(page.querySelector('[role="alert"]')!.textContent).toBe("This one couldn't be made. No bathrooms competitor ads on file to build it on yet.");
    expect(page.querySelector('ol[aria-label="Progress"]')).toBeNull();
  });
});
