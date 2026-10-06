import React from 'react';
import { FileText } from 'lucide-react';

const Templates: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
      <FileText className="w-16 h-16 mb-4 text-gray-400" />
      <h2 className="text-xl font-semibold mb-2">Templates Coming Soon</h2>
      <p className="text-center max-w-md">
        Create reusable templates for estimates, invoices, and service packages to streamline your workflow.
      </p>
    </div>
  );
};

export default Templates;