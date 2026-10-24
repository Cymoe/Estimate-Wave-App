import { leadRows, leadsCsv } from '../LeadExportService';
import type { Lead } from '../../components/leads/leadTypes';

const lead: Lead = {
  id: 'l1',
  name: 'Maria Lopez',
  phone: '432-555-0101',
  city: 'Midland',
  county: 'Midland',
  jobType: 'landscaping',
  source: 'Google',
  status: 'quoted',
  estimatedValue: 1200,
  followUpDate: '2026-10-22',
  appointmentAt: '2026-10-21T15:00:00.000Z',
  lastContactAt: '2026-10-19T18:30:00.000Z',
  contacts: 2,
  texts: 1,
  createdAt: '2026-10-18T12:00:00.000Z',
  notes: 'Back yard, "big" job, needs sod',
  estimate: { id: 'e1', estimateNumber: 'EST-7', status: 'sent', totalAmount: 1850 },
  marketplaceLeadId: 'm1',
  pricePaidCents: 25000,
};

describe('LeadExportService', () => {
  it('turns leads into spreadsheet rows with readable stages, trades and the estimate total when there is one', () => {
    const [row] = leadRows([lead], (slug) => (slug === 'landscaping' ? 'Landscaping' : slug ?? ''));
    expect(row).toMatchObject({
      Name: 'Maria Lopez',
      County: 'Midland',
      Service: 'Landscaping',
      Stage: 'Estimate Sent',
      Value: 1850,
      Estimate: 'EST-7',
      'Follow-up': '2026-10-22',
      Appointment: '2026-10-21 15:00',
      'Last contact': '2026-10-19 18:30',
      Calls: 2,
      Texts: 1,
      'Came in': '2026-10-18',
      Origin: 'From FieldQuote · $250.00',
    });
    const [bare] = leadRows([{ id: 'l2', name: 'Dan', status: 'new', estimate: null }], () => '');
    expect(bare).toMatchObject({ Stage: 'New', Value: '', Calls: 0, Texts: 0, Origin: '', Notes: '' });
  });

  it('writes CSV with a header row and quotes commas, quotes and line breaks', () => {
    const csv = leadsCsv(leadRows([lead], () => 'Landscaping'));
    const [header, body] = csv.split('\n');
    expect(header.startsWith('Name,Phone,Email,Address,City,County,Service,Source,Stage,Value,Estimate')).toBe(true);
    expect(body).toContain('"Back yard, ""big"" job, needs sod"');
    expect(leadsCsv([])).toBe('');
  });
});
