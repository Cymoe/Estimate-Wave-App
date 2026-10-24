import { homeFor, isStaff, isSuperAdmin } from '../roles';

describe('who lands where', () => {
  it('sends staff and the owner to Ops, and everyone else to their company', () => {
    expect(homeFor({ role: 'super_admin' })).toBe('/ops');
    expect(homeFor({ role: 'staff' })).toBe('/ops');
    expect(homeFor({ role: 'user', isStaff: true })).toBe('/ops');
    expect(homeFor({ role: 'user' })).toBe('/leads');
    expect(homeFor({ role: 'admin' })).toBe('/leads');
    expect(homeFor(null)).toBe('/leads');
  });

  it('counts the owner as staff, but not the other way round', () => {
    expect(isStaff({ role: 'super_admin' })).toBe(true);
    expect(isSuperAdmin({ role: 'staff' })).toBe(false);
  });
});
