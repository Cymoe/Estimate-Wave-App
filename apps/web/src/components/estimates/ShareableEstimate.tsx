import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { 
  CheckCircle, XCircle, Download, Calendar, 
  DollarSign, User, Mail, Phone, MapPin, FileText 
} from 'lucide-react';
import { EstimateService, Estimate } from '../../services/EstimateService';
import { formatCurrency } from '../../utils/format';

export const ShareableEstimate: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [consent, setConsent] = useState(false);
  const signatureSectionRef = useRef<HTMLDivElement>(null);
  const signatureHasInk = useRef(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signature, setSignature] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (id) {
      loadEstimate();
    }
  }, [id]);

  const loadEstimate = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const data = await EstimateService.getById(id);
      setEstimate(data);
    } catch (error) {
      console.error('Error loading estimate:', error);
    } finally {
      setLoading(false);
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(true);
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const x = (clientX - rect.left) * canvas.width / rect.width;
    const y = (clientY - rect.top) * canvas.height / rect.height;
    setLastPoint({ x, y });
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing || !lastPoint) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const x = (clientX - rect.left) * canvas.width / rect.width;
    const y = (clientY - rect.top) * canvas.height / rect.height;
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    signatureHasInk.current = true;
    
    setLastPoint({ x, y });
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    setLastPoint(null);
    
    // Convert canvas to data URL for signature
    const canvas = canvasRef.current;
    if (canvas && signatureHasInk.current) {
      setSignature(canvas.toDataURL());
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setSignature('');
      signatureHasInk.current = false;
    }
  };

  const handleAccept = async () => {
    if (!estimate?.id || !signature || !consent || signing) return;
    
    setSigning(true);
    try {
      await EstimateService.addSignature(estimate.id, signature);
      await loadEstimate();
      alert('Estimate accepted successfully!');
    } catch (error) {
      console.error('Error accepting estimate:', error);
      alert('Failed to accept estimate');
    } finally {
      setSigning(false);
    }
  };

  const handleReject = async () => {
    if (!estimate?.id) return;
    
    if (!confirm('Are you sure you want to reject this estimate?')) return;
    
    try {
      await EstimateService.updateStatus(estimate.id, 'rejected');
      await loadEstimate();
      alert('Estimate rejected');
    } catch (error) {
      console.error('Error rejecting estimate:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Estimate not found</h3>
          <p className="text-gray-600">The estimate you're looking for doesn't exist or has been removed.</p>
        </div>
      </div>
    );
  }

  const isExpired = estimate.expiry_date && new Date(estimate.expiry_date) < new Date();
  const canSign = estimate.status === 'sent' && !isExpired;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4" style={canSign ? { paddingBottom: 'calc(9rem + env(safe-area-inset-bottom, 0px))' } : undefined}>
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {estimate.title || 'Project Estimate'}
              </h1>
              <p className="text-lg text-gray-600">{estimate.estimate_number}</p>
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
                {estimate.status.charAt(0).toUpperCase() + estimate.status.slice(1)}
              </div>
              {isExpired && (
                <p className="text-sm text-red-600 mt-1">Expired</p>
              )}
            </div>
          </div>

          {/* Client and Company Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Bill To:</h3>
              {estimate.client ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-900">{estimate.client.name}</span>
                  </div>
                  {estimate.client.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">{estimate.client.email}</span>
                    </div>
                  )}
                  {estimate.client.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">{estimate.client.phone}</span>
                    </div>
                  )}
                  {estimate.client.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                      <span className="text-gray-600">{estimate.client.address}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500">No client information</p>
              )}
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Estimate Details:</h3>
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

        {/* Category Summary */}
        {estimate.items && estimate.items.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Cost Breakdown by Category</h3>
            </div>
            
            <div className="p-6">
              {(() => {
                // Group items by cost code
                const categoryTotals = estimate.items.reduce((acc, item) => {
                  const category = item.cost_code_name || 'Uncategorized';
                  if (!acc[category]) {
                    acc[category] = 0;
                  }
                  acc[category] += item.total_price;
                  return acc;
                }, {} as Record<string, number>);

                // Sort categories by total amount (highest first)
                const sortedCategories = Object.entries(categoryTotals)
                  .sort(([, a], [, b]) => b - a);

                return (
                  <div className="space-y-3">
                    {sortedCategories.map(([category, total]) => (
                      <div key={category} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                        <span className="text-sm font-medium text-gray-700">{category}</span>
                        <span className="text-sm font-semibold text-gray-900">{formatCurrency(total)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-3 mt-3 border-t-2 border-gray-200">
                      <span className="text-base font-bold text-gray-900">Subtotal</span>
                      <span className="text-base font-bold text-gray-900">{formatCurrency(estimate.subtotal)}</span>
                    </div>
                    {estimate.tax_amount && estimate.tax_amount > 0 && (
                      <>
                        <div className="flex justify-between items-center py-2">
                          <span className="text-sm text-gray-600">Tax ({estimate.tax_rate}%)</span>
                          <span className="text-sm text-gray-600">{formatCurrency(estimate.tax_amount)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                          <span className="text-base font-bold text-gray-900">Total</span>
                          <span className="text-base font-bold text-blue-600">{formatCurrency(estimate.total_amount)}</span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Line Items */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Line Items</h3>
          </div>
          
          <div className="overflow-x-auto">
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
                {estimate.tax_rate && estimate.tax_rate > 0 && (
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
          </div>
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
              Estimate Accepted
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
                Signature (required to accept)
              </label>
              <div className="border border-gray-300 rounded-lg">
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={150}
                  className="w-full h-32 rounded-lg cursor-crosshair touch-none"
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
                <p className="text-xs text-gray-500">Sign above to accept this estimate</p>
                <button
                  onClick={clearSignature}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Clear
                </button>
              </div>
            </div>

            <label className="flex items-start gap-3 text-sm text-gray-700">
              <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={signing} className="mt-1 h-4 w-4 shrink-0" />
              <span>I have reviewed this estimate and agree to the terms above.</span>
            </label>
            <button onClick={handleReject} disabled={signing} className="mt-4 text-sm text-red-600 hover:text-red-700 disabled:opacity-50">
              Reject Estimate
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
            <p className="text-gray-600">
              {estimate.status === 'rejected' 
                ? 'This estimate has been rejected.'
                : isExpired
                ? 'This estimate has expired.'
                : 'This estimate is no longer available for acceptance.'
              }
            </p>
          </div>
        )}
      </div>
      {canSign && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white px-4 pt-3 shadow-lg print:hidden" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
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