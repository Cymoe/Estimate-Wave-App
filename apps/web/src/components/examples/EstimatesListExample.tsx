/**
 * Example: Estimates List with MongoDB Backend
 * 
 * This replaces Supabase queries with MongoDB API
 * 
 * BEFORE (Supabase):
 * const { data, error } = await supabase
 *   .from('estimates')
 *   .select('*')
 *   .eq('organization_id', orgId);
 * 
 * AFTER (MongoDB):
 * const { estimates, loading, error } = useEstimates(orgId);
 */

import { useEstimates } from '@/hooks/useEstimates';
import { useRealtime } from '@/hooks/useRealtime';

interface EstimatesListExampleProps {
  organizationId: string;
}

export function EstimatesListExample({ organizationId }: EstimatesListExampleProps) {
  // Fetch estimates from MongoDB
  const { estimates, loading, error, createEstimate } = useEstimates(organizationId);

  // Real-time updates
  const { connected, latestActivity } = useRealtime(organizationId, (event) => {
    if (event.resourceType === 'estimate') {
      console.log('📊 Estimate activity:', event.action, event.details);
      // Optionally refetch or update UI
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-4 border-professional-blue border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-warning-red/10 border border-warning-red rounded-md p-4">
        <p className="text-warning-red">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className="flex items-center gap-2 text-sm">
        <div className={`h-2 w-2 rounded-full ${connected ? 'bg-success-green' : 'bg-neutral-gray'}`}></div>
        <span className="text-white/60">
          {connected ? 'Real-time connected' : 'Connecting...'}
        </span>
      </div>

      {/* Estimates List */}
      <div className="space-y-3">
        {estimates.length === 0 ? (
          <div className="text-center py-12 text-white/60">
            <p>No estimates yet</p>
            <button
              onClick={() => console.log('Create estimate')}
              className="mt-4 px-4 py-2 bg-action-yellow text-black rounded-md hover:bg-action-yellow/80"
            >
              Create First Estimate
            </button>
          </div>
        ) : (
          estimates.map((estimate) => (
            <div
              key={estimate._id}
              className="bg-slate-gray border border-white/10 rounded-lg p-4 hover:border-professional-blue/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-white font-medium">
                      {estimate.estimateNumber}
                    </h3>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      estimate.status === 'accepted' ? 'bg-success-green/20 text-success-green' :
                      estimate.status === 'sent' ? 'bg-professional-blue/20 text-professional-blue' :
                      estimate.status === 'rejected' ? 'bg-warning-red/20 text-warning-red' :
                      'bg-neutral-gray/20 text-neutral-gray'
                    }`}>
                      {estimate.status}
                    </span>
                  </div>
                  
                  {estimate.title && (
                    <p className="text-white/80 mb-1">{estimate.title}</p>
                  )}
                  
                  <p className="text-white/60 text-sm">
                    {estimate.items.length} items
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-2xl font-bold text-success-green font-mono">
                    ${estimate.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-white/60 text-sm">
                    Subtotal: ${estimate.subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-white/60 text-sm">
                    Tax ({estimate.taxRate}%): ${estimate.taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Items Preview */}
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="space-y-1">
                  {estimate.items.slice(0, 3).map((item) => (
                    <div key={item._id} className="flex justify-between text-sm">
                      <span className="text-white/80">{item.description}</span>
                      <span className="text-white/60 font-mono">
                        ${item.totalPrice.toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {estimate.items.length > 3 && (
                    <div className="text-white/40 text-sm">
                      +{estimate.items.length - 3} more items
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Latest Activity */}
      {latestActivity && (
        <div className="bg-professional-blue/10 border border-professional-blue/30 rounded-md p-3">
          <p className="text-white/80 text-sm">
            <span className="text-professional-blue font-medium">Latest:</span>{' '}
            {latestActivity.action} {latestActivity.resourceType}
          </p>
        </div>
      )}
    </div>
  );
}

