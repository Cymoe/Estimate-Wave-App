import { formatDate, localToday, parseDay } from '../format';

describe('stored days', () => {
  it('a day like "2026-10-09" is that day where the user is (midnight local, not midnight UTC)', () => {
    const day = parseDay('2026-10-09');
    expect([day.getFullYear(), day.getMonth(), day.getDate(), day.getHours()]).toEqual([2026, 9, 9, 0]);
    expect(formatDate('2026-10-09')).toBe('Oct 9, 2026');
  });

  it('full timestamps are read as before', () => {
    const at = '2026-10-09T18:30:00Z';
    expect(parseDay(at).getTime()).toBe(Date.parse(at));
  });

  it("today is the user's own day, late in the evening too", () => {
    const evening = new Date(2026, 10, 3, 19, 30); // 7:30 pm Nov 3, local
    expect(localToday(evening)).toBe('2026-11-03');
    // So an estimate good "until Nov 3" can still be signed that evening.
    expect('2026-11-03' < localToday(evening)).toBe(false);
    expect('2026-11-02' < localToday(evening)).toBe(true);
  });
});
