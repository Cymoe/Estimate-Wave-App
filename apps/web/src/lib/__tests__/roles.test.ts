import { homeFor, isStaff, isSuperAdmin, landingFor } from '../roles';

describe('who lands where', () => {
  it('sends staff and the owner to Ops, and everyone else to their company', () => {
    expect(homeFor({ role: 'super_admin' })).toBe('/ops');
    expect(homeFor({ role: 'staff' })).toBe('/ops');
    expect(homeFor({ role: 'user', isStaff: true })).toBe('/ops');
    expect(homeFor({ role: 'user' })).toBe('/leads');
    expect(homeFor({ role: 'admin' })).toBe('/leads');
    expect(homeFor(null)).toBe('/leads');
  });

  it('goes back to where they were headed, but never off the site', () => {
    expect(landingFor({ role: 'user' }, '/ops?tab=companies&company=o2')).toBe('/ops?tab=companies&company=o2');
    expect(landingFor({ role: 'user' }, '/leads?lead=l1&ack=1')).toBe('/leads?lead=l1&ack=1');
    expect(landingFor({ role: 'super_admin' }, null)).toBe('/ops');
    expect(landingFor({ role: 'user' }, '')).toBe('/leads');
    expect(landingFor({ role: 'user' }, 'https://evil.example/')).toBe('/leads');
    expect(landingFor({ role: 'user' }, '//evil.example/')).toBe('/leads');
    expect(landingFor({ role: 'user' }, '/\\evil.example')).toBe('/leads');
  });

  it('counts the owner as staff, but not the other way round', () => {
    expect(isStaff({ role: 'super_admin' })).toBe(true);
    expect(isSuperAdmin({ role: 'staff' })).toBe(false);
  });
});
