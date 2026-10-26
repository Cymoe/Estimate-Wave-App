import { useState, useEffect, useContext } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import type { Tables } from "../../lib/database";
import { Search, Plus } from "lucide-react";
import { formatCurrency } from "../../utils/format";
import { OrganizationContext } from "../layouts/DashboardLayout";

export function BillsList() {
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext);
  const [bills, setBills] = useState<Tables['bills'][]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && selectedOrg?.id) {
      fetchBills();
    }
  }, [user, selectedOrg?.id]);

  const fetchBills = async () => {
    if (!selectedOrg?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('bills')
        .select('*')
        .eq('organization_id', selectedOrg.id);

      if (error) throw error;
      setBills(data || []);
    } catch (error) {
      console.error('Error fetching bills:', error);
    } finally {
      setLoading(false);
    }
  };

  const createBill = async (billData: Omit<Tables['bills'], 'id' | 'created_at'>) => {
    try {
      const { error } = await supabase
        .from('bills')
        .insert(billData);

      if (error) throw error;
      fetchBills(); // Refresh the list
    } catch (error) {
      console.error('Error creating bill:', error);
    }
  };

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedOrg?.id) return;

    try {
      await createBill({
        user_id: user.id,
        organization_id: selectedOrg.id,
        amount: parseFloat(amount),
        description,
        due_date: new Date(dueDate).toISOString(),
        status: 'pending'
      });
      setAmount("");
      setDescription("");
      setDueDate("");
    } catch (error) {
      console.error("Error creating bill:", error);
    }
  };

  if (!user) {
    return <div>Please sign in to view and create bills.</div>;
  }

  const totalBills = bills.reduce((sum, bill) => sum + bill.amount, 0);
  const paidBills = bills.filter(bill => bill.status === 'paid');
  const pendingBills = bills.filter(bill => bill.status === 'pending');
  const overdueBills = bills.filter(bill => bill.status === 'overdue');
  const paidAmount = paidBills.reduce((sum, bill) => sum + bill.amount, 0);
  const pendingAmount = pendingBills.reduce((sum, bill) => sum + bill.amount, 0);

  return (
    <>
      {/* Compact Header - Price Book Style */}
      <div className="px-6 py-4 border-b border-[#333333] bg-[#121212]">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white">Bills</h1>
          <div className="flex items-center gap-3">
            <button className="p-2 hover:bg-[#1E1E1E] rounded-[4px] transition-colors">
              <Search className="h-5 w-5 text-gray-400" />
            </button>
            <button
              onClick={() => {/* Add bill modal logic */}}
              className="bg-[#336699] hover:bg-[#2a5580] text-white p-2 rounded-full transition-colors"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-8 text-sm">
          <div>
            <span className="text-gray-400">Bills: </span>
            <span className="text-white font-medium">{bills.length}</span>
            <span className="text-gray-500 ml-1">({formatCurrency(totalBills)})</span>
          </div>
          <div>
            <span className="text-gray-400">Pending: </span>
            <span className="text-[#5b8fc7] font-medium">{formatCurrency(pendingAmount)}</span>
          </div>
          <div>
            <span className="text-gray-400">Paid: </span>
            <span className="text-[#388E3C] font-medium">{formatCurrency(paidAmount)}</span>
          </div>
          <div>
            <span className="text-gray-400">Overdue: </span>
            <span className="text-[#D32F2F] font-medium">{overdueBills.length}</span>
          </div>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
          </div>
        ) : (
        <div>
        
        {/* Create Bill Form */}
        <form onSubmit={handleSubmit} className="mb-8 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Amount</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-700"
              required
            />
          </div>
          <button
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Add Bill
          </button>
        </form>

        {/* Bills List */}
        <div className="space-y-4">
          {bills.map((bill) => (
            <div
              key={bill.id}
              className="p-4 border rounded shadow-sm hover:shadow-md transition-shadow dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold">{bill.description}</h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Due: {new Date(bill.due_date).toLocaleDateString()}
                  </p>
                  <span className={`inline-block px-2 py-1 text-xs rounded-full mt-2 ${
                    bill.status === 'paid' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                    bill.status === 'overdue' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                  }`}>
                    {bill.status.charAt(0).toUpperCase() + bill.status.slice(1)}
                  </span>
                </div>
                <p className="text-lg font-bold">${bill.amount.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
              </div>
        )}
      </div>
    </>
  );
}
