import { mailingLine, oneLineAddress } from '../format';

describe('addresses on one line', () => {
  it('writes a mailing address as an envelope has it: no comma between the state and the zip', () => {
    expect(mailingLine({ address: '600 ILLINOIS AVE', city: 'MIDLAND', state: 'TX', zip: '79701-4321' })).toBe('600 Illinois Ave, Midland, TX 79701');
    // Whatever is missing leaves no stray comma or space.
    expect(mailingLine({ address: 'PO BOX 9', city: 'DALLAS', state: 'TX' })).toBe('PO Box 9, Dallas, TX');
    expect(mailingLine({ address: '1 MAIN ST', zip: '75201' })).toBe('1 Main St, 75201');
    expect(mailingLine({ city: 'MIDLAND', state: 'TX', zip: '79701' })).toBe('Midland, TX 79701');
    expect(mailingLine({})).toBe('');
  });

  it("tidies the address a state filing gives for a decision maker, which has a comma before the zip", () => {
    expect(oneLineAddress('100 W WALL ST, MIDLAND, TX, 79701')).toBe('100 W Wall St, Midland, TX 79701');
    expect(oneLineAddress('1 MAIN ST STE 400, DALLAS, TX, 75201-1234')).toBe('1 Main St Ste 400, Dallas, TX 75201-1234');
    // Already right, or not that shape: left as it is.
    expect(oneLineAddress('100 W Wall St, Midland, TX 79701')).toBe('100 W Wall St, Midland, TX 79701');
    expect(oneLineAddress('PO BOX 9')).toBe('PO Box 9');
    expect(oneLineAddress(undefined)).toBeUndefined();
  });
});
