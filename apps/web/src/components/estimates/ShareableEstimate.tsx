import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, Mail, Phone, MapPin, FileText, ChevronDown } from 'lucide-react';
import { publicEstimatesAPI } from '../../lib/api';
import { formatCurrency } from '../../utils/format';
import { categoryTotals, type ContractData } from '../../services/contract';
import { AgreementTerms } from '../contracts/AgreementTerms';

/** What the client sees, from the estimate's link (no login). */
interface ClientEstimate {
  estimate_number: string;
  title?: string;
  description?: string;
  status: string;
  issue_date: string;
  expiry_date?: string;
  subtotal: number;
  tax_rate?: number;
  tax_amount?: number;
  total_amount: number;
  notes?: string;
  terms?: string;
  client_signature?: string;
  signed_at?: string;
  client?: { name: string };
  business?: { name?: string; email?: string; phone?: string; address?: string };
  design?: { url: string; name: string; contentType?: string };
  agreement?: {
    propertyAddress?: string;
    workDescription?: string;
    startDate?: string;
    completionDate?: string;
    paymentTerms: string;
    warrantyPeriod: string;
  };
  locked_at?: string;
  items: Array<{ id: string; description: string; quantity: number; unit_price: number; total_price: number; category?: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromView(view: any): ClientEstimate {
  return {
    estimate_number: view.estimateNumber,
    title: view.title,
    description: view.description,
    status: view.status,
    issue_date: view.issueDate,
    expiry_date: view.expiryDate,
    subtotal: view.subtotal,
    tax_rate: view.taxRate,
    tax_amount: view.taxAmount,
    total_amount: view.totalAmount,
    notes: view.notes,
    terms: view.terms,
    client_signature: view.clientSignature,
    signed_at: view.signedAt,
    client: view.client,
    business: view.business,
    design: view.design,
    agreement: view.agreement,
    locked_at: view.lockedAt,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (view.items ?? []).map((item: any, i: number) => ({
      id: String(i),
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: item.totalPrice,
      category: item.category,
    })),
  };
}

/** The agreement the client signs, in the shape the contract wording reads. */
function agreementFor(estimate: ClientEstimate): ContractData {
  const terms = estimate.agreement;
  return {
    propertyAddress: terms?.propertyAddress ?? '',
    clientName: estimate.client?.name ?? '',
    clientAddress: '',
    contractorName: estimate.business?.name ?? '',
    contractorAddress: estimate.business?.address ?? '',
    contractorEmail: estimate.business?.email ?? '',
    contractorPhone: estimate.business?.phone ?? '',
    workDescription: terms?.workDescription ?? estimate.description ?? '',
    totalAmount: estimate.total_amount,
    lineItems: estimate.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: 'ea',
      unitPrice: item.unit_price,
      total: item.total_price,
      category: item.category,
    })),
    startDate: terms?.startDate ?? '',
    completionDate: terms?.completionDate ?? '',
    paymentTerms: terms?.paymentTerms ?? '',
    warrantyPeriod: terms?.warrantyPeriod ?? '',
    lockedAt: estimate.locked_at,
    agreedDesign: estimate.design && { url: estimate.design.url, name: estimate.design.name, type: estimate.design.contentType },
  };
}

const OPEN_STATUSES = ['draft', 'sent', 'opened'];

export const ShareableEstimate: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [estimate, setEstimate] = useState<ClientEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signature, setSignature] = useState<string>('');
  const [consent, setConsent] = useState(false);
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const signatureSectionRef = useRef<HTMLDivElement>(null);
  const signingBarRef = useRef<HTMLDivElement>(null);
  const [signingBarHeight, setSigningBarHeight] = useState(144);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);

  // Native reload restoration can run after the router's reset, while the
  // estimate is still loading. Own restoration for this public document.
  useLayoutEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      const root = document.getElementById('root');
      if (root) root.scrollTop = 0;
    };
    resetScroll();
    window.addEventListener('pageshow', resetScroll);
    return () => {
      window.removeEventListener('pageshow', resetScroll);
      window.history.scrollRestoration = previousRestoration;
    };
  }, [token]);

  useLayoutEffect(() => {
    if (loading) return;
    // Reset after the document replaces its loading placeholder, before paint.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const root = document.getElementById('root');
    if (root) root.scrollTop = 0;
  }, [loading, token]);

  useLayoutEffect(() => {
    const bar = signingBarRef.current;
    if (!bar) return;
    const measure = () => setSigningBarHeight(Math.ceil(bar.getBoundingClientRect().height));
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(bar);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [loading, estimate?.status]);

  const loadEstimate = async () => {
    if (!token) return;
    try {
      const view = await publicEstimatesAPI.get(token);
      setEstimate(view ? fromView(view) : null);
    } catch (error) {
      console.error('Error loading estimate:', error);
      setEstimate(null);
    } finally {
      setLoading(false);
    }
  };

  // The client's page is light; without this the app's dark page shows past it (and on iPad overscroll).
  useEffect(() => {
    document.body.classList.add('marketing-page');
    return () => document.body.classList.remove('marketing-page');
  }, []);

  useEffect(() => {
    if (!token) return;
    loadEstimate();
    // Lets the contractor see the estimate was opened.
    publicEstimatesAPI.markOpened(token).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!drawingEnabled) return;
    e.preventDefault();
    setIsDrawing(true);
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    setLastPoint({ x, y });
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !lastPoint) return;
    e.preventDefault();
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    
    setLastPoint({ x, y });
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setLastPoint(null);
    
    // Convert canvas to data URL for signature
    const canvas = canvasRef.current;
    if (canvas) {
      setSignature(canvas.toDataURL());
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setSignature('');
    }
  };

  const handleAccept = async () => {
    if (!token || !signature || !consent || signing) return;
    setSigning(true);
    setActionError(null);
    try {
      await publicEstimatesAPI.accept(token, signature);
      await loadEstimate();
    } catch (error) {
      console.error('Error accepting estimate:', error);
      setActionError(error instanceof Error ? error.message : "The estimate couldn't be accepted. Please try again.");
    } finally {
      setSigning(false);
    }
  };

  const handleReject = async () => {
    if (!token) return;
    if (!confirm('Decline this estimate?')) return;
    setActionError(null);
    try {
      await publicEstimatesAPI.decline(token);
      await loadEstimate();
    } catch (error) {
      console.error('Error declining estimate:', error);
      setActionError(error instanceof Error ? error.message : "The estimate couldn't be declined. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex-shrink-0 bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="min-h-screen flex-shrink-0 bg-white flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Estimate not found</h3>
          <p className="text-gray-600">The estimate you're looking for doesn't exist or has been removed.</p>
        </div>
      </div>
    );
  }

  const isExpired = estimate.expiry_date && new Date(estimate.expiry_date) < new Date();
  const canSign = OPEN_STATUSES.includes(estimate.status) && !isExpired;
  const statusLabel =
    estimate.status === 'rejected' ? 'Declined' : OPEN_STATUSES.includes(estimate.status) ? 'Awaiting your approval' : estimate.status.charAt(0).toUpperCase() + estimate.status.slice(1);

  return (
    <div className="min-h-screen flex-shrink-0 bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4" style={canSign ? { paddingBottom: `calc(${signingBarHeight}px + 2rem)` } : undefined}>
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {estimate.title || 'Estimate & Agreement'}
              </h1>
              <p className="text-lg text-gray-600">Estimate &amp; Agreement · {estimate.estimate_number}</p>
            </div>
            
            <div className="text-right">
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                estimate.status === 'accepted' 
                  ? 'bg-green-100 text-green-800'
                  : estimate.status === 'rejected'
                  ? 'bg-red-100 text-red-800'
                  : estimate.status === 'expired'
                  ? 'bg-orange-100 text-orange-800'
                  : 'bg-blue-100 text-blue-800'
              }`}>
                {statusLabel}
              </div>
              {isExpired && (
                <p className="text-sm text-red-600 mt-1">Expired</p>
              )}
            </div>
          </div>

          {/* From (the business) and For (the client) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <div className="space-y-2">
                <div className="text-gray-900 font-medium">{estimate.business?.name || 'Your contractor'}</div>
                {estimate.business?.email && (
                  <a href={`mailto:${estimate.business.email}`} className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span>{estimate.business.email}</span>
                  </a>
                )}
                {estimate.business?.phone && (
                  <a href={`tel:${estimate.business.phone}`} className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span>{estimate.business.phone}</span>
                  </a>
                )}
                {estimate.business?.address && (
                  <div className="flex items-start gap-2 text-gray-600">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <span>{estimate.business.address}</span>
                  </div>
                )}
                {estimate.client && (
                  <p className="pt-2 text-gray-600">
                    Prepared for <span className="text-gray-900 font-medium">{estimate.client.name}</span>
                  </p>
                )}
              </div>
            </div>

            <div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Issue Date:</span>
                  <span className="text-gray-900">{new Date(estimate.issue_date).toLocaleDateString()}</span>
                </div>
                {estimate.expiry_date && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Valid Until:</span>
                    <span className="text-gray-900">{new Date(estimate.expiry_date).toLocaleDateString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Amount:</span>
                  <span className="text-xl font-bold text-gray-900">{formatCurrency(estimate.total_amount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        {estimate.description && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Project Description</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{estimate.description}</p>
          </div>
        )}

        {/* Summary by category: what the client reads first */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6" data-testid="category-summary">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Summary</h3>
          <table className="w-full text-gray-900">
            <tbody>
              {categoryTotals(estimate.items.map((item) => ({ category: item.category, total: item.total_price }))).map(
                ({ category, total }) => (
                  <tr key={category} className="border-b border-gray-200">
                    <td className="py-3 pr-4">{category}</td>
                    <td className="py-3 text-right whitespace-nowrap">{formatCurrency(total)}</td>
                  </tr>
                ),
              )}
            </tbody>
            <tfoot>
              {(estimate.tax_rate ?? 0) > 0 && (
                <>
                  <tr>
                    <td className="pt-3 text-gray-600">Subtotal</td>
                    <td className="pt-3 text-right text-gray-600">{formatCurrency(estimate.subtotal)}</td>
                  </tr>
                  <tr>
                    <td className="pt-1 text-gray-600">Tax ({estimate.tax_rate}%)</td>
                    <td className="pt-1 text-right text-gray-600">{formatCurrency(estimate.tax_amount || 0)}</td>
                  </tr>
                </>
              )}
              <tr>
                <td className="pt-3 text-lg font-bold">Total</td>
                <td className="pt-3 text-right text-xl font-bold text-blue-600">{formatCurrency(estimate.total_amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Line items: the detail behind the summary, opened on request */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6">
          <button
            type="button"
            onClick={() => setShowDetails((open) => !open)}
            aria-expanded={showDetails}
            className="w-full px-6 py-4 flex items-center justify-between text-left"
          >
            <h3 className="text-lg font-semibold text-gray-900">Line item details ({estimate.items.length})</h3>
            <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
          </button>

          {showDetails && <div className="overflow-x-auto border-t border-gray-200">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Qty
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit Price
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {estimate.items?.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{item.description}</div>
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-gray-900">
                      {item.quantity}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-900">
                      {formatCurrency(item.unit_price)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                      {formatCurrency(item.total_price)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={3} className="px-6 py-3 text-right text-sm font-medium text-gray-900">
                    Subtotal:
                  </td>
                  <td className="px-6 py-3 text-right text-sm font-medium text-gray-900">
                    {formatCurrency(estimate.subtotal)}
                  </td>
                </tr>
                {(estimate.tax_rate ?? 0) > 0 && (
                  <tr>
                    <td colSpan={3} className="px-6 py-3 text-right text-sm font-medium text-gray-900">
                      Tax ({estimate.tax_rate}%):
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-medium text-gray-900">
                      {formatCurrency(estimate.tax_amount || 0)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-right text-lg font-bold text-gray-900">
                    Total:
                  </td>
                  <td className="px-6 py-4 text-right text-xl font-bold text-blue-600">
                    {formatCurrency(estimate.total_amount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>}
        </div>

        {/* The agreement, signed together with the estimate (it includes the agreed design) */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6 text-gray-900" data-testid="agreement">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Agreement</h3>
          <AgreementTerms contract={agreementFor(estimate)} />
        </div>

        {/* Terms and Notes */}
        {(estimate.notes || estimate.terms) && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            {estimate.notes && (
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Notes</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{estimate.notes}</p>
              </div>
            )}
            
            {estimate.terms && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Terms & Conditions</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{estimate.terms}</p>
              </div>
            )}
          </div>
        )}

        {/* Signature Section */}
        {estimate.status === 'accepted' && estimate.client_signature ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              <CheckCircle className="w-5 h-5 text-green-500 inline mr-2" />
              Accepted &amp; Signed
            </h3>
            <div className="border border-gray-300 rounded-lg p-4 bg-gray-50 mb-4">
              <img 
                src={estimate.client_signature} 
                alt="Client Signature" 
                className="max-h-32 mx-auto"
              />
            </div>
            <p className="text-sm text-gray-600">
              Signed on {new Date(estimate.signed_at!).toLocaleDateString()}
            </p>
          </div>
        ) : canSign ? (
          <div ref={signatureSectionRef} id="estimate-signature" className="scroll-mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 tabIndex={-1} className="text-lg font-semibold text-gray-900 mb-4">Accept &amp; Sign</h3>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your signature
              </label>
              <div className="border border-gray-300 rounded-lg">
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={150}
                  className={`w-full h-32 rounded-lg ${drawingEnabled ? 'cursor-crosshair touch-none' : 'touch-pan-y'}`}
                  style={{ border: '1px solid #e5e7eb' }}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
              </div>
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-gray-500">By signing, you accept this estimate and agree to the terms above.</p>
                <button
                  onClick={clearSignature}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="mb-4">
              <button
                type="button"
                aria-pressed={drawingEnabled}
                onClick={() => setDrawingEnabled(enabled => !enabled)}
                disabled={signing}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-50"
              >
                {drawingEnabled ? 'Done drawing' : 'Draw signature'}
              </button>
              <p className="mt-2 text-xs text-gray-600" aria-live="polite">
                {drawingEnabled ? 'Draw in the box above, then tap Done drawing to scroll.' : 'You can scroll over the signature box. Tap Draw signature when ready to sign.'}
              </p>
            </div>

            {actionError && <p className="text-sm text-red-600 mb-3">{actionError}</p>}
            <label className="flex items-start gap-3 text-sm text-gray-700">
              <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={signing} className="mt-1 h-4 w-4 shrink-0" />
              <span>I have reviewed this estimate and agree to the terms above.</span>
            </label>
            <button onClick={handleReject} disabled={signing} className="mt-4 text-sm text-red-600 hover:text-red-700 disabled:opacity-50">
              Decline
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
            <p className="text-gray-600">
              {estimate.status === 'rejected' 
                ? 'You declined this estimate. Contact the contractor if you have questions.'
                : isExpired
                ? 'This estimate has expired.'
                : 'This estimate is no longer available for acceptance.'
              }
            </p>
          </div>
        )}
      </div>
      {canSign && (
        <div ref={signingBarRef} className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white px-4 pt-3 shadow-lg print:hidden" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
            <p className="text-sm text-gray-700" aria-live="polite">
              {signature && consent ? 'Ready to accept' : 'Review the terms and add your signature'}
            </p>
            <button
              onClick={signature && consent ? handleAccept : () => {
                signatureSectionRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
                signatureSectionRef.current?.querySelector('h3')?.focus({ preventScroll: true });
              }}
              disabled={signing}
              aria-controls="estimate-signature"
              className="shrink-0 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <CheckCircle className="w-5 h-5" />
              {signing ? 'Processing...' : signature && consent ? 'Accept & sign' : 'Review & sign'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
