import React, { useContext } from 'react';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { PlanPanel, usePlan } from '../components/market/plan';

/** Billing & Plan: where the company stands and the buttons to start or stop the plan. */
const PlanPage: React.FC = () => {
  const { selectedOrg } = useContext(OrganizationContext);
  const organizationId = selectedOrg?.id || undefined;
  const { plan, loading } = usePlan(organizationId);
  return (
    <div className="p-4 md:p-6 max-w-2xl text-white">
      <h1 className="text-xl font-semibold mb-4">Billing &amp; Plan</h1>
      {loading ? <p className="text-sm text-gray-500">Loading…</p> : <PlanPanel organizationId={organizationId} plan={plan} />}
    </div>
  );
};

export default PlanPage;
