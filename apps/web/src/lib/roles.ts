/** Who can do what on the platform side. Companies' own roles live on memberships. */
import { HOME_PATH } from '../config/features';
export type AppRole = 'user' | 'admin' | 'staff' | 'caller' | 'super_admin';

interface RoleUser {
  role?: AppRole | string;
  isStaff?: boolean;
}

/** The platform owner: money, prices, companies, staff. */
export const isSuperAdmin = (user: RoleUser | null | undefined) => user?.role === 'super_admin';

/** Runs the Lead Market day to day (intake, confirming, sending). The owner is staff too. */
export const isStaff = (user: RoleUser | null | undefined) =>
  Boolean(user && (user.isStaff || user.role === 'staff' || user.role === 'super_admin'));

/** Where someone lands after signing in: staff and the owner on Ops, everyone else on their company. */
export const homeFor = (user: RoleUser | null | undefined) => (isStaff(user) ? '/ops' : HOME_PATH);

/**
 * Where to land after signing in when the address asked for somewhere
 * (`/?next=/ops?tab=companies`): that place if it is a path on this site,
 * otherwise home. Anything that could leave the site is ignored.
 */
export const landingFor = (user: RoleUser | null | undefined, next: string | null | undefined) =>
  next && next.startsWith('/') && !next.startsWith('//') && !/[\s\\]/.test(next) ? next : homeFor(user);
